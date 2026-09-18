import type { CalibrationPlan } from './validate';
import { solveOptimalRoute, type RouteResult } from './atsp';

/**
 * 执行台状态：
 * - route 为“当前最优收尾路线”，route[0] 是当前所在节点，末尾必为 0；
 * - 工程师确认任一未完成姿态 x 后，立即支付 当前节点→x 的实际费用，
 *   再以 x 为新起点对全部剩余姿态精确重排；
 * - 已确认姿态从待办集合移除，不可再次确认；
 * - 全部姿态确认完后只剩 x→0 的回程（仍由求解器精确给出）。
 */
export interface ExecutionState {
  /** 当前所在节点：初始为 0，之后为最近确认的姿态 */
  current: number;
  /** 已确认完成的姿态，按确认顺序 */
  visited: number[];
  /** 尚未访问的姿态 */
  remaining: number[];
  /** 截至当前位置已发生的费用（停放位/上一姿态 → 当前节点的费用已计入） */
  spent: number;
  /** 从当前位置出发的最优收尾路线（含末尾回 0） */
  suffix: RouteResult;
}

/** 基于已批准计划建立初始执行状态（从 0 出发的全局最优路线）。 */
export function initExecution(plan: CalibrationPlan): ExecutionState {
  const all = Array.from({ length: plan.n }, (_, i) => i + 1);
  const suffix = solveOptimalRoute(plan.cost, 0, all, 0);
  return {
    current: 0,
    visited: [],
    remaining: all,
    spent: 0,
    suffix,
  };
}

/**
 * 确认 pose 为实际下一站：
 * 支付当前节点 → pose 的费用，以 pose 为新起点对剩余姿态精确重排。
 * 已完成姿态不在 remaining 中，调用方应禁用其按钮（重复确认会抛错）。
 */
export function confirmNext(state: ExecutionState, plan: CalibrationPlan, pose: number): ExecutionState {
  if (!state.remaining.includes(pose)) {
    throw new Error(`姿态 ${pose} 已完成或不存在，不能再次确认`);
  }
  const size = plan.n + 1;
  const legCost = plan.cost[state.current * size + pose];
  const remaining = state.remaining.filter((p) => p !== pose);
  const suffix = solveOptimalRoute(plan.cost, pose, remaining, 0);
  return {
    current: pose,
    visited: [...state.visited, pose],
    remaining,
    spent: state.spent + legCost,
    suffix,
  };
}

/** 当前位置直接回停放位的费用（最后一个姿态确认后即为待付回程）。 */
export function returnCost(state: ExecutionState, plan: CalibrationPlan): number {
  return plan.cost[state.current * (plan.n + 1)];
}

/** 全部姿态确认完毕（只剩回程）。 */
export function allConfirmed(state: ExecutionState): boolean {
  return state.remaining.length === 0;
}
