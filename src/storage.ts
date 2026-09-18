import type { CalibrationPlan } from './solver/validate';

/**
 * 数据只留在浏览器：计划文本、已批准计划、执行进度均存 localStorage，
 * 不向任何后端发送。执行状态由“已确认姿态序列”确定性重建（重放 confirmNext）。
 */
const KEYS = {
  text: 'dcc.planText.v1',
  plan: 'dcc.plan.v1',
  visited: 'dcc.visited.v1',
  returned: 'dcc.returned.v1',
};

export interface PersistedState {
  text: string | null;
  plan: CalibrationPlan | null;
  visited: number[];
  returned: boolean;
}

export function loadState(): PersistedState {
  try {
    const planText = localStorage.getItem(KEYS.text);
    const planRaw = localStorage.getItem(KEYS.plan);
    const visitedRaw = localStorage.getItem(KEYS.visited);
    const returned = localStorage.getItem(KEYS.returned) === '1';
    const plan = planRaw ? (JSON.parse(planRaw) as CalibrationPlan) : null;
    const visited = visitedRaw ? (JSON.parse(visitedRaw) as number[]) : [];
    if (plan && (!Array.isArray(plan.cost) || plan.cost.length !== (plan.n + 1) ** 2)) {
      return { text: planText, plan: null, visited: [], returned: false };
    }
    return { text: planText, plan, visited: Array.isArray(visited) ? visited : [], returned };
  } catch {
    return { text: null, plan: null, visited: [], returned: false };
  }
}

export function saveText(text: string): void {
  localStorage.setItem(KEYS.text, text);
}

export function savePlan(plan: CalibrationPlan): void {
  localStorage.setItem(KEYS.plan, JSON.stringify(plan));
}

export function saveProgress(visited: number[], returned: boolean): void {
  localStorage.setItem(KEYS.visited, JSON.stringify(visited));
  localStorage.setItem(KEYS.returned, returned ? '1' : '0');
}

export function clearProgress(): void {
  localStorage.removeItem(KEYS.visited);
  localStorage.removeItem(KEYS.returned);
}
