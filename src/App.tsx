import { useState } from 'react';
import { type CalibrationPlan, createDefaultPlan } from './solver/plan';
import { solveOptimal } from './solver/tsp';
import { MatrixEditor } from './components/MatrixEditor';
import { ExecutionConsole } from './components/ExecutionConsole';
import { loadPlan, savePlan } from './state/storage';

type Tab = 'edit' | 'execute';

export function App() {
  const [plan, setPlan] = useState<CalibrationPlan>(() => {
    const fallback = createDefaultPlan(12);
    return loadPlan(fallback);
  });
  const [tab, setTab] = useState<Tab>('edit');
  const [planVersion, setPlanVersion] = useState(0); // 进入执行台时重建执行状态

  function applyPlan(next: CalibrationPlan) {
    savePlan(next);
    setPlan(next);
  }

  function resetToDefault() {
    const fallback = createDefaultPlan(12);
    savePlan(fallback);
    setPlan(fallback);
  }

  // 当前计划的最优路线摘要（编辑台可见，证明求解器真实运行）
  const summary = solveOptimal(
    plan.matrixFlat,
    plan.n + 1,
    Array.from({ length: plan.n }, (_, k) => k + 1),
    0,
    0,
  );

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>穹幕投影机校准 · 精确路线台</h1>
          <div className="sub">
            镜组转动耗时有方向性 · 非对称 TSP 精确解（Held–Karp 动态规划，非贪心、非全排列）
            · 数据仅存本浏览器
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={resetToDefault}>
            恢复默认计划（N=12）
            </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'edit' ? 'active' : ''}`}
          onClick={() => setTab('edit')}
        >
          1. 编辑与导入
        </button>
        <button
          className={`tab ${tab === 'execute' ? 'active' : ''}`}
          onClick={() => {
            setPlanVersion((v) => v + 1);
            setTab('execute');
          }}
        >
          2. 开始执行
          </button>
      </nav>

      {tab === 'edit' && (
        <>
          <div className="panel">
            <h2>当前已生效计划的精确解</h2>
            <div className="metric-grid">
              <div className="metric">
                <div className="label">姿态数 N</div>
                <div className="value">{plan.n}</div>
              </div>
              <div className="metric">
                <div className="label">最小总耗时</div>
                <div className="value good">{summary.cost}</div>
              </div>
              <div className="metric">
                <div className="label">求解耗时</div>
                <div className="value" style={{ fontSize: 15 }}>
                  {summary.solveMs.toFixed(2)} ms
                </div>
              </div>
            </div>
            <div className="route-line" style={{ marginTop: 8 }}>
              {summary.tour.map((node, idx) => (
                <span key={idx}>
                  <span className={`node ${node === 0 ? 'home' : ''}`}>{node}</span>
                  {idx < summary.tour.length - 1 && <span className="arrow">→</span>}
                </span>
              ))}
            </div>
            <div className="hint">
              并列最优时取姿态序列字典序最小者。改完矩阵请点“校验并应用”，新结果在此即时更新。
            </div>
          </div>

          <MatrixEditor plan={plan} onApply={applyPlan} />
        </>
      )}

      {tab === 'execute' && (
        <ExecutionConsole key={planVersion} plan={plan} onAbort={() => setTab('edit')} />
      )}
    </div>
  );
}
