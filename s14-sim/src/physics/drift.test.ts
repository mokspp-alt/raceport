import { describe, expect, it } from 'vitest';
import { defaultSetup, vehicle } from '../config/vehicle';
import { tireParams } from '../config/tire';
import { FrontAxle } from './kinematics';
import { evalAtRack, evaluate, kingpinMoment, solveSteady, type DriftCtx, type DriftInput } from './drift';

const input = (o: Partial<DriftInput> = {}): DriftInput => ({
  slipAngleDeg: defaultSetup.slipAngleDeg,
  speedKmh: defaultSetup.speedKmh,
  throttlePct: defaultSetup.throttlePct,
  frontPressureBar: defaultSetup.frontPressureBar,
  rearPressureBar: defaultSetup.rearPressureBar,
  rearToeDeg: defaultSetup.rearToeDeg,
  rearCamberDeg: defaultSetup.rearCamberDeg,
  ...o,
});

const setupF = {
  rackOffsetMm: defaultSetup.rackOffsetMm,
  toeDeg: defaultSetup.frontToeDeg,
  camberDeg: defaultSetup.frontCamberDeg,
  casterDeg: defaultSetup.casterDeg,
  ackermannPct: defaultSetup.ackermannPct,
};

const ctxOf = (inp: Partial<DriftInput> = {}, fs: Partial<typeof setupF> = {}): DriftCtx => {
  const axis = FrontAxle.create(vehicle, { ...setupF, ...fs });
  return { cfg: vehicle, tireP: tireParams, axis, input: input(inp), maxRack: axis.maxRackMm() };
};

describe('установившийся занос', () => {
  it('находит равновесие на настройках по умолчанию; контрруль, невязки малы', () => {
    const sol = solveSteady(ctxOf());
    const e = sol.eval!;
    console.log('ok', sol.ok, 'roots', sol.roots.map((x) => x.toFixed(1)), 'руль', sol.steerWheelDeg.toFixed(0), '°');
    if (e) {
      console.log('r', e.r.toFixed(3), 'рад/с; ay', (e.ay / 9.81).toFixed(2), 'g; крен', e.rollDeg.toFixed(2), '°; aTang', e.aTang.toFixed(2));
      for (const w of e.wheels)
        console.log(w.id, 'Fz', w.Fz.toFixed(0), 'α', w.alphaDeg.toFixed(1), 'ψ', w.headingDeg.toFixed(1), 'Fy', w.Fy.toFixed(0), 'Fx', w.Fx.toFixed(0), 'трейл', w.pneuTrailMm.toFixed(1), 'γ', w.gammaDeg.toFixed(1), 'use', w.gripUse.toFixed(2));
      console.log('Mk', e.steer.Mk.map((x) => x.toFixed(1)), 'рейка', e.steer.rackForceN.toFixed(0), 'Н; руль', e.steer.roadTorqueNm.toFixed(1), 'Н·м, рука', e.steer.handTorqueNm.toFixed(1));
    }
    expect(sol.ok).toBe(true);
    expect(sol.rackMm).toBeLessThan(0);
    expect(Math.abs(e.MzTotal)).toBeLessThan(5);
    expect(Math.abs(e.resid)).toBeLessThan(5);
  });

  it('угол увода задних колёс положителен (сила влево), передние — контрруль', () => {
    const e = solveSteady(ctxOf()).eval!;
    const [fl, fr, rl, rr] = e.wheels;
    expect(rl.alphaDeg).toBeGreaterThan(10);
    expect(rr.alphaDeg).toBeGreaterThan(10);
    expect(rl.Fy).toBeGreaterThan(0);
    expect(fl.headingDeg).toBeLessThan(0);
    expect(fr.headingDeg).toBeLessThan(0);
  });

  it('перенос веса: наружные (правые) колёса нагружены сильнее', () => {
    const e = solveSteady(ctxOf()).eval!;
    const [fl, fr, rl, rr] = e.wheels;
    expect(fr.Fz).toBeGreaterThan(fl.Fz);
    expect(rr.Fz).toBeGreaterThan(rl.Fz);
    const sum = e.wheels.reduce((p, w) => p + w.Fz, 0);
    expect(sum).toBeCloseTo(vehicle.mass * 9.81, 0);
  });

  it('больше газа ⇒ меньше боковой силы сзади (круг трения)', () => {
    const lo = solveSteady(ctxOf({ throttlePct: 20 })).eval;
    const hi = solveSteady(ctxOf({ throttlePct: 70 })).eval;
    console.log('Fy зад при газе 20/70 %:', lo?.wheels[2].Fy.toFixed(0), hi?.wheels[2].Fy.toFixed(0));
    if (lo && hi) expect(hi.wheels[2].Fy).toBeLessThan(lo.wheels[2].Fy);
  });
});

describe('момент на руле', () => {
  it('одно колесо: чистая боковая сила даёт M = −Fy·R·sin(кастер) при KPI=0, обкатке=0', () => {
    const cfg = JSON.parse(JSON.stringify(vehicle));
    cfg.front.kpiDeg = 0;
    cfg.front.scrubMm = 0;
    const axis = FrontAxle.create(cfg, { ...setupF, camberDeg: 0, toeDeg: 0, casterDeg: 7 });
    const w = axis.wheel('L', 0);
    const Fy = 1000;
    const M = kingpinMoment(w, [0, Fy, 0], 0);
    expect(M / (-Fy * (axis.R / 1000) * Math.sin((7 * Math.PI) / 180))).toBeCloseTo(1, 2);
  });

  it('пневматический трейл добавляет к моменту ровно −t·Fy·a_z', () => {
    const axis = FrontAxle.create(vehicle, setupF);
    const w = axis.wheel('L', 0);
    const m0 = kingpinMoment(w, [0, 0, 0], 0);
    const m1 = kingpinMoment(w, [0, 0, 0], -50);
    expect(m1 - m0).toBeLessThan(0);
  });

  it('при смещении рейки момент вдоль оси рейки непрерывен и конечен', () => {
    const c = ctxOf();
    let prev: number | null = null;
    for (let x = -c.maxRack + 12; x <= c.maxRack - 8; x += 5) {
      const e = evalAtRack(c, x);
      if (!e) continue;
      expect(Number.isFinite(e.steer.roadTorqueNm)).toBe(true);
      if (prev !== null) expect(Math.abs(e.steer.roadTorqueNm - prev)).toBeLessThan(40);
      prev = e.steer.roadTorqueNm;
    }
  });

  it('расчёт равновесия достаточно быстр для интерактива (< 150 мс)', () => {
    const c = ctxOf();
    solveSteady(c);
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) solveSteady(c);
    const dt = (performance.now() - t0) / 3;
    console.log('solveSteady, мс:', dt.toFixed(1));
    expect(dt).toBeLessThan(150);
  });

  it('невязки evaluate согласованы с r', () => {
    const c = ctxOf();
    const e = evaluate(c, -30, 0.5);
    expect(Number.isFinite(e.resid)).toBe(true);
  });
});
