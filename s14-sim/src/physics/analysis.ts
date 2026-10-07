/**
 * АНАЛИЗ: кривые для графиков, «точка баланса руля», анализ чувствительности.
 *
 * Определения
 *  T(δ | β)   — момент от дороги на рулевом колесе в зависимости от угла руля δ при ФИКСИРОВАННОМ
 *               угле заноса β, скорости и газе (угловая скорость r берётся из уравнения сил, баланс
 *               моментов рыскания не требуется — см. drift.ts, evalAtRack).
 *  T_eq(β)    — момент на руле в состоянии равновесия заноса (руль = равновесный контрруль δ*(β)).
 *  β*         — «точка баланса»: угол заноса, при котором T_eq(β) = 0, то есть руль в установившемся
 *               заносе «висит» без усилия. Наклон dT_eq/dβ в этой точке показывает, насколько круто
 *               руль начинает тянуть/докручивать при уходе от β*.
 *  δ0         — угол руля, при котором T(δ | β) = 0 при рабочем β («где руль висит»); сравнивается с δ*.
 *               Наклон dT/dδ < 0 — руль самоустанавливается в δ0 (устойчиво), > 0 — убегает от него.
 */

import type { State, VehicleConfig } from '../config/vehicle';
import type { TireParams } from '../config/tire';
import { FrontAxle } from './kinematics';
import { evalAtRack, solveSteady, solveSteadyNear, type DriftCtx, type DriftInput, type Eval } from './drift';

export const SETUP_KEYS = [
  'rackOffsetMm',
  'frontToeDeg',
  'frontCamberDeg',
  'casterDeg',
  'ackermannPct',
  'frontPressureBar',
  'frontRideHeightMm',
  'rearToeDeg',
  'rearCamberDeg',
  'rearPressureBar',
  'rearRideHeightMm',
  'cgHeightMm',
  'frontWeightPct',
] as const satisfies readonly (keyof State)[];

export type SetupKey = (typeof SETUP_KEYS)[number];

const axisCache = new Map<string, { axis: FrontAxle; maxRack: number }>();

function axisFor(cfg: VehicleConfig, s: State): { axis: FrontAxle; maxRack: number } {
  const setup = {
    rackOffsetMm: s.rackOffsetMm,
    toeDeg: s.frontToeDeg,
    camberDeg: s.frontCamberDeg,
    casterDeg: s.casterDeg,
    ackermannPct: s.ackermannPct,
  };
  const key = JSON.stringify(setup);
  let hit = axisCache.get(key);
  if (!hit) {
    const axis = FrontAxle.create(cfg, setup);
    hit = { axis, maxRack: axis.maxRackMm() };
    if (axisCache.size > 40) axisCache.delete(axisCache.keys().next().value as string);
    axisCache.set(key, hit);
  }
  return hit;
}

export function makeCtx(cfg: VehicleConfig, tireP: TireParams, s: State): DriftCtx {
  const { axis, maxRack } = axisFor(cfg, s);
  const input: DriftInput = {
    slipAngleDeg: s.slipAngleDeg,
    speedKmh: s.speedKmh,
    throttlePct: s.throttlePct,
    frontPressureBar: s.frontPressureBar,
    rearPressureBar: s.rearPressureBar,
    rearToeDeg: s.rearToeDeg,
    rearCamberDeg: s.rearCamberDeg,
    frontRideHeightMm: s.frontRideHeightMm,
    rearRideHeightMm: s.rearRideHeightMm,
    cgHeightMm: s.cgHeightMm,
    frontWeightPct: s.frontWeightPct,
  };
  return { cfg, tireP, axis, input, maxRack };
}

/** Кривые по углу руля при фиксированном угле заноса. */
export interface SteerCurve {
  steerDeg: number[];
  torque: number[];
  /** Углы увода внутреннего (левого) и внешнего (правого) переднего колеса, °. */
  alphaIn: number[];
  alphaOut: number[];
  /** Развал относительно дороги, °. */
  camberIn: number[];
  camberOut: number[];
}

export function steerCurve(ctx: DriftCtx): SteerCurve {
  const mm = ctx.cfg.front.rackMmPerSteeringDeg;
  const out: SteerCurve = { steerDeg: [], torque: [], alphaIn: [], alphaOut: [], camberIn: [], camberOut: [] };
  const M = ctx.maxRack - 3;
  for (let x = -M; x <= M + 1e-9; x += 4) {
    const e = evalAtRack(ctx, x);
    if (!e) continue;
    out.steerDeg.push(x / mm);
    out.torque.push(e.steer.roadTorqueNm);
    out.alphaIn.push(e.wheels[0].alphaDeg);
    out.alphaOut.push(e.wheels[1].alphaDeg);
    out.camberIn.push(e.wheels[0].gammaDeg);
    out.camberOut.push(-e.wheels[1].gammaDeg); // gammaDeg правого = −развал → вернуть развал «+ наружу»
  }
  return out;
}

/** Момент на руле в равновесии заноса по углу заноса. */
export interface SlipCurve {
  slip: number[];
  torque: (number | null)[];
  steerDeg: (number | null)[];
}

export const SLIP_MIN = 5;
export const SLIP_MAX = 55;
export const SLIP_STEP = 2.5;

export function slipCurve(cfg: VehicleConfig, tireP: TireParams, s: State, slips?: number[]): SlipCurve {
  const grid: number[] = slips ?? [];
  if (!slips) for (let b = SLIP_MIN; b <= SLIP_MAX + 1e-9; b += SLIP_STEP) grid.push(b);
  const res: SlipCurve = { slip: grid, torque: grid.map(() => null), steerDeg: grid.map(() => null) };
  // стартуем с ближайшей к рабочему углу точки, дальше — продолжением по рейке в обе стороны
  let start = 0;
  grid.forEach((b, i) => {
    if (Math.abs(b - s.slipAngleDeg) < Math.abs(grid[start] - s.slipAngleDeg)) start = i;
  });
  const solveAt = (i: number, guess: number | null): number | null => {
    const ctx = makeCtx(cfg, tireP, { ...s, slipAngleDeg: grid[i] });
    const sol = guess === null ? solveSteady(ctx) : solveSteadyNear(ctx, guess);
    if (!sol.ok || !sol.eval) return null;
    res.torque[i] = sol.eval.steer.roadTorqueNm;
    res.steerDeg[i] = sol.steerWheelDeg;
    return sol.rackMm;
  };
  const mm = cfg.front.rackMmPerSteeringDeg;
  const g0 = solveAt(start, null);
  for (const dir of [1, -1]) {
    let guess = g0;
    for (let i = start + dir; i >= 0 && i < grid.length; i += dir) {
      const r = solveAt(i, guess);
      if (r !== null) guess = r;
    }
  }
  void mm;
  return res;
}

export interface Balance {
  /** Все углы заноса, где T_eq = 0. */
  crossings: number[];
  /** Ближайший к рабочему углу. */
  star: number | null;
  /** dT_eq/dβ в точке баланса, Н·м/°. */
  slope: number | null;
  /** Знак момента ниже и выше β*: − докручивает контрруль, + тянет обратно. */
  below: number | null;
  above: number | null;
  /** Если пересечения нет: угол с минимальным |T| и сам момент. */
  closest: { slip: number; torque: number } | null;
  /** Общий знак момента на всём диапазоне, если пересечения нет. */
  sign: number | null;
}

export function findBalance(c: SlipCurve, working: number): Balance {
  const pts = c.slip.map((b, i) => ({ b, t: c.torque[i] })).filter((p): p is { b: number; t: number } => p.t !== null);
  const crossings: { b: number; slope: number; t0: number; t1: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.t === 0 || Math.sign(a.t) !== Math.sign(b.t)) {
      const f = a.t === b.t ? 0 : a.t / (a.t - b.t);
      crossings.push({ b: a.b + f * (b.b - a.b), slope: (b.t - a.t) / (b.b - a.b), t0: a.t, t1: b.t });
    }
  }
  if (!crossings.length) {
    const c0 = pts.length ? pts.reduce((p, q) => (Math.abs(q.t) < Math.abs(p.t) ? q : p)) : null;
    return {
      crossings: [],
      star: null,
      slope: null,
      below: null,
      above: null,
      closest: c0 ? { slip: c0.b, torque: c0.t } : null,
      sign: c0 ? Math.sign(c0.t) : null,
    };
  }
  const best = crossings.reduce((p, q) => (Math.abs(q.b - working) < Math.abs(p.b - working) ? q : p));
  return {
    crossings: crossings.map((x) => x.b),
    star: best.b,
    slope: best.slope,
    below: Math.sign(best.t0),
    above: Math.sign(best.t1),
    closest: null,
    sign: null,
  };
}

/** Угол руля, при котором T(δ|β)=0 при рабочем β, и наклон dT/dδ там (Н·м на 100° руля). */
export function zeroSteer(curve: SteerCurve, eqSteerDeg: number | null): { steerDeg: number | null; slopePer100: number | null } {
  const xs = curve.steerDeg;
  const ts = curve.torque;
  const cands: { x: number; slope: number }[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    if (Math.sign(ts[i]) !== Math.sign(ts[i + 1])) {
      const f = ts[i] / (ts[i] - ts[i + 1]);
      cands.push({ x: xs[i] + f * (xs[i + 1] - xs[i]), slope: ((ts[i + 1] - ts[i]) / (xs[i + 1] - xs[i])) * 100 });
    }
  }
  if (!cands.length) return { steerDeg: null, slopePer100: null };
  const ref = eqSteerDeg ?? 0;
  const best = cands.reduce((p, q) => (Math.abs(q.x - ref) < Math.abs(p.x - ref) ? q : p));
  return { steerDeg: best.x, slopePer100: best.slope };
}

export interface Analysis {
  steer: SteerCurve;
  eqSteerDeg: number | null;
  eqEval: Eval | null;
  eqReason?: string;
  slip: SlipCurve;
  balance: Balance;
  zero: { steerDeg: number | null; slopePer100: number | null };
}

export function analyze(cfg: VehicleConfig, tireP: TireParams, s: State): Analysis {
  const ctx = makeCtx(cfg, tireP, s);
  const sol = solveSteady(ctx);
  const steer = steerCurve(ctx);
  const slip = slipCurve(cfg, tireP, s);
  return {
    steer,
    eqSteerDeg: sol.ok ? sol.steerWheelDeg : null,
    eqEval: sol.eval,
    eqReason: sol.reason,
    slip,
    balance: findBalance(slip, s.slipAngleDeg),
    zero: zeroSteer(steer, sol.ok ? sol.steerWheelDeg : null),
  };
}

/** Кэш анализов по ключу «настройки + сценарий». */
const analysisCache = new Map<string, Analysis>();
export function analyzeCached(cfg: VehicleConfig, tireP: TireParams, s: State): Analysis {
  const key = JSON.stringify([...SETUP_KEYS.map((k) => s[k]), s.slipAngleDeg, s.speedKmh, s.throttlePct]);
  let a = analysisCache.get(key);
  if (!a) {
    a = analyze(cfg, tireP, s);
    if (analysisCache.size > 12) analysisCache.delete(analysisCache.keys().next().value as string);
    analysisCache.set(key, a);
  }
  return a;
}

// ———————————————————— чувствительность ————————————————————

export interface SensitivityDef {
  key: SetupKey;
  label: string;
  unit: string;
  step: number;
}

export const SENSITIVITY_DEFS: SensitivityDef[] = [
  { key: 'rackOffsetMm', label: 'Рейка вперёд/назад', unit: 'мм', step: 5 },
  { key: 'frontToeDeg', label: 'Схождение (перед)', unit: '°', step: 0.2 },
  { key: 'frontCamberDeg', label: 'Развал (перед)', unit: '°', step: 0.5 },
  { key: 'casterDeg', label: 'Кастер', unit: '°', step: 1 },
  { key: 'ackermannPct', label: 'Аккерман', unit: '%', step: 20 },
  { key: 'frontPressureBar', label: 'Давление (перед)', unit: 'бар', step: 0.2 },
  { key: 'frontRideHeightMm', label: 'Высота подвески (перед)', unit: 'мм', step: 10 },
  { key: 'rearToeDeg', label: 'Схождение (зад)', unit: '°', step: 0.2 },
  { key: 'rearCamberDeg', label: 'Развал (зад)', unit: '°', step: 0.5 },
  { key: 'rearPressureBar', label: 'Давление (зад)', unit: 'бар', step: 0.3 },
  { key: 'rearRideHeightMm', label: 'Высота подвески (зад)', unit: 'мм', step: 10 },
  { key: 'cgHeightMm', label: 'Высота центра тяжести', unit: 'мм', step: 30 },
  { key: 'frontWeightPct', label: 'Развесовка (перед)', unit: '%', step: 2 },
];

export interface SensitivityRow extends SensitivityDef {
  /** Сдвиг β* при +step (центральная разность), ° заноса; null — нет баланса. */
  dStar: number | null;
  /** Изменение T_eq при рабочем β на +step, Н·м. */
  dTorque: number | null;
  /** Изменение разности (δ* − δ0) на +step, ° руля: насколько руль, висящий нейтрально, расходится с нужным контррулём. */
  dMismatch: number | null;
}

/** β* вблизи рабочего значения (нужен только один корень — быстрее полной кривой). */
function starFor(cfg: VehicleConfig, tireP: TireParams, s: State, near: number): number | null {
  const sc = slipCurve(cfg, tireP, s);
  const b = findBalance(sc, near);
  return b.star;
}

function mismatchFor(cfg: VehicleConfig, tireP: TireParams, s: State): number | null {
  const ctx = makeCtx(cfg, tireP, s);
  const sol = solveSteady(ctx);
  if (!sol.ok) return null;
  const z = zeroSteer(steerCurve(ctx), sol.steerWheelDeg);
  return z.steerDeg === null ? null : sol.steerWheelDeg - z.steerDeg;
}

function torqueAtWorking(cfg: VehicleConfig, tireP: TireParams, s: State): number | null {
  const sol = solveSteady(makeCtx(cfg, tireP, s));
  return sol.ok && sol.eval ? sol.eval.steer.roadTorqueNm : null;
}

/** Анализ чувствительности: по параметрам, асинхронно (чтобы интерфейс не замирал). */
export async function sensitivity(
  cfg: VehicleConfig,
  tireP: TireParams,
  s: State,
  onProgress?: (done: number, total: number) => void,
): Promise<{ baseStar: number | null; baseTorque: number | null; baseMismatch: number | null; rows: SensitivityRow[] }> {
  const baseStar = starFor(cfg, tireP, s, s.slipAngleDeg);
  const baseTorque = torqueAtWorking(cfg, tireP, s);
  const baseMismatch = mismatchFor(cfg, tireP, s);
  const rows: SensitivityRow[] = [];
  let i = 0;
  for (const d of SENSITIVITY_DEFS) {
    await new Promise((r) => setTimeout(r, 0));
    const hi = { ...s, [d.key]: s[d.key] + d.step } as State;
    const lo = { ...s, [d.key]: s[d.key] - d.step } as State;
    let dStar: number | null = null;
    if (baseStar !== null) {
      const a = starFor(cfg, tireP, hi, baseStar);
      const b = starFor(cfg, tireP, lo, baseStar);
      if (a !== null && b !== null) dStar = (a - b) / 2;
    }
    const tA = torqueAtWorking(cfg, tireP, hi);
    const tB = torqueAtWorking(cfg, tireP, lo);
    const dTorque = tA !== null && tB !== null ? (tA - tB) / 2 : null;
    const mA = mismatchFor(cfg, tireP, hi);
    const mB = mismatchFor(cfg, tireP, lo);
    const dMismatch = mA !== null && mB !== null ? (mA - mB) / 2 : null;
    rows.push({ ...d, dStar, dTorque, dMismatch });
    onProgress?.(++i, SENSITIVITY_DEFS.length);
  }
  const score = (r: SensitivityRow) => (r.dStar !== null ? Math.abs(r.dStar) : -1);
  const hasStar = rows.some((r) => r.dStar !== null);
  rows.sort((a, b) => (hasStar ? score(b) - score(a) : Math.abs(b.dTorque ?? 0) - Math.abs(a.dTorque ?? 0)));
  return { baseStar, baseTorque, baseMismatch, rows };
}
