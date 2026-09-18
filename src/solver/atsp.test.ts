import { describe, it, expect } from 'vitest';
import { solveOptimalRoute } from './atsp';
import { validatePlanJson } from './validate';
import { initExecution, confirmNext, allConfirmed, returnCost } from './execution';
import { generateSample, constantMatrixPlan } from './sample';
import type { CalibrationPlan } from './validate';

/* ---------------- 全排列参考实现（仅用于测试期穷举核对） ---------------- */

interface BruteResult {
  seq: number[];
  totalCost: number;
}

function bruteForce(
  cost: number[],
  size: number,
  start: number,
  visit: number[],
  baseCost: number,
): BruteResult {
  const nodes = [...visit].sort((a, b) => a - b);
  let bestCost = Infinity;
  let bestSeq: number[] | null = null;

  const permute = (prefix: number[], used: number, acc: number, prev: number) => {
    if (used === nodes.length) {
      const total = acc + cost[prev * size]; // 回停放位 0
      if (
        bestSeq === null ||
        total < bestCost ||
        (total === bestCost && lexLess(prefix, bestSeq))
      ) {
        bestCost = total;
        bestSeq = [...prefix];
      }
      return;
    }
    for (let i = 0; i < nodes.length; i++) {
      const bit = 1 << i;
      if (used & bit) continue;
      const node = nodes[i];
      const leg = used === 0 ? cost[start * size + node] : cost[prev * size + node];
      prefix.push(node);
      permute(prefix, used | bit, acc + leg, node);
      prefix.pop();
    }
  };
  permute([], 0, 0, start);

  return { seq: bestSeq!, totalCost: baseCost + bestCost };
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return a.length < b.length;
}

function shuffled<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 确定性 LCG 生成合法费用矩阵（小数字 1..9，制造大量并列机会）。 */
function makeMatrix(n: number, seed: number): { cost: number[]; size: number } {
  const size = n + 1;
  const cost = new Array(size * size);
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return 1 + (s % 9);
  };
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) cost[a * size + b] = a === b ? 0 : rand();
  }
  return { cost, size };
}

function toPlan(n: number, cost: number[]): CalibrationPlan {
  return { n, cost };
}

/* ---------------- 精确值：穷举小样本逐一核对 ---------------- */

describe('Held-Karp 精确解 —— 对全排列穷举核对', () => {
  it('N=8 多组随机非对称矩阵，路线与总费用必须与全排列一致', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const { cost, size } = makeMatrix(8, seed * 104729);
      const plan = toPlan(8, cost);
      const expected = bruteForce(cost, size, 0, Array.from({ length: 8 }, (_, i) => i + 1), 0);
      const got = solveOptimalRoute(plan.cost, 0, Array.from({ length: 8 }, (_, i) => i + 1), 0);
      expect(got.route).toEqual([0, ...expected.seq, 0]);
      expect(got.totalCost).toBe(expected.totalCost);
    }
  });

  it('非对称矩阵：顺向便宜逆向昂贵时，求解器必须察觉方向性', () => {
    // n=8：a→b 费用取“顺向步长”，逆向走法代价显著更高
    const n = 8;
    const size = n + 1;
    const cost = new Array(size * size);
    for (let a = 0; a < size; a++) {
      for (let b = 0; b < size; b++) {
        if (a === b) cost[a * size + b] = 0;
        else if (a === 0 || b === 0) cost[a * size + b] = 5;
        else {
          const forward = (b - a + n) % n;
          const steps = forward === 0 ? n : forward;
          cost[a * size + b] = steps <= n / 2 ? steps : steps * 10;
        }
      }
    }
    const got = solveOptimalRoute(cost, 0, Array.from({ length: n }, (_, i) => i + 1), 0);
    const expected = bruteForce(cost, size, 0, Array.from({ length: n }, (_, i) => i + 1), 0);
    expect(got.totalCost).toBe(expected.totalCost);
    expect(got.route).toEqual([0, ...expected.seq, 0]);
  });

  it('子问题：任意起点、任意剩余子集、任意已发生费用均与穷举一致', () => {
    const n = 8;
    for (let seed = 100; seed < 130; seed++) {
      const { cost, size } = makeMatrix(n, seed);
      const start = 1 + (seed % n);
      const all = shuffled(
        Array.from({ length: n }, (_, i) => i + 1).filter((x) => x !== start),
        seed * 7,
      );
      // 随机保留一个子集作为“剩余姿态”
      const visit = all.filter((_, idx) => ((seed >> (idx % 17)) ^ idx) % 3 !== 0);
      if (visit.length === 0) continue;
      const baseCost = 500 + seed;
      const expected = bruteForce(cost, size, start, visit, baseCost);
      // visit 故意乱序传入，结果必须与升序一致
      const got = solveOptimalRoute(cost, start, shuffled(visit, seed * 31), baseCost);
      expect(got.route).toEqual([start, ...expected.seq, 0]);
      expect(got.totalCost).toBe(expected.totalCost);
    }
  });

  it('手工算例：4 节点矩阵的精确值', () => {
    // 0 停放位 + 3 姿态
    const m = [
      [0, 10, 15, 20],
      [5, 0, 12, 7],
      [8, 9, 0, 11],
      [6, 13, 4, 0],
    ];
    const cost = m.flat();
    // 全排列核对：
    // 1-2-3: 10+12+4+6=32 ; 1-3-2: 10+7+4? 1->3=7,3->2=4,2->0=8 =>29
    // 2-1-3: 15+9+7+6=37 ; 2-3-1: 15+11+4? 3->1=13? 逐一枚举交给参考实现
    const got = solveOptimalRoute(cost, 0, [1, 2, 3], 0);
    const expected = bruteForce(cost, 4, 0, [1, 2, 3], 0);
    expect(got.totalCost).toBe(expected.totalCost);
    expect(got.route).toEqual([0, ...expected.seq, 0]);
    // 直接核对已知最优：0-1-3-2-0 = 10+7+4+8 = 29
    expect(got.totalCost).toBe(29);
    expect(got.route).toEqual([0, 1, 3, 2, 0]);
  });

  it('空剩余集合：只算当前位置回停放位', () => {
    const n = 8;
    const { cost } = makeMatrix(n, 7);
    const got = solveOptimalRoute(cost, 5, [], 123);
    expect(got.route).toEqual([5, 0]);
    expect(got.totalCost).toBe(123 + cost[5 * 9]);
  });
});

/* ---------------- 字典序平局 ---------------- */

describe('并列时姿态序列字典序最小', () => {
  it('全 1 费用矩阵：任意路线等价，必须输出 1,2,...,N', () => {
    for (const n of [8, 9, 10, 12]) {
      const plan = constantMatrixPlan(n);
      const got = solveOptimalRoute(plan.cost, 0, Array.from({ length: n }, (_, i) => i + 1), 0);
      expect(got.route).toEqual([0, ...Array.from({ length: n }, (_, i) => i + 1), 0]);
      expect(got.totalCost).toBe(n + 1);
    }
  });

  it('高并列矩阵的所有子问题也取字典序最小（穷举核对 n=8 全部 256 个子集）', () => {
    const n = 8;
    const size = n + 1;
    const plan = constantMatrixPlan(n);
    const all = Array.from({ length: n }, (_, i) => i + 1);
    for (let mask = 1; mask < 1 << n; mask++) {
      const visit = all.filter((_, i) => mask & (1 << i));
      const start = 1 + ((mask * 13) % n);
      const expected = bruteForce(plan.cost, size, start, visit, 0);
      const got = solveOptimalRoute(plan.cost, start, visit, 0);
      expect(got.route).toEqual([start, ...expected.seq, 0]);
      expect(got.totalCost).toBe(expected.totalCost);
    }
  });

  it('随机小费用矩阵（并列密集）：平局选择与穷举一致', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { cost, size } = makeMatrix(8, seed + 999);
      const visit = Array.from({ length: 8 }, (_, i) => i + 1);
      const expected = bruteForce(cost, size, 0, visit, 0);
      const got = solveOptimalRoute(cost, 0, visit, 0);
      expect(got.totalCost).toBe(expected.totalCost);
      expect(got.route).toEqual([0, ...expected.seq, 0]);
    }
  });
});

/* ---------------- 现场逐步偏离：每次最优后缀、累计费用、回 0 ---------------- */

describe('执行台：逐步偏离原路线后的精确重排', () => {
  it('每确认一站：累计费用精确、剩余后缀为该点出发的全局最优，且已完成姿态不再可选', () => {
    const n = 8;
    for (let seed = 3; seed <= 6; seed++) {
      const { cost, size } = makeMatrix(n, seed * 131);
      const plan = toPlan(n, cost);
      let exec = initExecution(plan);

      const expected0 = bruteForce(cost, size, 0, Array.from({ length: n }, (_, i) => i + 1), 0);
      expect(exec.suffix.route).toEqual([0, ...expected0.seq, 0]);
      expect(exec.suffix.totalCost).toBe(expected0.totalCost);
      expect(exec.spent).toBe(0);

      // 故意偏离：每步都不按推荐下一站，而选推荐路线中的“最后一个姿态”
      let step = 0;
      while (!allConfirmed(exec)) {
        const recommended = exec.suffix.route[1];
        let choice = exec.suffix.route[exec.suffix.route.length - 2];
        if (choice === recommended && exec.remaining.length > 1) {
          choice = exec.remaining.find((p) => p !== recommended)!;
        }

        const spentBefore = exec.spent;
        const prevNode = step === 1 ? 0 : exec.visited[step - 2];
        exec = confirmNext(exec, plan, choice);
        step++;

        // 实际费用累加：上一节点 → 本次确认姿态
        expect(exec.spent).toBe(spentBefore + cost[prevNode * size + choice]);
        // 已完成姿态不得再次确认
        expect(exec.remaining).not.toContain(choice);
        expect(() => confirmNext(exec, plan, choice)).toThrow();

        // 剩余后缀必须是从当前位置出发的精确最优（穷举核对）
        const expected = bruteForce(cost, size, exec.current, exec.remaining, 0);
        expect(exec.suffix.route).toEqual([exec.current, ...expected.seq, 0]);
        expect(exec.suffix.totalCost).toBe(expected.totalCost);

        // 预计完工总费用 = 已发生 + 最优后缀
        expect(exec.spent + exec.suffix.totalCost).toBe(exec.spent + expected.totalCost);
      }

      // 最终只剩回程并核对总额
      expect(exec.remaining).toEqual([]);
      expect(exec.visited).toHaveLength(n);
      const back = returnCost(exec, plan);
      const finalTotal = exec.spent + back;
      expect(exec.suffix.route).toEqual([exec.current, 0]);
      expect(exec.suffix.totalCost).toBe(back);
      // 实际走过的完整路线重算一遍费用
      const walked = [0, ...exec.visited, 0];
      let recomputed = 0;
      for (let i = 0; i < walked.length - 1; i++) recomputed += cost[walked[i] * size + walked[i + 1]];
      expect(finalTotal).toBe(recomputed);
    }
  });

  it('完全按推荐路线执行：预计总费用始终等于原计划，增量为 0', () => {
    const { cost } = makeMatrix(8, 4242);
    const plan = toPlan(8, cost);
    let exec = initExecution(plan);
    const originalTotal = exec.suffix.totalCost;
    while (!allConfirmed(exec)) {
      const next = exec.suffix.route[1];
      exec = confirmNext(exec, plan, next);
      expect(exec.spent + exec.suffix.totalCost).toBe(originalTotal);
    }
    expect(exec.spent + returnCost(exec, plan)).toBe(originalTotal);
  });
});

/* ---------------- 输入校验：整批拒绝 ---------------- */

describe('计划 JSON 校验：任一缺项或越界则整批拒绝', () => {
  const validRow = (size: number, zeroAt: number) =>
    Array.from({ length: size }, (_, b) => (b === zeroAt ? 0 : 100));

  const validMatrix = (n: number) =>
    JSON.stringify({ n, matrix: Array.from({ length: n + 1 }, (_, a) => validRow(n + 1, a)) });

  it('合法计划通过并展平为 (n+1)^2 数组', () => {
    const r = validatePlanJson(validMatrix(8));
    expect(r.ok).toBe(true);
    expect(r.plan!.n).toBe(8);
    expect(r.plan!.cost).toHaveLength(81);
    expect(r.errors).toEqual([]);
  });

  it('裸方阵可推断 n', () => {
    const n = 8;
    const matrix = Array.from({ length: n + 1 }, (_, a) => validRow(n + 1, a));
    const r = validatePlanJson(JSON.stringify(matrix));
    expect(r.ok).toBe(true);
    expect(r.plan!.n).toBe(8);
  });

  it('n 越界（7 与 19）拒绝', () => {
    expect(validatePlanJson(validMatrix(7)).ok).toBe(false);
    expect(validatePlanJson(validMatrix(19)).ok).toBe(false);
    expect(validatePlanJson(validMatrix(8.5)).ok).toBe(false);
  });

  it('主对角线非 0、非对角 0、越界、小数均拒绝', () => {
    const n = 8;
    const size = n + 1;
    const base = Array.from({ length: size }, (_, a) => validRow(size, a));
    const clone = () => base.map((r) => [...r]);

    let m = clone();
    m[3][3] = 1;
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    m = clone();
    m[1][2] = 0;
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    m = clone();
    m[1][2] = 10000;
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    m = clone();
    m[1][2] = -5;
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    m = clone();
    m[1][2] = 12.5;
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);
  });

  it('null、字符串、布尔、缺项、行列不符、坏 JSON 均拒绝', () => {
    const n = 8;
    const size = n + 1;
    const good = () => Array.from({ length: size }, (_, a) => validRow(size, a));

    let m: unknown = good();
    ((m as unknown[][])[2])[3] = null;
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    m = good();
    ((m as unknown[][])[2])[3] = '7';
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    m = good();
    (m as number[][])[4] = [1, 2, 3]; // 行长度不足（缺项）
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    m = good();
    (m as number[][]).push(validRow(size, 0)); // 多一行
    expect(validatePlanJson(JSON.stringify({ n, matrix: m })).ok).toBe(false);

    expect(validatePlanJson('{not json').ok).toBe(false);
    expect(validatePlanJson('{"n":8}').ok).toBe(false);
    expect(validatePlanJson('42').ok).toBe(false);
    expect(validatePlanJson('null').ok).toBe(false);

    // 显式 n 与矩阵尺寸不符
    const m9 = good();
    expect(validatePlanJson(JSON.stringify({ n: 9, matrix: m9 })).ok).toBe(false);
  });

  it('错误信息精确到坐标，且一次给出全部问题', () => {
    const n = 8;
    const size = n + 1;
    const m = Array.from({ length: size }, (_, a) => validRow(size, a));
    m[0][0] = 3;
    m[1][2] = 0;
    m[5][6] = 99999;
    const r = validatePlanJson(JSON.stringify({ n, matrix: m }));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(3);
    expect(r.errors.join(' ')).toContain('[0][0]');
    expect(r.errors.join(' ')).toContain('[1][2]');
    expect(r.errors.join(' ')).toContain('[5][6]');
  });

  it('示例生成器产出合法可通过的计划', () => {
    expect(validatePlanJson(generateSample(8)).ok).toBe(true);
    expect(validatePlanJson(generateSample(18)).ok).toBe(true);
  });
});

/* ---------------- N=18 性能（四秒验收） ---------------- */

describe('N=18 性能：四秒内完成精确求解', () => {
  it('随机非对称矩阵：初始全局最优 < 4000ms', () => {
    const text = generateSample(18, 1);
    const plan = validatePlanJson(text).plan!;
    const t0 = performance.now();
    const got = solveOptimalRoute(plan.cost, 0, Array.from({ length: 18 }, (_, i) => i + 1), 0);
    const elapsed = performance.now() - t0;
    expect(got.route).toHaveLength(20);
    expect(new Set(got.route.slice(1, -1)).size).toBe(18);
    expect(elapsed).toBeLessThan(4000);
  });

  it('全 1 矩阵（平局最多）：字典序计算路径下 < 4000ms', () => {
    const plan = constantMatrixPlan(18);
    const t0 = performance.now();
    const got = solveOptimalRoute(plan.cost, 0, Array.from({ length: 18 }, (_, i) => i + 1), 0);
    const elapsed = performance.now() - t0;
    expect(got.route).toEqual([0, ...Array.from({ length: 18 }, (_, i) => i + 1), 0]);
    expect(elapsed).toBeLessThan(4000);
  });

  it('现场改序：逐步偏离时每一次重排（最大 m=17）均 < 4000ms', () => {
    const text = generateSample(18, 77);
    const plan = validatePlanJson(text).plan!;
    let exec = initExecution(plan);
    while (!allConfirmed(exec)) {
      const recommended = exec.suffix.route[1];
      let choice = exec.suffix.route[exec.suffix.route.length - 2];
      if (choice === recommended && exec.remaining.length > 1) {
        choice = exec.remaining.find((p) => p !== recommended)!;
      }
      const t0 = performance.now();
      exec = confirmNext(exec, plan, choice);
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(4000);
      // 每次后缀确实是合法完整收尾
      expect(exec.suffix.route[0]).toBe(exec.current);
      expect(exec.suffix.route[exec.suffix.route.length - 1]).toBe(0);
      expect(new Set(exec.suffix.route.slice(1, -1))).toEqual(new Set(exec.remaining));
    }
    expect(exec.visited).toHaveLength(18);
  });
});
