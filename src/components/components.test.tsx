// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatrixEditor } from './MatrixEditor';
import { ExecutionConsole } from './ExecutionConsole';
import { type CalibrationPlan, createDefaultPlan } from '../solver/plan';

function planWith(n: number, edge = 1): CalibrationPlan {
  const p = createDefaultPlan(n);
  if (edge !== 1) {
    for (let i = 0; i < p.matrixFlat.length; i++) p.matrixFlat[i] = p.matrixFlat[i] === 0 ? 0 : edge;
  }
  return p;
}

describe('MatrixEditor 组件', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('缺项使整批拒绝：就地显示错误，onApply 不被调用（旧计划保留）', () => {
    const spy = vi.fn();
    render(<MatrixEditor plan={planWith(8)} onApply={spy} />);

    // 找到 matrix[1][2] 输入并清空（制造缺项）
    const input = document.querySelector('input[aria-label="matrix[1][2]"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /校验并应用/ }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('matrix[1][2]');
    expect(alert.textContent).toContain('整批拒绝');
    expect(spy).not.toHaveBeenCalled();
  });

  it('合法编辑可以应用，且无效 JSON 就地报错', () => {
    let applied: CalibrationPlan | null = null;
    render(<MatrixEditor plan={planWith(8)} onApply={(p) => (applied = p)} />);

    // 合法改动：matrix[0][1] = 42
    const input = document.querySelector('input[aria-label="matrix[0][1]"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /校验并应用/ }));
    expect(applied).not.toBeNull();
    expect(applied!.matrixFlat[1]).toBe(42);

    // 非法 JSON
    fireEvent.change(screen.getByPlaceholderText(/n/), { target: { value: '{not json' } });
    fireEvent.click(screen.getByRole('button', { name: /解析并载入草稿/ }));
    expect(screen.getByRole('alert').textContent).toContain('JSON 语法错误');
  });

  it('越界值（10000）就地标红并被拒绝', () => {
    render(<MatrixEditor plan={planWith(8)} onApply={() => {}} />);
    const input = document.querySelector('input[aria-label="matrix[3][4]"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10000' } });
    expect(input.classList.contains('invalid')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /校验并应用/ }));
    expect(screen.getByRole('alert').textContent).toContain('matrix[3][4]');
  });

  it('对角线输入被锁定（不可编辑，恒为 0）', () => {
    render(<MatrixEditor plan={planWith(8)} onApply={() => {}} />);
    const diag = document.querySelector('input[aria-label="matrix[5][5]"]') as HTMLInputElement;
    expect(diag.disabled).toBe(true);
    expect(diag.value).toBe('0');
  });
});

describe('ExecutionConsole 组件', () => {
  beforeEach(() => localStorage.clear());

  it('确认姿态后：累计费用/预计完工更新；已完成姿态禁用，推荐站标注', () => {
    const plan = planWith(8, 5); // 每边费用 5
    render(<ExecutionConsole plan={plan} onAbort={() => {}} />);

    // 初始：已发生 0；所有姿态按钮可点
    expect(screen.getByText('已发生费用')).toBeTruthy();
    const pose3 = screen.getByTitle(/确认姿态 3/) as HTMLButtonElement;
    expect(pose3.disabled).toBe(false);

    fireEvent.click(pose3);

    // 已发生费用应为 0->3 = 5
    const metrics = screen.getAllByText('5');
    expect(metrics.length).toBeGreaterThan(0);

    // 姿态 3 现在禁用
    expect(pose3.disabled).toBe(true);
    expect(pose3.title).toContain('不得再次确认');

    // 推荐下一站（等费时字典序最小 = 1）
    const pose1 = screen.getByTitle(/确认姿态 1/) as HTMLButtonElement;
    expect(pose1.classList.contains('recommended')).toBe(true);

    // 再确认 1
    fireEvent.click(pose1);
    expect(pose1.disabled).toBe(true);

    // 已完成 3、1，剩余 6 个
    expect(screen.getByText(/剩余 6 个姿态/)).toBeTruthy();
  });

  it('偏离最优后增量为非负，全部完成后可回库并显示最终台账', () => {
    const plan = planWith(8, 7);
    render(<ExecutionConsole plan={plan} onAbort={() => {}} />);
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8]) {
      fireEvent.click(screen.getByTitle(`确认姿态 ${p} 为下一站，本步镜组转动费用 7`));
    }
    fireEvent.click(screen.getByRole('button', { name: /返回停放位/ }));
    expect(screen.getByText('已回到停放位 0，结案')).toBeTruthy();
    // 等费矩阵：实际总耗时 = 9 条边 × 7 = 63，无增量（多个指标卡均显示 63）
    expect(screen.getAllByText('63').length).toBeGreaterThan(0);
    expect(screen.getByText(/0（与原计划一致）/)).toBeTruthy();
  });

  it('禁止提前回库：未全部完成时没有回库按钮', () => {
    render(<ExecutionConsole plan={planWith(8, 1)} onAbort={() => {}} />);
    expect(screen.queryByRole('button', { name: /返回停放位/ })).toBeNull();
  });
});
