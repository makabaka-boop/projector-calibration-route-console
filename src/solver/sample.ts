import type { CalibrationPlan } from './validate';

/**
 * 生成一份合法示例计划：镜组转动耗时带方向性——
 * 正向（编号递增、可环绕）取基础耗时加小幅扰动，逆向明显更慢。
 * 仅供工程师快速上手与压测，数据不来自任何接口。
 */
export function generateSample(n: number, seed = 20260918): string {
  if (!Number.isInteger(n) || n < 8 || n > 18) {
    throw new Error('n 必须为 8–18 的整数');
  }
  const rand = lcg(seed + n * 7919);
  const size = n + 1;
  const rows: number[][] = [];
  for (let a = 0; a < size; a++) {
    const row: number[] = [];
    for (let b = 0; b < size; b++) {
      if (a === b) {
        row.push(0);
      } else {
        const distance = (b - a + n) % n === 0 ? 1 : (b - a + n) % n;
        const forward = (b - a + n) % n;
        const steps = forward === 0 ? n : forward;
        // 0 停放位到各姿态按“编号距离”计，姿态间顺向便宜、逆向昂贵
        const base = a === 0 || b === 0 ? 120 + distance * 30 : steps * 40;
        const directional = forward > n / 2 ? (forward - n / 2) * 25 : 0;
        const jitter = Math.floor(rand() * 60);
        row.push(clamp(base + directional + jitter + 1));
      }
    }
    rows.push(row);
  }
  return JSON.stringify({ n, matrix: rows }, null, 2);
}

function clamp(v: number): number {
  return Math.max(1, Math.min(9999, Math.round(v)));
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 全 1 非对角矩阵：制造大量并列，用于字典序平局与性能压力测试。 */
export function constantMatrixPlan(n: number): CalibrationPlan {
  const size = n + 1;
  const cost: number[] = [];
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) cost.push(a === b ? 0 : 1);
  }
  return { n, cost };
}
