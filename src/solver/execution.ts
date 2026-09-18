/**
 * 现场执行状态机（纯函数，不依赖 React，便于验收逐拍核对）。
 *
 * 流程：
 * - startExecution：以 0 为起点算出全局最优原计划。
 * - confirmNext：工程师把任一“未完成”姿态确认为实际下一站；
 *   累加实际已发生费用，并以该姿态为新起点，对全部剩余姿态精确重排（Held–Karp），
 *   得到最短收尾路线、预计完工耗时及相对原计划的增量。
 * - finishReturn：剩余为空后，回到停放位 0，结算最终费用。
 */

import { type CalibrationPlan } from './plan';
import { solveOptimal, type OptimalRoute } from './tsp';

export interface ExecutionState {
  plan: CalibrationPlan;
  /** 原计划：从 0 出发、访问 1..N 各一次并回到 0 的最优解 */
  original: OptimalRoute;
  /** 已确认姿态（按确认顺序） */
  visited: number[];
  /** 当前所在点：初始为 0，确认后为最新姿态，回库后为 0 */
  current: number;
  /** 已实际发生的费用（已走边之和） */
  incurred: number;
  /** 尚未访问的姿态（升序） */
  remaining: number[];
  /** 从 current 出发、遍历 remaining 回到 0 的精确最优后缀 */
  suffix: OptimalRoute;
  /** 是否已回到停放位 0 结案 */
  finished: boolean;
}

export function startExecution(plan: CalibrationPlan): ExecutionState {
  const all = range1(plan.n);
  const original = solveOptimal(plan.matrixFlat, plan.n + 1, all, 0, 0);
  return {
    plan,
    original,
    visited: [],
    current: 0,
    incurred: 0,
    remaining: all,
    suffix: original,
    finished: false,
  };
}

export function confirmNext(state: ExecutionState, pose: number): ExecutionState {
  if (state.finished) {
    throw new Error('执行已结案（已回到停放位 0），不能再确认姿态');
  }
  const { n, matrixFlat } = state.plan;
  if (!Number.isInteger(pose) || pose < 1 || pose > n) {
    throw new Error(`姿态编号必须是 1—${n} 的整数，收到：${String(pose)}`);
  }
  if (state.visited.includes(pose)) {
    throw new Error(`姿态 ${pose} 已完成，已完成姿态不得再次确认`);
  }
  if (!state.remaining.includes(pose)) {
    throw new Error(`姿态 ${pose} 不在剩余列表中`);
  }

  const dim = n + 1;
  const incurred = state.incurred + matrixFlat[state.current * dim + pose]!;
  const visited = [...state.visited, pose];
  const remaining = state.remaining.filter((p) => p !== pose);
  const suffix = solveOptimal(matrixFlat, dim, remaining, pose, 0);

  return {
    ...state,
    visited,
    current: pose,
    incurred,
    remaining,
    suffix,
    finished: false,
  };
}

export function finishReturn(state: ExecutionState): ExecutionState {
  if (state.finished) {
    throw new Error('执行已结案');
  }
  if (state.remaining.length > 0) {
    throw new Error(`还有 ${state.remaining.length} 个姿态未完成，不能回库`);
  }
  const dim = state.plan.n + 1;
  const backCost = state.plan.matrixFlat[state.current * dim + 0]!;
  return {
    ...state,
    incurred: state.incurred + backCost,
    current: 0,
    suffix: { sequence: [], tour: [0, 0], cost: 0, targetCount: 0, solveMs: 0 },
    finished: true,
  };
}

/** 预计完工总耗时 = 已发生 + 当前最优后缀（含回 0） */
export function projectedTotal(state: ExecutionState): number {
  return state.incurred + state.suffix.cost;
}

/** 相对原计划的增量（正数表示偏离导致的额外耗时） */
export function deltaVsOriginal(state: ExecutionState): number {
  return projectedTotal(state) - state.original.cost;
}

export function routeCost(flat: ArrayLike<number>, dim: number, tour: number[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < tour.length; i++) {
    sum += flat[tour[i]! * dim + tour[i + 1]!]!;
  }
  return sum;
}

function range1(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) out.push(i);
  return out;
}
