/**
 * УСТАНОВИВШИЙСЯ ЗАНОС И МОМЕНТ НА РУЛЕ.
 *
 * МОДЕЛЬ
 *  Машина — жёсткое тело с 4 шинами. Скорость центра масс V постоянна по модулю и направлена
 *  под углом s к продольной оси: в осях кузова v = (V·cos s, −V·sin s). s > 0 ⇒ занос влево
 *  (нос смотрит левее движения), машина поворачивает влево, угловая скорость r > 0.
 *
 *  В установившемся режиме ускорение центра масс — центростремительное, перпендикулярно скорости
 *  и направлено влево от неё:  a = V·r·(sin s, cos s) в осях кузова.
 *
 *  Скорость колеса i:  v_i = v + r × p_i = (V cos s − r·y_i,  −V sin s + r·x_i),
 *  угол скорости θ_i = atan2(v_iy, v_ix), угол увода α_i = ψ_i − θ_i
 *  (ψ_i — курс колеса: для переднего зависит от руля, для заднего — схождение).
 *
 *  Нагрузки: статика + продольный перенос m·a_x·h/L (a_x — продольная компонента центростремительного
 *  ускорения) + поперечный перенос на наружные (правые) колёса, делится между осями по
 *  `latTransferFrontPct`. Крен φ = градиент · a_y/g меняет ход колёс (±φ·колея/2) и развал.
 *
 *  Задние колёса: суммарная тяга Fx = газ · maxTractionN, делится по нагрузке (заваренный диф);
 *  на колесо тяга ограничена долей maxRearLongShare от μ·Fz (избыток — пробуксовка, не тяга);
 *  боковая сила ограничивается кругом трения (см. tire.ts). Передние колёса свободно катятся (Fx=0).
 *
 *  Неизвестные: смещение рейки x (руль) и угловая скорость r. Уравнения:
 *     (1) F⊥ = m·V·r        — сумма сил шин перпендикулярно скорости даёт центростремительную силу
 *     (2) Mz_cg = 0         — сумма моментов рыскания (силы шин + моменты самовыравнивания) равна нулю
 *  Баланс сил ВДОЛЬ скорости не накладывается: его невязка — это продольное ускорение a_t,
 *  которое выводится. a_t = 0 означает, что при данных V, s и газе скорость действительно постоянна.
 *
 * МОМЕНТ НА РУЛЕ
 *  Для каждого переднего колеса считается момент сил шины относительно оси поворота (kingpin):
 *     M_k = â · ( (c − p_lbj) × F ) + â_z · Mz_шины
 *  c — точка контакта, F = (Fx, Fy, Fz) — полная сила на пятне в осях машины (Fz вверх),
 *  Mz_шины = −t_пневм·Fy — момент самовыравнивания (пневматический трейл).
 *  Так автоматически учитываются механический трейл, плечо обкатки, кастер/KPI и «подъём» кузова
 *  от вертикальной нагрузки.  Принцип виртуальной работы переводит M_k в силу на рейке:
 *     F_рейки = Σ M_k,i · dδ_i/dx
 *  и в момент на рулевом колесе: T = F_рейки · (мм хода на рад руля).
 *  T > 0 — дорога тянет руль влево (в сторону положительного угла); в левом заносе контрруль
 *  отрицателен, значит T > 0 «тянет обратно, к прямой», T < 0 «докручивает контрруль сама».
 */

import type { VehicleConfig } from '../config/vehicle';
import type { TireParams } from '../config/tire';
import { tire } from './tire';
import { FrontAxle, rearWheel, type WheelGeom } from './kinematics';
import { DEG, V3, bisect, cross, dot, illinois, mul, sub, unit } from './math';

const G = 9.81;

export interface DriftInput {
  slipAngleDeg: number;
  speedKmh: number;
  throttlePct: number;
  frontPressureBar: number;
  rearPressureBar: number;
  rearToeDeg: number;
  rearCamberDeg: number;
  /** Высота подвески (клиренс), мм; опорная высота — в cfg.rideHeight. */
  frontRideHeightMm: number;
  rearRideHeightMm: number;
  /** Высота центра тяжести при опорной высоте подвески, мм. */
  cgHeightMm: number;
  /** Доля массы на передней оси, % (положение ЦТ по длине). */
  frontWeightPct: number;
}

export interface DriftCtx {
  cfg: VehicleConfig;
  tireP: TireParams;
  axis: FrontAxle;
  input: DriftInput;
  maxRack: number;
}

export type WheelId = 'FL' | 'FR' | 'RL' | 'RR';

export interface WheelForce {
  id: WheelId;
  Fz: number;
  alphaDeg: number;
  gammaDeg: number;
  headingDeg: number;
  velAngleDeg: number;
  /** Силы в осях колеса, Н. */
  Fx: number;
  Fy: number;
  /** Силы в осях кузова, Н (X вперёд, Y влево). */
  Fbody: [number, number];
  pneuTrailMm: number;
  Mz: number;
  mu: number;
  /** Использование сцепления: |F| / (μ·Fz). */
  gripUse: number;
  contact: V3;
  /** Единичный вектор скорости колеса в осях кузова. */
  velDir: [number, number];
}

export interface Eval {
  rackMm: number;
  r: number;
  V: number;
  ay: number;
  ax: number;
  rollDeg: number;
  heaveL: number;
  heaveR: number;
  wheels: WheelForce[];
  front: { L: WheelGeom; R: WheelGeom };
  rear: { L: WheelGeom; R: WheelGeom };
  Fperp: number;
  /** Невязка уравнения (1): F⊥ − m·V·r, Н. */
  resid: number;
  /** Суммарный момент рыскания, Н·м. */
  MzTotal: number;
  /** Ускорение вдоль скорости, м/с² (+ разгон). */
  aTang: number;
  steer: {
    /** Момент сил шины относительно оси поворота: [левое, правое], Н·м (+ влево). */
    Mk: [number, number];
    rackForceN: number;
    /** Момент от дороги на рулевом колесе без усилителя, Н·м (+ тянет влево). */
    roadTorqueNm: number;
    /** То же в руке водителя с учётом ГУР, Н·м. */
    handTorqueNm: number;
  };
}

/** Момент сил шины относительно оси поворота колеса, Н·м (+ = против часовой сверху, влево). */
export function kingpinMoment(w: WheelGeom, F: V3, Mz: number): number {
  const a = unit(sub(w.p.ubj, w.p.lbj));
  const rm = mul(sub(w.p.contact, w.p.lbj), 0.001);
  return dot(a, cross(rm, F)) + a[2] * Mz;
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Полный расчёт при заданных рейке и угловой скорости. */
export function evaluate(ctx: DriftCtx, rackMm: number, r: number, withSteer = true): Eval {
  const { cfg, tireP, axis, input } = ctx;
  const m = cfg.mass;
  const L = cfg.wheelbase / 1000;
  const wf = input.frontWeightPct / 100;
  const a = (1 - wf) * L; // CG → передняя ось
  const b = wf * L; // CG → задняя ось
  // высота подвески: ниже опорной ⇒ колёса в ходе сжатия на Δ, центр масс ниже
  const dF = input.frontRideHeightMm - cfg.rideHeight.frontRefMm; // мм, − = ниже
  const dR = input.rearRideHeightMm - cfg.rideHeight.rearRefMm;
  const hcg = (input.cgHeightMm + wf * dF + (1 - wf) * dR) / 1000;
  const s = input.slipAngleDeg * DEG;
  const V = input.speedKmh / 3.6;

  const ax = r * V * Math.sin(s);
  const ay = r * V * Math.cos(s);
  const rollDeg = cfg.dynamics.rollGradientDegPerG * (ay / G);
  const rollRad = rollDeg * DEG;

  // нагрузки на колёса
  const tf = cfg.trackFront / 1000;
  const tr = cfg.trackRear / 1000;
  const fl = cfg.dynamics.latTransferFrontPct / 100;
  const dLong = (m * ax * hcg) / L;
  const dLatF = (fl * m * ay * hcg) / tf;
  const dLatR = ((1 - fl) * m * ay * hcg) / tr;
  const FzF = (m * G * wf) / 2 - dLong / 2;
  const FzR = (m * G * (1 - wf)) / 2 + dLong / 2;
  const Fz = {
    FL: Math.max(100, FzF - dLatF),
    FR: Math.max(100, FzF + dLatF),
    RL: Math.max(100, FzR - dLatR),
    RR: Math.max(100, FzR + dLatR),
  };

  // кинематика: ход колёс от крена (наружное — правое — сжимается)
  const rollHeaveF = rollRad * (cfg.trackFront / 2);
  const heaveR = rollHeaveF - dF;
  const heaveL = -rollHeaveF - dF;
  const fL = axis.wheel('L', rackMm, heaveL);
  const fR = axis.wheel('R', rackMm, heaveR);
  const rearSetup = { toeDeg: input.rearToeDeg, camberDeg: input.rearCamberDeg };
  const rollHeaveR = rollRad * (cfg.trackRear / 2);
  const rL = rearWheel(cfg, rearSetup, 'L', -rollHeaveR - dR);
  const rR = rearWheel(cfg, rearSetup, 'R', rollHeaveR - dR);

  // развал относительно дороги: крен наклоняет внутреннее колесо в минус, наружное — в плюс
  const camberG = {
    FL: fL.camberDeg - rollDeg,
    FR: fR.camberDeg + rollDeg,
    RL: rL.camberDeg - rollDeg,
    RR: rR.camberDeg + rollDeg,
  };

  const geoms: { id: WheelId; geom: WheelGeom; x: number; y: number; front: boolean; side: 1 | -1 }[] = [
    { id: 'FL', geom: fL, x: a, y: tf / 2, front: true, side: 1 },
    { id: 'FR', geom: fR, x: a, y: -tf / 2, front: true, side: -1 },
    { id: 'RL', geom: rL, x: -b, y: tr / 2, front: false, side: 1 },
    { id: 'RR', geom: rR, x: -b, y: -tr / 2, front: false, side: -1 },
  ];

  const FxRearTotal = (input.throttlePct / 100) * cfg.dynamics.maxTractionN;
  const FzRearSum = Fz.RL + Fz.RR;

  const wheels: WheelForce[] = [];
  const Fvec: Record<WheelId, V3> = { FL: [0, 0, 0], FR: [0, 0, 0], RL: [0, 0, 0], RR: [0, 0, 0] };
  let Fsum: [number, number] = [0, 0];
  let Mz = 0;
  for (const w of geoms) {
    const psi = w.geom.headingDeg * DEG;
    const vx = V * Math.cos(s) - r * w.y;
    const vy = -V * Math.sin(s) + r * w.x;
    const theta = Math.atan2(vy, vx);
    const alpha = wrapPi(psi - theta);
    const Fx = w.front ? 0 : (FxRearTotal * Fz[w.id]) / FzRearSum;
    const tw = w.front ? cfg.tires.front : cfg.tires.rear;
    const p = w.front ? input.frontPressureBar : input.rearPressureBar;
    const gamma = w.side * camberG[w.id] * DEG; // наклон в сторону +Y
    const t = tire(tireP, {
      alpha,
      Fz: Fz[w.id],
      gammaInc: gamma,
      pressureBar: p,
      Fx,
      widthMm: tw.width,
      fxCap: w.front ? 1 : cfg.dynamics.maxRearLongShare,
    });
    const FxA = t.FxApplied;
    // вектор силы в осях кузова: Fx вдоль курса колеса, Fy влево от курса
    const fxb = FxA * Math.cos(psi) - t.Fy * Math.sin(psi);
    const fyb = FxA * Math.sin(psi) + t.Fy * Math.cos(psi);
    Fsum = [Fsum[0] + fxb, Fsum[1] + fyb];
    Mz += w.x * fyb - w.y * fxb + t.Mz;
    Fvec[w.id] = [fxb, fyb, Fz[w.id]];
    const vl = Math.hypot(vx, vy);
    wheels.push({
      id: w.id,
      Fz: Fz[w.id],
      alphaDeg: alpha / DEG,
      gammaDeg: gamma / DEG,
      headingDeg: w.geom.headingDeg,
      velAngleDeg: theta / DEG,
      Fx: FxA,
      Fy: t.Fy,
      Fbody: [fxb, fyb],
      pneuTrailMm: t.trail * 1000,
      Mz: t.Mz,
      mu: t.mu,
      gripUse: Math.hypot(FxA, t.Fy) / (t.mu * Fz[w.id]),
      contact: w.geom.p.contact,
      velDir: [vx / vl, vy / vl],
    });
  }

  const Fperp = Fsum[0] * Math.sin(s) + Fsum[1] * Math.cos(s);
  const Ftan = Fsum[0] * Math.cos(s) - Fsum[1] * Math.sin(s);

  // момент на рулевом колесе (при переборе в решателе не нужен — пропускаем)
  let MkL = 0;
  let MkR = 0;
  let rackForce = 0;
  if (withSteer) {
    MkL = kingpinMoment(fL, Fvec.FL, wheels[0].Mz);
    MkR = kingpinMoment(fR, Fvec.FR, wheels[1].Mz);
    const dd = (side: 'L' | 'R', h: number) =>
      ((axis.wheel(side, rackMm + 0.25, h).kingpinDeg - axis.wheel(side, rackMm - 0.25, h).kingpinDeg) * DEG) / 0.5; // рад/мм
    rackForce = (MkL * dd('L', heaveL) + MkR * dd('R', heaveR)) * 1000; // Н
  }
  const mPerRad = cfg.front.rackMmPerSteeringDeg * 1e-3 * (180 / Math.PI);
  const roadTorque = rackForce * mPerRad;

  return {
    rackMm,
    r,
    V,
    ay,
    ax,
    rollDeg,
    heaveL,
    heaveR,
    wheels,
    front: { L: fL, R: fR },
    rear: { L: rL, R: rR },
    Fperp,
    resid: Fperp - m * V * r,
    MzTotal: Mz,
    aTang: Ftan / m,
    steer: {
      Mk: [MkL, MkR],
      rackForceN: rackForce,
      roadTorqueNm: roadTorque,
      handTorqueNm: roadTorque * (1 - cfg.steering.assistFraction),
    },
  };
}

/** Угловая скорость r, при которой выполнено уравнение (1) при заданной рейке. null — нет решения. */
export function solveYaw(ctx: DriftCtx, rackMm: number): number | null {
  if (Math.abs(ctx.input.slipAngleDeg) < 0.3) return 0;
  const f = (r: number) => evaluate(ctx, rackMm, r, false).resid;
  const hi = 3.5;
  if (f(0) <= 0 || f(hi) >= 0) return null;
  return illinois(f, 0, hi, 1e-3);
}

export interface SteadyResult {
  ok: boolean;
  reason?: string;
  rackMm: number;
  steerWheelDeg: number;
  /** Все найденные равновесные положения рейки (мм). */
  roots: number[];
  eval: Eval | null;
}

/** Найти установившееся равновесие: рейка x и r, при которых (1) и (2) выполнены. */
export function solveSteady(ctx: DriftCtx): SteadyResult {
  const mmPerDeg = ctx.cfg.front.rackMmPerSteeringDeg;
  const M = ctx.maxRack;
  const mz = (x: number): number => {
    const r = solveYaw(ctx, x);
    return r === null ? NaN : evaluate(ctx, x, r, false).MzTotal;
  };
  const N = 40;
  const xs: number[] = [];
  const vals: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -M + (2 * M * i) / N;
    xs.push(x);
    vals.push(mz(x));
  }
  const roots: number[] = [];
  for (let i = 0; i < N; i++) {
    if (Number.isFinite(vals[i]) && Number.isFinite(vals[i + 1]) && Math.sign(vals[i]) !== Math.sign(vals[i + 1])) {
      roots.push(bisect((x) => mz(x), xs[i], xs[i + 1], 1e-3));
    }
  }
  if (!roots.length) {
    const finite = vals.filter(Number.isFinite).length;
    return {
      ok: false,
      reason: finite
        ? 'нет равновесия: даже при полном контрруле/руле момент рыскания не обнуляется (задняя ось тянет слишком сильно или слабо)'
        : 'нет решения по силам: шин не хватает для такой скорости и угла заноса',
      rackMm: 0,
      steerWheelDeg: 0,
      roots,
      eval: null,
    };
  }
  // предпочитаем контрруль (знак противоположен заносу), ближайший к нулю
  const dirSign = Math.sign(ctx.input.slipAngleDeg) || 1;
  const counter = roots.filter((x) => Math.sign(x) === -dirSign);
  const pool = counter.length ? counter : roots;
  const x = pool.reduce((p, c) => (Math.abs(c) < Math.abs(p) ? c : p));
  const r = solveYaw(ctx, x) ?? 0;
  return { ok: true, rackMm: x, steerWheelDeg: x / mmPerDeg, roots, eval: evaluate(ctx, x, r) };
}

/** Момент на руле при заданной рейке: r берётся из (1), (2) не накладывается. */
export function evalAtRack(ctx: DriftCtx, rackMm: number): Eval | null {
  const r = solveYaw(ctx, rackMm);
  return r === null ? null : evaluate(ctx, rackMm, r);
}

/**
 * Локальный поиск равновесия рядом с заданной рейкой (для непрерывного перебора по углу заноса).
 * Если рядом корня нет — полный поиск.
 */
export function solveSteadyNear(ctx: DriftCtx, guessRack: number): SteadyResult {
  const M = ctx.maxRack;
  const mmPerDeg = ctx.cfg.front.rackMmPerSteeringDeg;
  const mz = (x: number): number => {
    const r = solveYaw(ctx, x);
    return r === null ? NaN : evaluate(ctx, x, r, false).MzTotal;
  };
  const x0 = Math.max(-M, Math.min(M, guessRack));
  const g0 = mz(x0);
  const step = 3;
  let bracket: [number, number] | null = null;
  if (Number.isFinite(g0)) {
    let pr = x0;
    let pl = x0;
    let gr = g0;
    let gl = g0;
    for (let k = 1; k <= 30 && !bracket; k++) {
      const xr = Math.min(M, x0 + k * step);
      const xl = Math.max(-M, x0 - k * step);
      const vr = xr > pr ? mz(xr) : NaN;
      if (Number.isFinite(vr) && Math.sign(vr) !== Math.sign(gr)) bracket = [pr, xr];
      else if (Number.isFinite(vr)) { pr = xr; gr = vr; }
      if (bracket) break;
      const vl = xl < pl ? mz(xl) : NaN;
      if (Number.isFinite(vl) && Math.sign(vl) !== Math.sign(gl)) bracket = [xl, pl];
      else if (Number.isFinite(vl)) { pl = xl; gl = vl; }
    }
  }
  if (!bracket) return solveSteady(ctx);
  const x = illinois((v) => mz(v), bracket[0], bracket[1], 1e-2, 30);
  const dirSign = Math.sign(ctx.input.slipAngleDeg) || 1;
  if (Math.sign(x) !== -dirSign && Math.abs(x) > 3) return solveSteady(ctx); // не контрруль — перепроверяем полностью
  const r = solveYaw(ctx, x) ?? 0;
  return { ok: true, rackMm: x, steerWheelDeg: x / mmPerDeg, roots: [x], eval: evaluate(ctx, x, r) };
}
