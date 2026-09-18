import { useMemo, useState } from 'react';
import type { CalibrationPlan } from '../solver/validate';

interface PlanEditorProps {
  initialText: string;
  /** 整批拒绝时保留旧计划：onApply 只在校验通过后被调用 */
  onApply: (plan: CalibrationPlan, text: string) => void;
  onSample: (n: number) => string;
}

/**
 * 计划编辑/导入台：
 * - 直接编辑 JSON 文本，或从文件导入 .json；
 * - 校验失败时错误就地显示在编辑器下方，旧计划不受影响；
 * - 校验通过后“采用计划”按钮才会替换当前计划。
 */
export default function PlanEditor({ initialText, onApply, onSample }: PlanEditorProps) {
  const [text, setText] = useState(initialText);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>('');
  const fileInputId = 'plan-import-file';

  const parsed = useMemo(() => {
    try {
      const v = JSON.parse(text) as unknown;
      const matrix = Array.isArray(v)
        ? v
        : v && typeof v === 'object'
          ? ((v as Record<string, unknown>).matrix ?? (v as Record<string, unknown>).costs)
          : undefined;
      return Array.isArray(matrix) ? { rows: matrix.length } : null;
    } catch {
      return null;
    }
  }, [text]);

  const apply = () => {
    setNotice('');
    // 动态引入校验器，避免顶层循环
    void import('../solver/validate').then(({ validatePlanJson }) => {
      const result = validatePlanJson(text);
      if (!result.ok || !result.plan) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      onApply(result.plan, text);
      setNotice(`已采用计划：N=${result.plan.n}，费用矩阵 ${result.plan.n + 1}×${result.plan.n + 1}`);
    });
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setErrors([]);
      setNotice(`已导入文件 ${file.name}，请核对后点击“采用计划”`);
    };
    reader.onerror = () => setErrors([`文件读取失败：${reader.error?.message ?? '未知错误'}`]);
    reader.readAsText(file);
  };

  return (
    <section className="panel editor">
      <h2>计划编辑 / 导入</h2>
      <p className="hint">
        JSON 形态：<code>{'{"n": 8..18, "matrix": [[0,...], ...]}'}</code>
        ，矩阵为 (n+1)×(n+1)；0 为停放位，主对角线必须为 0，其余项为 1–9999
        的整数（有方向性，matrix[a][b] 为 a→b 耗时）。任一缺项或越界将整批拒绝并保留旧计划。
      </p>

      <textarea
        className="json-input"
        spellCheck={false}
        rows={14}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErrors([]);
          setNotice('');
        }}
        placeholder='{"n": 8, "matrix": [[0, 10, ...], ...]}'
      />

      <div className="toolbar">
        <button type="button" onClick={apply}>
          采用计划
        </button>
        <label className="file-button" htmlFor={fileInputId}>
          导入 JSON 文件
          <input
            id={fileInputId}
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {[8, 12, 18].map((n) => (
          <button
            key={n}
            type="button"
            className="secondary"
            onClick={() => {
              setText(onSample(n));
              setErrors([]);
              setNotice(`已填入 N=${n} 的合法示例，采用后生效`);
            }}
          >
            示例 N={n}
          </button>
        ))}
        {parsed && <span className="meta">当前文本：{parsed.rows} 行矩阵</span>}
      </div>

      {errors.length > 0 && (
        <div className="errors" role="alert">
          <strong>整批拒绝（{errors.length} 项问题），旧计划保留：</strong>
          <ul>
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && <div className="notice">{notice}</div>}
    </section>
  );
}
