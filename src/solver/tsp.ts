/**
 * 非对称旅行商精确求解：Held–Karp 动态规划。
 *
 * 不使用贪心，也不枚举全排列（m 个目标的排列数 m! 不可接受）。
 *
 * 状态定义（g 表，按“从某点出发并回家”的视角，便于执行中以新起点重排）：
 *   g[mask][i] = 从 target[i] 出发，恰好访问 mask 中全部目标（target[i] 不在 mask 内），
 *                最后回到 home 的最小耗时。
 *   g[0][i]    = C(target[i] -> home)
 *   g[mask][i] = min_{j ∈ mask} C(target[i] -> target[j]) + g[mask \\ {j}][j]
 *
 * 答案（从 origin 出发）：
 *   min_i C(origin -> target[i]) + g[full \\ {i}][i]
 *
 * 并列时取姿态序列字典序最小者：恢复路线时每一步在“仍能达到最优总耗时”的
 * 候选中选取编号最小的姿态。targets 按升序排列，按位从低到高枚举即编号升序，
 * 首个达到最小值的候选即为字典序最小选择，逐位贪心即得到全局字典序最小最优解。
 *
 * 复杂度 O(m^2 · 2^m) 时间、O(m · 2^m) 空间；m=18 时约 500 万次状态转移、约 19 MB。
 */

export interface OptimalRoute {
  /** 目标姿态访问顺序（不含起点 origin，不含结尾的 home） */
  sequence: number[];
  /** 完整路线 */
  tour: number[];
  /** 总耗时（含最后回到 home 的边） */
  cost: number;
  /** 目标姿态数量 */
  targetCount: number;
  /** 求解耗时（毫秒） */
  solveMs: number;
}

/**
 * 无穷远哨兵。注意：g 表是 Int32Array，fill 的值必须落在有符号 32 位范围内——
 * 1_000_000_000 会被截断成 0（曾静默污染整张表），故取 10_000_000：
 * 合法路线至多 20 边 × 9999 < 200_000，哨兵加上一条边后仍远超任何真实解。
 */
export const INF = 10_000_000;

function countTrailingZeros(x: number): number {
  // x 必为正整数（32 位内）。x & -x 隔离最低置位，再数其前导零。
  // 切勿写成 31 - clz32(x)：那是最高位索引，与 x & (x-1) 的最低位清位错配。
  return 31 - Math.clz32(x & -x);
}

/**
 * @param flat    行优先展开的方阵（dim × dim）
 * @param dim     方阵边长（= n + 1）
 * @param targets 需要访问的目标编号（会被复制并按升序排列）
 * @param origin  当前起点（原计划为 0；执行改序时为刚确认的姿态）
 * @param home    最终停放位（始终为 0）
 */
export function solveOptimal(
  flat: ArrayLike<number>,
  dim: number,
  targets: ArrayLike<number>,
  origin: number,
  home: number,
): OptimalRoute {
  const started =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const m = targets.length;
  const sorted = Array.from(targets).sort((a, b) => a - b);

  const edge = (a: number, b: number): number => flat[a * dim + b]!;

  // 无目标：只剩 origin -> home 一条边（执行到最后一个姿态后，预计返回即此值）。
  if (m === 0) {
    const cost = edge(origin, home);
    return {
      sequence: [],
      tour: [origin, home],
      cost,
      targetCount: 0,
      solveMs: elapsedMs(started),
    };
  }
  if (m > 20) {
    throw new Error(`目标数量 ${m} 超出支持上限（20）`);
  }

  const size = 1 << m;
  const full = size - 1;

  // g[mask * m + i]，仅在 i ∉ mask 时有意义；密集存储换取简单索引。
  const g = new Int32Array(size * m).fill(INF);

  // 边界：mask = 0，从每个目标直接回家。
  for (let i = 0; i < m; i++) {
    g[i] = edge(sorted[i]!, home);
  }

  // 递推：去掉一个集合位后数值必然变小，故按 mask 数值升序即可保证依赖先算。
  for (let mask = 1; mask < size; mask++) {
    const rowBase = mask * m;
    let complement = full ^ mask;
    while (complement !== 0) {
      const i = countTrailingZeros(complement);
      complement &= complement - 1;

      const fromRow = sorted[i]! * dim;
      let members = mask;
      let best = INF;
      while (members !== 0) {
        const j = countTrailingZeros(members);
        members &= members - 1;

        const candidate =
          flat[fromRow + sorted[j]!]! + g[(mask ^ (1 << j)) * m + j]!;
        if (candidate < best) {
          best = candidate;
        }
      }
      g[rowBase + i] = best;
    }
  }

  // 逐位恢复字典序最小的最优路线。
  const sequence: number[] = [];
  const tour: number[] = [origin];
  let cur = origin;
  let remaining = full;
  let total = 0;

  while (remaining !== 0) {
    let chosen = -1;
    let chosenValue = INF;
    let bits = remaining; // sorted 升序 ⇒ 低位到高位即姿态编号升序
    while (bits !== 0) {
      const b = countTrailingZeros(bits);
      bits &= bits - 1;

      const value =
        edge(cur, sorted[b]!) + g[(remaining ^ (1 << b)) * m + b]!;
      if (value < chosenValue) {
        chosenValue = value;
        chosen = b;
      }
    }
    const nextPose = sorted[chosen]!;
    sequence.push(nextPose);
    tour.push(nextPose);
    total += edge(cur, nextPose);
    cur = nextPose;
    remaining &= ~(1 << chosen); // 从剩余集合移除该位（位掩码写法，避免优先级陷阱）
  }

  total += edge(cur, home);
  tour.push(home);

  return {
    sequence,
    tour,
    cost: total,
    targetCount: m,
    solveMs: elapsedMs(started),
  };
}

function elapsedMs(started: number): number {
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return now - started;
}
