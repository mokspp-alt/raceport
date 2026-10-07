import { describe, expect, it } from 'vitest';
import { defaultSetup, vehicle } from '../config/vehicle';
import { tireParams } from '../config/tire';
import { analyze, findBalance, sensitivity, slipCurve, zeroSteer } from './analysis';

const S = { ...defaultSetup };

describe('анализ', () => {
  it('кривые и точка баланса на настройках по умолчанию', () => {
    const t0 = performance.now();
    const a = analyze(vehicle, tireParams, S);
    const dt = performance.now() - t0;
    console.log('analyze, мс:', dt.toFixed(0));
    console.log('slip→T:', a.slip.slip.map((b, i) => `${b}:${a.slip.torque[i]?.toFixed(1) ?? '–'}`).join(' '));
    console.log('balance', JSON.stringify(a.balance), 'eq steer', a.eqSteerDeg?.toFixed(0), 'zero', JSON.stringify(a.zero));
    expect(a.steer.steerDeg.length).toBeGreaterThan(20);
    expect(a.slip.torque.filter((t) => t !== null).length).toBeGreaterThan(10);
    expect(dt).toBeLessThan(1500);
  });

  it('findBalance: линейная интерполяция и знаки', () => {
    const c = { slip: [10, 20, 30], torque: [-10, -2, 6] as (number | null)[], steerDeg: [0, 0, 0] as (number | null)[] };
    const b = findBalance(c, 22);
    expect(b.star).toBeCloseTo(22.5, 6);
    expect(b.slope).toBeCloseTo(0.8, 6);
    expect(b.below).toBe(-1);
    expect(b.above).toBe(1);
  });

  it('findBalance без пересечения: возвращает ближайшую к нулю точку и общий знак', () => {
    const b = findBalance({ slip: [10, 20, 30], torque: [-9, -3, -6], steerDeg: [0, 0, 0] }, 20);
    expect(b.star).toBeNull();
    expect(b.closest).toEqual({ slip: 20, torque: -3 });
    expect(b.sign).toBe(-1);
  });

  it('zeroSteer: находит ноль и наклон', () => {
    const z = zeroSteer({ steerDeg: [-100, 0, 100], torque: [10, 0.0001, -10], alphaIn: [], alphaOut: [], camberIn: [], camberOut: [] }, 0);
    expect(z.slopePer100).toBeCloseTo(-10, 2);
  });

  it('больше кастера ⇒ больше механический трейл ⇒ сильнее «докручивает контрруль» (T отрицательнее)', () => {
    const lo = analyze(vehicle, tireParams, { ...S, casterDeg: 5 });
    const hi = analyze(vehicle, tireParams, { ...S, casterDeg: 9 });
    const i = lo.slip.slip.findIndex((b) => b >= 30);
    console.log('T@30°: кастер 5/9', lo.slip.torque[i]?.toFixed(1), hi.slip.torque[i]?.toFixed(1));
    expect(hi.slip.torque[i]!).toBeLessThan(lo.slip.torque[i]!);
  });

  it('чувствительность считается и ранжируется', async () => {
    const t0 = performance.now();
    const r = await sensitivity(vehicle, tireParams, S);
    console.log('sensitivity, мс:', (performance.now() - t0).toFixed(0), 'baseStar', r.baseStar);
    for (const x of r.rows) console.log(x.label.padEnd(22), 'dβ*', x.dStar?.toFixed(2) ?? '–', ' dT', x.dTorque?.toFixed(2) ?? '–');
    expect(r.rows.length).toBe(9);
  }, 30000);
});

it('slipCurve: непрерывность по углу заноса', () => {
  const c = slipCurve(vehicle, tireParams, S);
  const ts = c.torque.filter((t): t is number => t !== null);
  for (let i = 1; i < ts.length; i++) expect(Math.abs(ts[i] - ts[i - 1])).toBeLessThan(25);
});
