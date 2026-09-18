/**
 * 非对称旅行商（ATSP）精确求解 —— Held-Karp 动态规划。
 *
 * 节点 0 为停放位，姿态编号 1..N。cost 为一维 (N+1)*(N+1) 行优先矩阵，
 * 费用矩阵有方向性：cost[a*S+b] 是 a → b 的耗时（镜组顺/逆时针转动耗时不同）。
 *
 * 求解：从 start 出发（可含初始已发生费用 baseCost），访问 visit 中每个姿态
 * 恰好一次，最后回到 0，使总耗时最小；总耗时并列时选择完整路线中姿态序列
 * （start 之后、0 之前的部分）字典序最小者。
 *
 * 不使用贪心，也不枚举全排列：状态数 O(m·2^m)（m=|visit|），
 * N=18 时约 472 万状态，在数秒内完成。
 *
 * 平局判定：对同一掩码 mask，到达各结尾姿态的最优路径都是 mask 的一个排列。
 * 费用并列需要按“完整姿态序列字典序”决胜，因此为每个掩码内的胜出路径
 * 排序赋名次 0..k-1；名次只在 DP 转移真正遇到并列时惰性计算一次。
 * 候选路径 = 子问题(rest, p)的最优路径 + 末姿态 j，两候选前缀同为集合 rest
 * 的排列，故其字典序就是子掩码内名次次序。
 */

export interface RouteResult {
  /** 最优完整路线，首尾均为停放位 0（现场改序时起点可能是某姿态），形如 [start, ...姿态..., 0] */
  route: number[];
  /** 最优总耗时（含 baseCost） */
  totalCost: number;
}

/**
 * @param cost     (N+1) 阶方阵的一维行优先数据，N=8..18，已通过校验
 * @param start    起点节点（初始为 0；现场改序时为刚确认的姿态）
 * @param visit    尚未访问、必须各访问一次的姿态编号集合
 * @param baseCost 已发生费用（start 为实际到达的姿态时，包含上一节点 → start）
 */
export function solveOptimalRoute(
  cost: number[] | Int32Array,
  start: number,
  visit: ReadonlyArray<number>,
  baseCost: number,
): RouteResult {
  const size = Math.round(Math.sqrt(cost.length));
  const nodes = [...visit].sort((a, b) => a - b);
  const m = nodes.length;

  // 无剩余姿态：直接从起点回停放位
  if (m === 0) {
    return { route: [start, 0], totalCost: baseCost + cost[start * size] };
  }

  // 全局姿态编号 → 本问题内的本地位下标（visit 可能是 1..N 的任意子集）
  const localIndex = new Int8Array(size).fill(-1);
  nodes.forEach((global, local) => {
    localIndex[global] = local;
  });

  const M = 1 << m;
  // dp[mask*m+j]：从 start 出发、恰访问 mask 中姿态且以 nodes[j] 结尾的最小费用
  const dp = new Int32Array(M * m).fill(INF);
  // 对应最优路径上直接前驱姿态的全局编号；-1 表示首姿态（前驱为 start），-2 表示不可达
  const parent = new Int8Array(M * m).fill(-2);
  // rank[mask*m+j]：本掩码内胜出路径按完整姿态序列字典序的名次；-1 表示尚未计算
  const rank = new Int8Array(M * m).fill(-1);

  // 边界：单姿态掩码
  for (let j = 0; j < m; j++) {
    const idx = (1 << j) * m + j;
    dp[idx] = cost[start * size + nodes[j]];
    parent[idx] = -1;
  }

  // 数值递增枚举掩码：去掉任一置位位得到的子掩码必然更小，故天然拓扑有序
  for (let mask = 1; mask < M; mask++) {
    let bits = mask;
    while (bits) {
      const jBit = bits & -bits;
      const j = 31 - Math.clz32(jBit);
      bits ^= jBit;

      let best = INF;
      let bestP = -2;
      let bestRank = -1;
      const rest = mask ^ jBit;

      let pbits = rest;
      while (pbits) {
        const pBit = pbits & -pbits;
        const p = 31 - Math.clz32(pBit);
        pbits ^= pBit;

        const prevIdx = rest * m + p;
        const prev = dp[prevIdx];
        if (prev === INF) continue;
        const candidate = prev + cost[nodes[p] * size + nodes[j]];

        if (candidate < best) {
          best = candidate;
          bestP = nodes[p];
          bestRank = -1;
        } else if (candidate === best) {
          // 费用并列：两候选路径覆盖集合相同（都是 mask），末姿态同为 j，
          // 字典序由前缀决定，即各前驱在子掩码 rest 内的名次
          if (bestRank === -1) {
            ensureRanks(rest);
            bestRank = rank[rest * m + localIndex[bestP]];
          }
          const candidateRank = rank[prevIdx];
          if (candidateRank < bestRank) {
            bestP = nodes[p];
            bestRank = candidateRank;
          }
        }
      }

      if (best !== INF) {
        const idx = mask * m + j;
        dp[idx] = best;
        parent[idx] = bestP;
      }
    }
  }

  const full = M - 1;

  // 闭合：从末尾姿态回停放位 0；按费用、再按完整姿态序列字典序决胜
  let endLocal = 0;
  let bestClose = INF;
  let bestCloseRank = -1;
  for (let j = 0; j < m; j++) {
    const tail = dp[full * m + j];
    if (tail === INF) continue;
    const candidate = tail + cost[nodes[j] * size];
    if (candidate < bestClose) {
      bestClose = candidate;
      endLocal = j;
      bestCloseRank = -1;
    } else if (candidate === bestClose) {
      if (bestCloseRank === -1) {
        ensureRanks(full);
        bestCloseRank = rank[full * m + endLocal];
      }
      if (rank[full * m + j] < bestCloseRank) {
        endLocal = j;
        bestCloseRank = rank[full * m + j];
      }
    }
  }

  // 沿 parent 链回溯完整姿态序列
  const seq = new Array<number>(m);
  let curMask = full;
  let curNode = endLocal;
  for (let k = m - 1; k >= 0; k--) {
    seq[k] = nodes[curNode];
    const p = parent[curMask * m + curNode];
    curMask ^= 1 << curNode;
    curNode = localIndex[p]; // p === -1 时 localIndex[-1] 也是 -1，下一轮不再使用
  }

  return {
    route: [start, ...seq, 0],
    totalCost: baseCost + bestClose,
  };

  /**
   * 惰性计算掩码 maskValue 内所有可达胜出路径的字典序名次（一次性整掩码计算）。
   * 路径覆盖集合相同，直接沿 parent 链重建完整姿态序列，按数组字典序排序赋名次。
   */
  function ensureRanks(maskValue: number): void {
    const ends: number[] = [];
    let eb = maskValue;
    while (eb) {
      const bit = eb & -eb;
      const j = 31 - Math.clz32(bit);
      eb ^= bit;
      if (dp[maskValue * m + j] !== INF) ends.push(j);
    }
    if (ends.length === 0 || rank[maskValue * m + ends[0]] !== -1) return;

    const sequences = ends.map((j) => rebuildSequence(maskValue, j));
    const order = ends.map((_, i) => i);
    order.sort((a, b) => {
      const sa = sequences[a];
      const sb = sequences[b];
      for (let k = 0; k < sa.length; k++) {
        if (sa[k] !== sb[k]) return sa[k] - sb[k];
      }
      return 0;
    });
    for (let r = 0; r < order.length; r++) {
      rank[maskValue * m + ends[order[r]]] = r;
    }
  }

  /** 沿 parent 链重建状态 (maskValue, endLocal) 胜出路径的完整姿态序列（升序排列）。 */
  function rebuildSequence(maskValue: number, endLocal: number): number[] {
    const length = bitCount(maskValue);
    const out = new Array<number>(length);
    let mask = maskValue;
    let node = endLocal;
    for (let k = length - 1; ; k--) {
      out[k] = nodes[node];
      const pGlobal = parent[mask * m + node];
      if (pGlobal === -1) break;
      mask ^= 1 << node;
      node = localIndex[pGlobal];
    }
    return out;
  }
}

const INF = 1 << 30;

function bitCount(x: number): number {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}
