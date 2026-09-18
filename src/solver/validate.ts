/**
 * 计划 JSON 校验。
 *
 * 支持两种形态：
 *   { "n": 12, "matrix": [[0, ...], ...] }   // 推荐，显式姿态数
 *   [[0, ...], ...]                            // 裸方阵，n = 边长 - 1
 *
 * 规则（任一不满足则整批拒绝，由调用方保留旧计划）：
 * - n 为 8..18 的整数；
 * - 费用矩阵为 (n+1)×(n+1) 的二维数字数组，每行长度一致；
 * - 主对角线必须为 0；
 * - 其余项必须为 1..9999 的整数（0 停放位与姿态之间、姿态相互之间均如此）；
 * - 不允许 null、布尔、字符串、NaN、Infinity、缺项或多余/不足的行列。
 */

export interface CalibrationPlan {
  /** 姿态数量 n，8..18 */
  n: number;
  /** (n+1) 阶方阵的一维行优先费用，cost[a*(n+1)+b] = a → b 耗时 */
  cost: number[];
}

export interface ValidationResult {
  ok: boolean;
  plan?: CalibrationPlan;
  /** 就地展示用的错误信息（按发现顺序），ok 时为空 */
  errors: string[];
}

const MIN_N = 8;
const MAX_N = 18;
const MAX_COST = 9999;

export function validatePlanJson(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON 语法错误：${(e as Error).message}`] };
  }

  let nCandidate: number | undefined;
  let matrixCandidate: unknown;

  if (Array.isArray(parsed)) {
    matrixCandidate = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    nCandidate = readNumberField(obj, ['n', 'N']);
    const matrixField = obj.matrix ?? obj.costs ?? obj.costMatrix;
    if (matrixField === undefined) {
      return { ok: false, errors: ['缺少字段 "matrix"：需要 (n+1)×(n+1) 的费用矩阵'] };
    }
    matrixCandidate = matrixField;
  } else {
    return { ok: false, errors: ['顶层必须是对象 {"n": ..., "matrix": [...]} 或裸方阵数组'] };
  }

  if (!Array.isArray(matrixCandidate)) {
    return { ok: false, errors: ['"matrix" 必须是二维数组'] };
  }
  const rows = matrixCandidate as unknown[];
  if (rows.length === 0) {
    return { ok: false, errors: ['费用矩阵不能为空'] };
  }

  // 推断/核对 n
  let n: number;
  if (nCandidate === undefined) {
    n = rows.length - 1;
  } else {
    n = nCandidate;
  }
  const errors: string[] = [];
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) {
    errors.push(`姿态数 n 必须是 ${MIN_N}–${MAX_N} 的整数（当前为 ${formatValue(nCandidate)}）`);
    return { ok: false, errors };
  }

  const size = n + 1;
  if (rows.length !== size) {
    errors.push(`矩阵必须为 ${size}×${size}（n=${n}），实际有 ${rows.length} 行`);
  }

  // 逐格校验
  const cost: number[] = [];
  for (let a = 0; a < size; a++) {
    const row = rows[a];
    if (!Array.isArray(row)) {
      errors.push(`第 ${a} 行不是数组（费用矩阵必须是二维数字数组）`);
      // 用占位填满，保证后续坐标检查仍可继续
      for (let b = 0; b < size; b++) cost.push(0);
      continue;
    }
    if (row.length !== size) {
      errors.push(`第 ${a} 行长度应为 ${size}，实际为 ${row.length}`);
    }
    for (let b = 0; b < size; b++) {
      const cell: unknown = b < row.length ? row[b] : undefined;
      const from = a === 0 ? '0(停放位)' : `姿态${a}`;
      const to = b === 0 ? '0(停放位)' : `姿态${b}`;
      if (typeof cell !== 'number' || !Number.isFinite(cell)) {
        errors.push(`矩阵[${a}][${b}]（${from}→${to}）必须是数字，当前为 ${formatValue(cell)}`);
        cost.push(0);
        continue;
      }
      if (!Number.isInteger(cell)) {
        errors.push(`矩阵[${a}][${b}]（${from}→${to}）必须是整数，当前为 ${cell}`);
        cost.push(0);
        continue;
      }
      if (a === b) {
        if (cell !== 0) {
          errors.push(`主对角线 matrix[${a}][${a}] 必须为 0，当前为 ${cell}`);
        }
      } else if (cell < 1 || cell > MAX_COST) {
        errors.push(`矩阵[${a}][${b}]（${from}→${to}）必须为 1–${MAX_COST} 的整数，当前为 ${cell}`);
      }
      cost.push(cell);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: { n, cost }, errors: [] };
}

function readNumberField(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    if (key in obj) {
      const v = obj[key];
      return typeof v === 'number' ? v : Number.NaN;
    }
  }
  return undefined;
}

function formatValue(v: unknown): string {
  if (v === undefined) return '缺失';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
