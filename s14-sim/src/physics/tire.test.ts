import { describe, expect, it } from 'vitest';
import { tireParams as P } from '../config/tire';
import { tire, type TireInput } from './tire';

const DEG = Math.PI / 180;
const base: TireInput = { alpha: 0, Fz: 4000, gammaInc: 0, pressureBar: 2.2, widthMm: 245 };
const T = (o: Partial<TireInput> = {}) => tire(P, { ...base, ...o });

describe('боковая сила', () => {
  it('Fy(0)=0 без развала и нечётна по α', () => {
    expect(T().Fy).toBeCloseTo(0, 6);
    expect(T({ alpha: 5 * DEG }).Fy).toBeCloseTo(-T({ alpha: -5 * DEG }).Fy, 6);
    expect(T({ alpha: 5 * DEG }).Fy).toBeGreaterThan(0);
  });

  it('наклон кривой в нуле равен Cα', () => {
    const e = 1e-4;
    const slope = T({ alpha: e }).Fy / e;
    expect(slope / T().Calpha).toBeCloseTo(1, 2);
  });

  it('пик ≈ μ·Fz и достигается в разумном диапазоне углов', () => {
    let max = 0;
    let at = 0;
    for (let a = 0; a <= 40; a += 0.1) {
      const f = T({ alpha: a * DEG }).Fy;
      if (f > max) { max = f; at = a; }
    }
    const o = T();
    console.log('Fy пик', max.toFixed(0), 'Н при', at.toFixed(1), '°; μFz', (o.mu * 4000).toFixed(0), 'Cα', (o.Calpha * DEG).toFixed(0), 'Н/°');
    expect(max / (o.mu * 4000)).toBeGreaterThan(0.97);
    expect(max / (o.mu * 4000)).toBeLessThanOrEqual(1.0001);
    expect(at).toBeGreaterThan(4);
    expect(at).toBeLessThan(14);
  });

  it('чувствительность к нагрузке: Fy растёт слабее, чем Fz', () => {
    const a = 8 * DEG;
    const lo = T({ Fz: 2000, alpha: a }).Fy / 2000;
    const hi = T({ Fz: 6000, alpha: a }).Fy / 6000;
    expect(hi).toBeLessThan(lo);
  });

  it('камбер-тяга: наклон влево даёт силу влево при α=0', () => {
    expect(T({ gammaInc: 3 * DEG }).Fy).toBeGreaterThan(0);
    expect(T({ gammaInc: -3 * DEG }).Fy).toBeLessThan(0);
  });

  it('тяга снижает боковую силу по кругу трения', () => {
    const a = 8 * DEG;
    const o = T({ alpha: a });
    const half = T({ alpha: a, Fx: 0.6 * o.mu * 4000 });
    expect(half.Fy).toBeCloseTo(o.Fy * 0.8, 3);
    expect(T({ alpha: a, Fx: 2 * o.mu * 4000 }).Fy).toBeCloseTo(0, 3);
  });
});

describe('давление', () => {
  it('рост давления: короче пятно, меньше трейл, ниже пик, выше жёсткость', () => {
    const lo = T({ pressureBar: 1.6 });
    const hi = T({ pressureBar: 2.8 });
    expect(hi.patchLength).toBeLessThan(lo.patchLength);
    expect(hi.trail0).toBeLessThan(lo.trail0);
    expect(hi.mu).toBeLessThan(lo.mu);
    expect(hi.Calpha).toBeGreaterThan(lo.Calpha);
    console.log('пятно, мм', (lo.patchLength * 1000).toFixed(0), '→', (hi.patchLength * 1000).toFixed(0), '; t0, мм', (lo.trail0 * 1000).toFixed(1), '→', (hi.trail0 * 1000).toFixed(1));
  });
});

describe('пневматический трейл и момент', () => {
  it('t(0)=t0 в диапазоне 15–40 мм', () => {
    const o = T();
    expect(o.trail).toBeCloseTo(o.trail0, 9);
    expect(o.trail0).toBeGreaterThan(0.015);
    expect(o.trail0).toBeLessThan(0.04);
  });

  it('трейл падает с α, пересекает ноль и уходит в минус', () => {
    const o = T();
    let zero = NaN;
    let prev = o.trail;
    let min = 0;
    for (let a = 0.5; a <= 45; a += 0.5) {
      const t = T({ alpha: a * DEG }).trail;
      if (Number.isNaN(zero) && prev > 0 && t <= 0) zero = a;
      min = Math.min(min, t);
      prev = t;
    }
    console.log('ноль трейла при α =', zero, '°, αsl =', (o.alphaSl / DEG).toFixed(1), '°, мин трейл, мм', (min * 1000).toFixed(1));
    expect(zero).toBeGreaterThan(6);
    expect(zero).toBeLessThan(25);
    expect(min).toBeLessThan(0);
  });

  it('Mz < 0 при малом α>0 (самовыравнивание) и меняет знак вместе с трейлом', () => {
    expect(T({ alpha: 2 * DEG }).Mz).toBeLessThan(0);
    expect(T({ alpha: 40 * DEG }).Mz).toBeGreaterThan(0);
  });

  it('трейл чётен по α', () => {
    expect(T({ alpha: 7 * DEG }).trail).toBeCloseTo(T({ alpha: -7 * DEG }).trail, 9);
  });
});
