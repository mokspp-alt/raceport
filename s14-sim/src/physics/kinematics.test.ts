import { describe, expect, it } from 'vitest';
import { vehicle, defaultSetup } from '../config/vehicle';
import { FrontAxle, rearWheel, type FrontSetup } from './kinematics';
import { DEG } from './math';

const base: FrontSetup = {
  rackOffsetMm: 0,
  toeDeg: 0,
  camberDeg: 0,
  casterDeg: 0,
  ackermannPct: 50,
};
const ax = (o: Partial<FrontSetup> = {}) => FrontAxle.create(vehicle, { ...base, ...o });

describe('статика передней оси', () => {
  it('заданные развал, кастер, схождение воспроизводятся', () => {
    const a = ax({ camberDeg: -4, casterDeg: 7, toeDeg: 0.3 });
    for (const side of ['L', 'R'] as const) {
      const w = a.wheel(side, 0);
      expect(w.camberDeg).toBeCloseTo(-4, 3);
      expect(w.casterDeg).toBeCloseTo(7, 3);
      expect(w.toeInDeg).toBeCloseTo(0.3, 4);
    }
  });

  it('левое и правое колесо зеркальны при прямом руле', () => {
    const a = ax({ camberDeg: -3, casterDeg: 6, toeDeg: -0.2 });
    const l = a.wheel('L', 0);
    const r = a.wheel('R', 0);
    expect(r.p.wc[1]).toBeCloseTo(-l.p.wc[1], 6);
    expect(r.p.contact[1]).toBeCloseTo(-l.p.contact[1], 6);
    expect(r.trailMm).toBeCloseTo(l.trailMm, 6);
    expect(r.scrubMm).toBeCloseTo(l.scrubMm, 6);
  });

  it('механический трейл ≈ R·tan(кастер) при нулевом развале', () => {
    const a = ax({ casterDeg: 7 });
    const w = a.wheel('L', 0);
    expect(w.trailMm).toBeCloseTo(a.R * Math.tan(7 * DEG), 0);
  });

  it('плечо обкатки равно конфигу при нулевых развале и кастере', () => {
    const w = ax().wheel('L', 0);
    expect(w.scrubMm).toBeCloseTo(vehicle.front.scrubMm, 2);
    expect(w.kpiDeg).toBeCloseTo(vehicle.front.kpiDeg, 3);
  });

  it('пятно контакта лежит на земле (z≈0; остаток — «подъём» от поворота кулака на δ0)', () => {
    const w = ax({ camberDeg: -5, casterDeg: 8 }).wheel('L', 0);
    expect(Math.abs(w.p.contact[2])).toBeLessThan(0.5);
  });
});

describe('поворот руля и Аккерман', () => {
  it('руль влево поворачивает оба колеса влево, левое — внутреннее', () => {
    const a = ax({ ackermannPct: 100 });
    const l = a.wheel('L', 20);
    const r = a.wheel('R', 20);
    expect(l.headingDeg).toBeGreaterThan(5);
    expect(r.headingDeg).toBeGreaterThan(5);
    expect(l.headingDeg).toBeGreaterThan(r.headingDeg);
  });

  it('руль вправо — зеркально', () => {
    const a = ax({ ackermannPct: 70 });
    const l = a.wheel('L', 60);
    const r = a.wheel('R', -60);
    expect(l.headingDeg).toBeCloseTo(-r.headingDeg, 6);
  });

  it('анти-Аккерман: внешнее колесо поворачивается больше внутреннего', () => {
    const a = ax({ ackermannPct: -50 });
    const l = a.wheel('L', 60);
    const r = a.wheel('R', 60);
    expect(r.headingDeg).toBeGreaterThan(l.headingDeg);
  });

  it('измеренный Аккерман растёт вместе с заданным', () => {
    const set = [-50, 0, 50, 100];
    const v = set.map((p) => ax({ ackermannPct: p }).measuredAckermannPct(20));
    set.forEach((p, i) => expect(v[i]).toBeCloseTo(p, 0));
  });

  it('сдвиг рейки меняет измеренный Аккерман (угол рычага зафиксирован)', () => {
    const a0 = ax({ ackermannPct: 50 });
    const a1 = FrontAxle.create(vehicle, { ...base, ackermannPct: 50, rackOffsetMm: 30 });
    const a2 = FrontAxle.create(vehicle, { ...base, ackermannPct: 50, rackOffsetMm: -30 });
    const m = [a2, a0, a1].map((a) => a.measuredAckermannPct(20));
    console.log('Аккерман при рейке −30/0/+30 мм', m.map((x) => x.toFixed(1)));
    expect(Math.abs(m[0] - m[2])).toBeGreaterThan(1);
  });

  it('на упоре рейки внутреннее колесо ≥ 55°, решение существует', () => {
    const a = ax({ casterDeg: 7, camberDeg: -4, ackermannPct: 50 });
    const r = a.maxRackMm();
    const l = a.wheel('L', r);
    const rr = a.wheel('R', r);
    console.log('maxRack', r, 'внутр', l.headingDeg.toFixed(1), 'внеш', rr.headingDeg.toFixed(1));
    expect(l.ok && rr.ok).toBe(true);
    expect(l.headingDeg).toBeGreaterThanOrEqual(55);
  });

  it('развал при повороте руля меняется за счёт кастера (внешнее колесо — в минус)', () => {
    const a = ax({ casterDeg: 7, camberDeg: 0 });
    const l = a.wheel('L', 60); // внутреннее при левом повороте
    const r = a.wheel('R', 60); // внешнее
    console.log('развал при 60мм рейки: внутр', l.camberDeg.toFixed(2), 'внеш', r.camberDeg.toFixed(2));
    expect(r.camberDeg).toBeLessThan(0);
    expect(l.camberDeg).toBeGreaterThan(0);
  });
});

describe('ход подвески', () => {
  it('при сжатии развал уходит в минус (верхний рычаг короче нижнего)', () => {
    const a = ax({ camberDeg: -2, casterDeg: 6 });
    const g = a.camberGainDegPer10mm();
    console.log('camber gain deg/10mm', g.toFixed(3), 'bump steer deg/10mm', a.bumpSteerDegPer10mm().toFixed(3));
    expect(g).toBeLessThan(0);
    expect(g).toBeGreaterThan(-1);
  });

  it('четырёхзвенка сходится во всём диапазоне ±80 мм', () => {
    const a = ax({ camberDeg: -4, casterDeg: 7 });
    for (const h of [-80, -40, 0, 40, 80]) expect(a.wheel('L', 0, h).ok).toBe(true);
  });

  it('при нулевом ходе схождение не зависит от хода (непрерывность)', () => {
    const a = ax({ toeDeg: 0.2 });
    expect(a.wheel('L', 0, 0).toeInDeg).toBeCloseTo(0.2, 4);
    expect(a.wheel('L', 0, 0.001).toeInDeg).toBeCloseTo(0.2, 3);
  });
});

describe('задняя ось', () => {
  it('статические развал и схождение', () => {
    const l = rearWheel(vehicle, { toeDeg: 0.3, camberDeg: -1.5 }, 'L');
    const r = rearWheel(vehicle, { toeDeg: 0.3, camberDeg: -1.5 }, 'R');
    for (const w of [l, r]) {
      expect(w.camberDeg).toBeCloseTo(-1.5, 4);
      expect(w.toeInDeg).toBeCloseTo(0.3, 4);
      expect(w.p.contact[2]).toBeCloseTo(0, 6);
    }
  });
});

it('настройки по умолчанию решаются', () => {
  const a = FrontAxle.create(vehicle, {
    rackOffsetMm: defaultSetup.rackOffsetMm,
    toeDeg: defaultSetup.frontToeDeg,
    camberDeg: defaultSetup.frontCamberDeg,
    casterDeg: defaultSetup.casterDeg,
    ackermannPct: defaultSetup.ackermannPct,
  });
  expect(a.wheel('L', 50).ok).toBe(true);
});
