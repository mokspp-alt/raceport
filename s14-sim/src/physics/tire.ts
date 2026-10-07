/**
 * МОДЕЛЬ ШИНЫ: Magic Formula (боковая сила) + пневматический трейл + давление.
 *
 * ЗНАКИ (систем машины: X вперёд, Y влево, Z вверх):
 *   α   — угол увода: курс колеса минус направление скорости, рад.
 *         α > 0 ⇒ колесо «смотрит» левее движения ⇒ сила шины направлена влево (+Y).
 *   γ   — наклон колеса ПО НАПРАВЛЕНИЮ +Y (верх колеса завален влево = +).
 *         Для левого колеса γ = развал, для правого γ = −развал (развал «+» = верх наружу).
 *         γ > 0 ⇒ камбер-тяга влево (+Y).
 *   Fy  — боковая сила на пятне, Н, + влево.
 *   Mz  — момент вокруг вертикали, Н·м: Mz = −t·Fy (сила приложена на t позади центра пятна).
 *         Для α > 0 и t > 0 даёт Mz < 0: шина стремится уменьшить α (самовыравнивание).
 *
 * ФОРМУЛЫ
 *  1. Пик сцепления:
 *       μ = μ0 · (1 + kL·(Fz − Fz0)/Fz0) · (1 − kP·(p − p0)/p0) · (1 − kγ·γ°²)
 *       D = μ · Fz
 *  2. Жёсткость при увод (Пачейка):
 *       Cα = c1·Fz0·sin(2·atan(Fz / (c2·Fz0))) · (1 + kS·(p − p0)/p0)
 *  3. Magic Formula:
 *       B = Cα / (C·D)
 *       αe = α + (Cγ/Cα)·γ                          — камбер-тяга как сдвиг по α
 *       Fy0 = D · sin(C · atan(B·αe − E·(B·αe − atan(B·αe))))
 *  4. Совместное скольжение (тяга Fx на заднем колесе), «круг трения»:
 *       Fy = Fy0 · sqrt(1 − (Fx / (μx·μ·Fz))²)
 *  5. Пятно контакта: давление на грунте ≈ p + pкаркаса, площадь A = Fz / p_eff,
 *       длина l = A / (ширина_пятна)
 *  6. Пневматический трейл:
 *       t0  = kT · l                                  — падает с ростом давления
 *       αsl = atan(3·μ·Fz / Cα)                       — угол полного скольжения (щёточная модель)
 *       u   = αe / αsl
 *       t   = t0 · cos(Ct · atan(Bt·u − Et·(Bt·u − atan(Bt·u)))) · cos α
 *     При Ct > 1 трейл проходит через 0 около u ≈ 1 и уходит в минус при больших углах увода.
 */

import type { TireParams } from '../config/tire';

export interface TireInput {
  /** Угол увода, рад (+ ⇒ сила влево). */
  alpha: number;
  /** Нормальная нагрузка, Н (> 0). */
  Fz: number;
  /** Наклон колеса в сторону +Y, рад. */
  gammaInc: number;
  /** Давление накачки, бар. */
  pressureBar: number;
  /** Продольная сила (тяга), Н; по умолчанию 0. */
  Fx?: number;
  /** Ширина шины, мм. */
  widthMm: number;
  /** Предельная доля μ·Fz для продольной силы (0…1); избыток тяги — пробуксовка. По умолчанию 1. */
  fxCap?: number;
}

export interface TireOutput {
  Fy: number; // Н
  /** Реально приложенная продольная сила, Н (после ограничения сцеплением). */
  FxApplied: number;
  /** Пневматический трейл, м (+ позади центра пятна). */
  trail: number;
  /** Момент самовыравнивания, Н·м. */
  Mz: number;
  /** Жёсткость при увод, Н/рад. */
  Calpha: number;
  /** Пик сцепления (коэффициент). */
  mu: number;
  /** Длина пятна, м. */
  patchLength: number;
  /** Трейл при нулевом скольжении, м. */
  trail0: number;
  /** Угол полного скольжения, рад. */
  alphaSl: number;
  /** Максимальная боковая сила при данной Fx, Н. */
  FyMax: number;
}

const DEG = Math.PI / 180;

/** Длина пятна контакта, м. */
export function patchLength(p: TireParams, Fz: number, pressureBar: number, widthMm: number): number {
  const pEff = (pressureBar + p.carcassPressureBar) * 1e5; // Па
  const area = Fz / pEff; // м²
  return area / ((widthMm / 1000) * p.patchWidthRatio);
}

export function tire(p: TireParams, i: TireInput): TireOutput {
  const Fz = Math.max(i.Fz, 1);
  const dp = (i.pressureBar - p.p0) / p.p0;
  const gDeg = i.gammaInc / DEG;
  const mu =
    p.mu0 *
    (1 + p.muLoadSens * ((Fz - p.Fz0) / p.Fz0)) *
    (1 - p.muPressSens * dp) *
    Math.max(0.3, 1 - p.muCamberK * gDeg * gDeg);
  const D = mu * Fz;
  const Calpha = p.c1 * p.Fz0 * Math.sin(2 * Math.atan(Fz / (p.c2 * p.Fz0))) * (1 + p.stiffPressSens * dp);
  const B = Calpha / (p.Cy * D);
  const alphaE = i.alpha + p.camberStiffRatio * i.gammaInc;
  const x = B * alphaE;
  const Fy0 = D * Math.sin(p.Cy * Math.atan(x - p.Ey * (x - Math.atan(x))));

  const Fx = i.Fx ?? 0;
  const ratio = Math.min(i.fxCap ?? 1, Math.abs(Fx) / (p.muXRatio * D));
  const FxApplied = Math.sign(Fx) * ratio * p.muXRatio * D;
  const ell = Math.sqrt(1 - ratio * ratio);
  const Fy = Fy0 * ell;

  const l = patchLength(p, Fz, i.pressureBar, i.widthMm);
  const t0 = p.trailPatchK * l;
  const alphaSl = Math.atan((3 * D) / Calpha);
  const u = p.trailBu * (alphaE / alphaSl);
  const trail = t0 * Math.cos(p.trailCt * Math.atan(u - p.trailEt * (u - Math.atan(u)))) * Math.cos(i.alpha);

  return { Fy, FxApplied, trail, Mz: -trail * Fy, Calpha, mu, patchLength: l, trail0: t0, alphaSl, FyMax: D * ell };
}
