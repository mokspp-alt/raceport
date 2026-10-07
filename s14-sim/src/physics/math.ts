/** Мелкая векторная математика. Координаты машины: X вперёд, Y влево, Z вверх. */

export type V3 = [number, number, number];

export const DEG = Math.PI / 180;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => mul(a, 1 / len(a));
export const mirrorY = (a: V3): V3 => [a[0], -a[1], a[2]];

/** Поворот вокруг оси X (правило правой руки): Y→Z. */
export function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

/** Поворот вокруг оси Y: Z→X. */
export function rotY(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** Поворот вокруг оси Z: X→Y (против часовой, если смотреть сверху). */
export function rotZ(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** Формула Родрига: поворот v вокруг единичной оси k на угол a. */
export function rotAxis(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
}

/** Бисекция на [lo, hi]; f(lo) и f(hi) должны иметь разные знаки. */
export function bisect(f: (x: number) => number, lo: number, hi: number, tol = 1e-10): number {
  let flo = f(lo);
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (Math.abs(fm) < tol || hi - lo < tol) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Метод Иллинойса (регула фальси с поправкой) на [lo, hi]; f(lo), f(hi) разных знаков.
 * Сходится заметно быстрее бисекции на гладких функциях.
 */
export function illinois(f: (x: number) => number, lo: number, hi: number, tol = 1e-8, maxIter = 40): number {
  let fl = f(lo);
  let fh = f(hi);
  let side = 0;
  let x = lo;
  for (let i = 0; i < maxIter; i++) {
    x = (fl * hi - fh * lo) / (fl - fh);
    const fx = f(x);
    if (Math.abs(fx) < tol || Math.abs(hi - lo) < tol) return x;
    if (Math.sign(fx) * Math.sign(fh) > 0) {
      hi = x;
      fh = fx;
      if (side === -1) fl *= 0.5;
      side = -1;
    } else {
      lo = x;
      fl = fx;
      if (side === 1) fh *= 0.5;
      side = 1;
    }
  }
  return x;
}
