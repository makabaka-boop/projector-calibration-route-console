import { useState } from 'react';
import { type CalibrationPlan } from '../solver/plan';
import {
  type ExecutionState,
  confirmNext,
  deltaVsOriginal,
  finishReturn,
  projectedTotal,
  startExecution,
} from '../solver/execution';

interface ExecutionConsoleProps {
  plan: CalibrationPlan;
  /** 放弃当前执行（计划不变） */
  onAbort: () => void;
}

/** 执行台：精确原计划 + 现场改序后每拍精确重排最短后缀。 */
export function ExecutionConsole({ plan, onAbort }: ExecutionConsoleProps) {
  const [state, setState] = useState<ExecutionState>(() => startExecution(plan));
  const [error, setError] = useState<string>('');

  function confirm(pose: number) {
    try {
      setState((s) => confirmNext(s, pose));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function goHome() {
    try {
      setState((s) => finishReturn(s));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const delta = deltaVsOriginal(state);
  const projected = projectedTotal(state);
  const dim = plan.n + 1;
  const edgeAt = (a: number, b: number) => plan.matrixFlat[a * dim + b]!;
  const recommendedNext = state.suffix.sequence[0];

  return (
    <div>
      <div className="panel">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>
            执行台（N={plan.n}）
            {!state.finished && state.visited.length === 0 && (
              <span className="badge warn">待开始：从停放位 0 出发</span>
            )}
            {!state.finished && state.visited.length > 0 && (
              <span className="badge good">
                执行中：已确认 {state.visited.length}/{plan.n}
              </span>
            )}
            {state.finished && <span className="badge good">已回到停放位 0，结案</span>}
          </h2>
          <button className="btn" onClick={onAbort}>
            放弃执行，返回编辑
          </button>
        </div>

        <div className="metric-grid">
          <div className="metric">
            <div className="label">原计划总耗时（精确最优）</div>
            <div className="value">{state.original.cost}</div>
          </div>
          <div className="metric">
            <div className="label">已发生费用</div>
            <div className="value">{state.incurred}</div>
          </div>
          <div className="metric">
            <div className="label">预计完工（已发生+最短后缀）</div>
            <div className="value">{projected}</div>
          </div>
          <div className="metric">
            <div className="label">相对原计划增量</div>
            <div className={`value ${delta > 0 ? 'bad' : 'good'}`}>
              {delta > 0 ? `+${delta}` : `${delta}`}
            </div>
          </div>
          <div className="metric">
            <div className="label">当前最短后缀耗时（含回 0）</div>
            <div className="value">{state.suffix.cost}</div>
          </div>
          <div className="metric">
            <div className="label">本拍求解耗时</div>
            <div className="value" style={{ fontSize: 15 }}>
              {state.suffix.solveMs.toFixed(1)} ms
            </div>
          </div>
        </div>

        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>原计划（字典序最小的最优路线）</h3>
        <RouteLine
          tour={state.original.tour}
          edgeAt={edgeAt}
          visited={new Set()}
        />
      </div>

      <div className="panel">
        <h3>实际已走路线 + 当前最短收尾</h3>
        <RouteLine
          tour={[0, ...state.visited, ...state.suffix.sequence, 0]}
          edgeAt={edgeAt}
          visited={new Set(state.visited)}
        />
        {!state.finished && state.remaining.length > 0 && (
          <div className="hint">
            绿色姿态是当前精确后缀推荐的下一站；可确认任一未完成姿态，系统会以此姿态为新起点，
            对全部剩余姿态精确重排（非贪心、非全排列）。
          </div>
        )}
      </div>

      {!state.finished && (
        <div className="panel">
          <div className="row spread">
            <h2 style={{ margin: 0 }}>
              确认实际下一站
              <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 10 }}>
                剩余 {state.remaining.length} 个姿态
              </span>
            </h2>
            {state.remaining.length === 0 && (
              <button className="btn good" onClick={goHome}>
                全部姿态已完成，返回停放位 0（边 {state.current}→0，费用 {edgeAt(state.current, 0)}）
              </button>
            )}
          </div>

          {state.remaining.length > 0 && (
            <div className="pose-grid">
              {Array.from({ length: plan.n }, (_, k) => k + 1).map((pose) => {
                const done = state.visited.includes(pose);
                const recommended = pose === recommendedNext;
                const moveCost = edgeAt(state.current, pose);
                return (
                  <button
                    key={pose}
                    className={[
                      'pose-btn',
                      done ? 'done' : '',
                      recommended ? 'recommended' : '',
                    ].join(' ')}
                    disabled={done}
                    onClick={() => confirm(pose)}
                    title={
                      done
                        ? `姿态 ${pose} 已完成，不得再次确认`
                        : `确认姿态 ${pose} 为下一站，本步镜组转动费用 ${moveCost}`
                    }
                  >
                    <span className="pose-id">姿态 {pose}</span>
                    {done ? (
                      <span className="pose-meta">已完成 · 禁用</span>
                    ) : recommended ? (
                      <span className="pose-meta">
                        ★ 精确后缀推荐 · 本步费用 {moveCost}
                      </span>
                    ) : (
                      <span className="pose-meta">
                        本步费用 {moveCost} · 点击确认并精确重排
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {state.finished && (
        <div className="panel">
          <h3>最终台账</h3>
          <table className="ledger">
            <tbody>
              <tr>
                <th>实际完整路线</th>
                <td className="num">{[0, ...state.visited, 0].join(' → ')}</td>
              </tr>
              <tr>
                <th>实际总耗时</th>
                <td className="num">{state.incurred}</td>
              </tr>
              <tr>
                <th>原计划最优总耗时</th>
                <td className="num">{state.original.cost}</td>
              </tr>
              <tr>
                <th>现场改序造成的额外耗时</th>
                <td className="num">{delta > 0 ? `+${delta}` : '0（与原计划一致）'}</td>
              </tr>
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onAbort}>
              返回编辑台
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RouteLine(props: {
  tour: number[];
  edgeAt: (a: number, b: number) => number;
  visited: Set<number>;
}) {
  const { tour, edgeAt, visited } = props;
  const unique: number[] = [];
  for (let i = 0; i < tour.length; i++) {
    if (i === 0 || tour[i] !== tour[i - 1]) unique.push(tour[i]!);
  }
  return (
    <div className="route-line">
      {unique.map((node, idx) => {
        const next = unique[idx + 1];
        const isHome = node === 0;
        const isDone = visited.has(node);
        return (
          <span key={idx}>
            <span className={['node', isHome ? 'home' : '', isDone ? 'done' : ''].join(' ')}>
              {isHome ? '0 停放' : node}
            </span>
            {next !== undefined && (
              <>
                <span className="arrow">→</span>
                <span className="edgecost">[{edgeAt(node, next)}]</span>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
