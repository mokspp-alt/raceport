/**
 * КИНЕМАТИКА ПЕРЕДНЕЙ ПОДВЕСКИ (двойной рычаг + рейка + поперечная тяга) И ЗАДНИХ КОЛЁС.
 *
 * Модель — настоящая 3D-геометрия по точкам, а не табличные поправки.
 *
 * Кулак — жёсткое тело. Его точки заданы в собственной системе K (левое колесо):
 *   начало = центр колеса, оси как у машины, развал = 0, кастер = 0, схождение = 0.
 *   В K лежат: ось поворота (kingpin), шаровые LBJ/UBJ, шарнир тяги OTR, ось ступицы (0,1,0).
 *
 * Положение точки p_K кулака в машине получается цепочкой:
 *   1) поворот руля: вращение вокруг оси kingpin на угол δ          (steer)
 *   2) статическая настройка: развал (вокруг X) и кастер (вокруг Y) (static)
 *      + перенос центра колеса в его точку (0, колея/2, R)
 *   3) ход подвески: поворот кулака вокруг X + сдвиг по Y, Z        (heave)
 *
 * Угол δ определяется замкнутой цепью «рейка → тяга → кулак»:
 *   |OTR(δ) − ITR(рейка)| = L   (L — длина тяги, неизменна).
 * Длина L подбирается так, чтобы при центральной рейке схождение равнялось заданному.
 *
 * Ход подвески — плоская (YZ) четырёхзвенка: LBJ на окружности вокруг внутреннего
 * шарнира нижнего рычага, UBJ — вокруг верхнего. Продольные смещения рычагов в расчёте
 * хода не учитываются (допущение, см. README).
 *
 * Левая сторона считается напрямую. Правая — зеркально: вход рейки меняет знак,
 * все точки и векторы отражаются по Y.
 */

import type { VehicleConfig } from '../config/vehicle';
import { tireRadius } from '../config/vehicle';
import {
  DEG,
  V3,
  add,
  bisect,
  dot,
  len,
  mirrorY,
  rotAxis,
  rotX,
  rotY,
  rotZ,
  sub,
  mul,
  unit,
} from './math';

export interface FrontSetup {
  rackOffsetMm: number; // + вперёд
  toeDeg: number; // на колесо, + toe-in
  camberDeg: number; // − верх внутрь
  casterDeg: number;
  ackermannPct: number; // 0 = параллельно, 100 = полный, <0 = анти
}

export interface RearSetup {
  toeDeg: number;
  camberDeg: number;
}

export type Side = 'L' | 'R';

export interface WheelGeom {
  side: Side;
  ok: boolean;
  /** Поворот кулака вокруг оси поворота, град. */
  kingpinDeg: number;
  /** Курс колеса в плане, град (+ влево), включает статическое схождение. */
  headingDeg: number;
  /** Схождение, град (+ toe-in). */
  toeInDeg: number;
  camberDeg: number;
  casterDeg: number;
  kpiDeg: number;
  /** Механический трейл вдоль курса колеса, мм (+ ось пересекает землю впереди пятна). */
  trailMm: number;
  /** Плечо обкатки поперёк курса колеса, мм (+ ось внутри пятна). */
  scrubMm: number;
  /** Точки в координатах машины (уже с учётом стороны). */
  p: {
    wc: V3;
    contact: V3;
    lbj: V3;
    ubj: V3;
    otr: V3;
    itr: V3;
    axisGround: V3;
    lcaFront: V3;
    lcaRear: V3;
    ucaFront: V3;
    ucaRear: V3;
  };
  /** Единичная ось ступицы, наружу. */
  spin: V3;
  /** Радиус шины, мм. */
  tireR: number;
}

interface Knuckle {
  axisPoint: V3;
  axisDir: V3;
  lbj: V3;
  ubj: V3;
  otr: V3;
}

interface HeaveSol {
  dy: number;
  rho: number;
  ok: boolean;
}

/** Курс (угол оси качения в плане, + влево) и развал по единичной оси ступицы s (наружу). */
function wheelAngles(s: V3): { headingRad: number; camberRad: number } {
  return { headingRad: Math.atan2(-s[0], s[1]), camberRad: -Math.asin(Math.max(-1, Math.min(1, s[2]))) };
}

/** Пятно контакта: самая нижняя точка колеса. */
function contactPoint(wc: V3, s: V3, R: number): V3 {
  const down: V3 = [0, 0, -1];
  const inPlane = unit(sub(down, mul(s, dot(down, s))));
  return add(wc, mul(inPlane, R));
}

export class FrontAxle {
  readonly cfg: VehicleConfig;
  readonly setup: FrontSetup;
  readonly R: number;
  /** Знак смещения рейки (вдоль Y левой стороны) при повороте руля влево. */
  readonly dir: number;
  /** Длина рулевого рычага (из конфига) — для первой оценки угла. */
  private readonly K: Knuckle;
  private wcw: V3;
  private casterRad: number;
  private camberRad: number;
  private readonly rackX: number;
  private readonly L: number;
  private readonly delta0: number;
  private heaveCache = new Map<number, HeaveSol>();

  /** Угол рулевого рычага в плане относительно «параллельного», рад (+ = в сторону полного Аккермана). */
  readonly armPhi: number;

  /**
   * Создать ось. Слайдер «Аккерман, %» — это ИЗМЕРЕННЫЙ Аккерман (при внутреннем колесе 20°,
   * штатной рейке): угол рычага подбирается секущими. Угол рычага затем фиксируется,
   * поэтому сдвиг рейки меняет измеренный Аккерман — так и должно быть.
   */
  static create(cfg: VehicleConfig, setup: FrontSetup): FrontAxle {
    const target = setup.ackermannPct;
    const ref = { ...setup, rackOffsetMm: 0 };
    const ky = cfg.trackFront / 2 - cfg.front.scrubMm;
    const nominal = Math.atan(ky / cfg.wheelbase);
    const err = (phi: number) => new FrontAxle(cfg, ref, phi).measuredAckermannPct(20) - target;
    let x0 = (target / 100) * nominal;
    let x1 = x0 + 0.02;
    let f0 = err(x0);
    for (let i = 0; i < 12 && Math.abs(f0) > 0.02; i++) {
      const f1 = err(x1);
      if (Math.abs(f1 - f0) < 1e-12) break;
      const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
      x0 = x1;
      f0 = f1;
      x1 = Math.max(-1, Math.min(1, x2));
      if (Math.abs(f1) <= 0.02) {
        x0 = x1 = x0;
        break;
      }
    }
    const phi = Math.abs(err(x1)) < Math.abs(f0) ? x1 : x0;
    return new FrontAxle(cfg, setup, phi);
  }

  constructor(cfg: VehicleConfig, setup: FrontSetup, armPhi?: number) {
    this.cfg = cfg;
    this.setup = setup;
    this.armPhi = armPhi ?? (setup.ackermannPct / 100) * Math.atan((cfg.trackFront / 2 - cfg.front.scrubMm) / cfg.wheelbase);
    const f = cfg.front;
    this.R = tireRadius(cfg.tires.front);
    this.dir = f.armSide === 'rear' ? -1 : 1;
    this.casterRad = setup.casterDeg * DEG;
    this.camberRad = setup.camberDeg * DEG;
    this.wcw = [0, cfg.trackFront / 2, this.R];
    this.rackX = f.rackX + setup.rackOffsetMm;
    this.K = this.buildKnuckle();

    // Статические углы взаимозависимы (кастер наклоняет ось, развал наклоняет колесо вместе
    // с осью), поэтому подгоняем углы поворота кулака так, чтобы ИЗМЕРЕННЫЕ развал, кастер и
    // схождение совпали с заданными. Хватает нескольких итераций: связь очень слабая.
    const toeRad = setup.toeDeg * DEG;
    const h0: HeaveSol = { dy: 0, rho: 0, ok: true };
    const heading = (d: number) => wheelAngles(this.chainDir([0, 1, 0], d, h0)).headingRad;
    let d0 = 0;
    for (let it = 0; it < 6; it++) {
      d0 = bisect((d) => heading(d) + toeRad, -0.5, 0.5, 1e-12);
      const camberNow = wheelAngles(this.chainDir([0, 1, 0], d0, h0)).camberRad;
      const aNow = this.staticRot(this.K.axisDir);
      const casterNow = Math.atan2(-aNow[0], aNow[2]);
      this.camberRad += this.setup.camberDeg * DEG - camberNow;
      this.casterRad += this.setup.casterDeg * DEG - casterNow;
    }
    this.delta0 = bisect((d) => heading(d) + toeRad, -0.5, 0.5, 1e-12);
    // Центр колеса: чтобы пятно лежало на земле, высота = R·cos(развал).
    this.wcw = [0, cfg.trackFront / 2, this.R * Math.cos(setup.camberDeg * DEG)];
    // Длина тяги при центральной рейке и нулевом ходе.
    this.L = len(sub(this.chain(this.K.otr, this.delta0, h0, 0), this.itrPoint(0)));
  }

  /** Кулак в системе K (левая сторона). */
  private buildKnuckle(): Knuckle {
    const { cfg, R } = this;
    const f = cfg.front;
    const kpi = f.kpiDeg * DEG;
    const gK: V3 = [0, -f.scrubMm, -R]; // точка оси на уровне земли
    const aK = unit([0, -Math.tan(kpi), 1] as V3);
    const onAxis = (zWorld: number): V3 => {
      const zk = zWorld - R;
      return add(gK, mul(aK, (zk - gK[2]) / aK[2]));
    };
    // Аккерман: рычаг тяги в плане смотрит на центр задней оси при 100%.
    const phi = this.armPhi;
    const sx = f.armSide === 'rear' ? -1 : 1;
    const arm: V3 = [sx * Math.cos(phi) * f.steeringArmLen, sx * Math.sin(phi) * f.steeringArmLen, 0];
    return {
      axisPoint: gK,
      axisDir: aK,
      lbj: onAxis(f.lbjZ),
      ubj: onAxis(f.ubjZ),
      otr: add(onAxis(f.otrZ), arm),
    };
  }

  // ——— цепочка преобразований ———

  private steerRot(v: V3, d: number): V3 {
    return rotAxis(v, this.K.axisDir, d);
  }
  private staticRot(v: V3): V3 {
    // развал: Rx(−γ); кастер: Ry(−c) (верх оси назад при +кастере)
    return rotY(rotX(v, -this.camberRad), -this.casterRad);
  }
  private staticPoint(p: V3): V3 {
    return add(this.staticRot(p), this.wcw);
  }
  private heavePoint(p: V3, hv: HeaveSol, h: number): V3 {
    const r = rotX(sub(p, this.wcw), hv.rho);
    return [this.wcw[0] + r[0], this.wcw[1] + r[1] + hv.dy, this.wcw[2] + r[2] + h];
  }
  /** Точка кулака (система K) → машина. */
  private chain(pK: V3, d: number, hv: HeaveSol, h: number): V3 {
    const q = add(this.K.axisPoint, this.steerRot(sub(pK, this.K.axisPoint), d));
    return this.heavePoint(this.staticPoint(q), hv, h);
  }
  private chainDir(vK: V3, d: number, hv: HeaveSol): V3 {
    return rotX(this.staticRot(this.steerRot(vK, d)), hv.rho);
  }
  /** Внутренний шарнир тяги (левая сторона); rackY — смещение рейки по Y. */
  private itrPoint(rackY: number): V3 {
    const f = this.cfg.front;
    return [this.rackX, f.rackHalfWidth + rackY, f.rackZ];
  }

  /** Плоская четырёхзвенка: найти (dy, ρ) для хода колеса h. */
  private solveHeave(h: number): HeaveSol {
    const cached = this.heaveCache.get(h);
    if (cached) return cached;
    const f = this.cfg.front;
    const lbjS = this.staticPoint(this.K.lbj);
    const ubjS = this.staticPoint(this.K.ubj);
    const d2 = (p: V3, y: number, z: number) => Math.hypot(p[1] - y, p[2] - z);
    const r1 = d2(lbjS, f.lcaIn.y, f.lcaIn.z);
    const r2 = d2(ubjS, f.ucaIn.y, f.ucaIn.z);
    const res = (dy: number, rho: number): [number, number] => {
      const a = this.heavePoint(lbjS, { dy, rho, ok: true }, h);
      const b = this.heavePoint(ubjS, { dy, rho, ok: true }, h);
      return [d2(a, f.lcaIn.y, f.lcaIn.z) - r1, d2(b, f.ucaIn.y, f.ucaIn.z) - r2];
    };
    let dy = 0;
    let rho = 0;
    let ok = false;
    for (let it = 0; it < 50; it++) {
      const [f1, f2] = res(dy, rho);
      if (Math.hypot(f1, f2) < 1e-9) {
        ok = true;
        break;
      }
      const e = 1e-6;
      const [a1, a2] = res(dy + e, rho);
      const [b1, b2] = res(dy, rho + e);
      const j11 = (a1 - f1) / e;
      const j21 = (a2 - f2) / e;
      const j12 = (b1 - f1) / e;
      const j22 = (b2 - f2) / e;
      const det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-12) break;
      dy -= (j22 * f1 - j12 * f2) / det;
      rho -= (-j21 * f1 + j11 * f2) / det;
    }
    const sol = { dy, rho, ok };
    this.heaveCache.set(h, sol);
    return sol;
  }

  /** Решить δ из замкнутой цепи рейка–тяга–кулак. */
  private solveDelta(rackY: number, hv: HeaveSol, h: number, guess: number): { delta: number; ok: boolean } {
    const itr = this.itrPoint(rackY);
    const g = (d: number) => len(sub(this.chain(this.K.otr, d, hv, h), itr)) - this.L;
    // Ньютон из начального приближения
    let d = guess;
    for (let it = 0; it < 40; it++) {
      const gv = g(d);
      if (Math.abs(gv) < 1e-9) return { delta: d, ok: true };
      const e = 1e-6;
      const dg = (g(d + e) - gv) / e;
      if (Math.abs(dg) < 1e-9) break;
      const step = -gv / dg;
      d += Math.max(-0.2, Math.min(0.2, step));
    }
    // Запасной путь: ищем смену знака вокруг начального приближения
    const step = 0.5 * DEG;
    let best: { lo: number; hi: number } | null = null;
    let bestDist = Infinity;
    for (let a = -130 * DEG; a < 130 * DEG; a += step) {
      if (Math.sign(g(a)) !== Math.sign(g(a + step))) {
        const dist = Math.abs(a + step / 2 - guess);
        if (dist < bestDist) {
          bestDist = dist;
          best = { lo: a, hi: a + step };
        }
      }
    }
    if (best) return { delta: bisect(g, best.lo, best.hi, 1e-9), ok: true };
    return { delta: guess, ok: false };
  }

  /** Состояние колеса при смещении рейки rackMm (+ = руль влево) и ходе heaveMm (+ = сжатие). */
  wheel(side: Side, rackMm: number, heaveMm = 0): WheelGeom {
    const rackY = (side === 'L' ? 1 : -1) * this.dir * rackMm;
    const hv = this.solveHeave(heaveMm);
    const f = this.cfg.front;
    const armLen = f.steeringArmLen;
    const sol = this.solveDelta(rackY, hv, heaveMm, this.delta0 + (side === 'L' ? 1 : -1) * (rackMm / armLen));
    const d = sol.delta;

    const s = this.chainDir([0, 1, 0], d, hv);
    const wc = this.chain([0, 0, 0], d, hv, heaveMm);
    const { headingRad, camberRad } = wheelAngles(s);
    const contact = contactPoint(wc, s, this.R);
    const lbj = this.chain(this.K.lbj, d, hv, heaveMm);
    const ubj = this.chain(this.K.ubj, d, hv, heaveMm);
    const otr = this.chain(this.K.otr, d, hv, heaveMm);
    const a = unit(sub(ubj, lbj));
    const axisGround = add(lbj, mul(a, (contact[2] - lbj[2]) / a[2]));
    const fwd: V3 = [Math.cos(headingRad), Math.sin(headingRad), 0];
    const lat: V3 = [-Math.sin(headingRad), Math.cos(headingRad), 0];
    const trail = dot(sub(axisGround, contact), fwd);
    const scrub = dot(sub(contact, axisGround), lat);

    const p = {
      wc,
      contact,
      lbj,
      ubj,
      otr,
      itr: this.itrPoint(rackY),
      axisGround,
      lcaFront: [f.lcaIn.xFront, f.lcaIn.y, f.lcaIn.z] as V3,
      lcaRear: [f.lcaIn.xRear, f.lcaIn.y, f.lcaIn.z] as V3,
      ucaFront: [f.ucaIn.xFront, f.ucaIn.y, f.ucaIn.z] as V3,
      ucaRear: [f.ucaIn.xRear, f.ucaIn.y, f.ucaIn.z] as V3,
    };
    const sgn = side === 'L' ? 1 : -1;
    const out = side === 'L' ? p : (Object.fromEntries(Object.entries(p).map(([k, v]) => [k, mirrorY(v)])) as typeof p);
    return {
      side,
      ok: sol.ok && hv.ok,
      kingpinDeg: (sgn * d) / DEG,
      headingDeg: (sgn * headingRad) / DEG,
      toeInDeg: -headingRad / DEG,
      camberDeg: camberRad / DEG,
      casterDeg: Math.atan2(-a[0], a[2]) / DEG,
      kpiDeg: Math.atan2(-a[1], a[2]) / DEG,
      trailMm: trail,
      scrubMm: scrub,
      p: out,
      spin: side === 'L' ? s : mirrorY(s),
      tireR: this.R,
    };
  }

  /** Бамп-стир: изменение схождения на колесо при сжатии на 10 мм, град (+ toe-in). */
  bumpSteerDegPer10mm(side: Side = 'L'): number {
    return this.wheel(side, 0, 10).toeInDeg - this.wheel(side, 0, 0).toeInDeg;
  }

  /** Развал-гейн: изменение развала при сжатии на 10 мм, град. */
  camberGainDegPer10mm(side: Side = 'L'): number {
    return this.wheel(side, 0, 10).camberDeg - this.wheel(side, 0, 0).camberDeg;
  }

  /**
   * Измеренный Аккерман, % — при внутреннем колесе, повёрнутом на `innerDeg` относительно прямой.
   * Идеал: cot(δ_внеш) − cot(δ_внутр) = t / L. Параллельно = 0 %, анти < 0 %.
   */
  measuredAckermannPct(innerDeg = 20): number {
    const base = this.wheel('L', 0).headingDeg;
    const inner = (r: number) => this.wheel('L', r).headingDeg - base;
    const hi = this.cfg.front.rackHalfStroke;
    if (inner(hi) < innerDeg) return NaN;
    const r = bisect((x) => inner(x) - innerDeg, 0, hi, 1e-6);
    const di = (inner(r) * DEG);
    const dRight = (this.wheel('R', r).headingDeg - this.wheel('R', 0).headingDeg) * DEG;
    const t = this.cfg.trackFront - 2 * this.cfg.front.scrubMm;
    const ideal = t / this.cfg.wheelbase;
    const cot = (x: number) => 1 / Math.tan(x);
    return ((cot(dRight) - cot(di)) / ideal) * 100;
  }

  /**
   * Максимальное смещение рейки, мм: ограничено ходом рейки, лимитом угла колеса (Wisefab)
   * и «мёртвой точкой» тяги (когда тяга и рычаг становятся в одну линию — решения нет).
   */
  maxRackMm(): number {
    const lim = this.cfg.front.maxWheelAngleDeg;
    const base = this.wheel('L', 0).headingDeg;
    let last = 0;
    for (let r = 1; r <= this.cfg.front.rackHalfStroke; r++) {
      const l = this.wheel('L', r);
      const rr = this.wheel('R', r);
      if (!l.ok || !rr.ok) break;
      if (Math.max(l.headingDeg - base, rr.headingDeg - base) > lim) break;
      last = r;
    }
    return last;
  }

  /** Смещение рейки, мм, при котором курс колеса (относительно прямой) достигает заданного угла. */
  rackForInnerAngle(deg: number): number {
    const base = this.wheel('L', 0).headingDeg;
    const hi = this.cfg.front.rackHalfStroke * 1.5;
    return bisect((x) => this.wheel('L', x).headingDeg - base - deg, 0, hi, 1e-6);
  }
}

/** Заднее колесо: развал и схождение (схематично); ход подвески — линейные развал-гейн и бамп-стир. */
export function rearWheel(cfg: VehicleConfig, setup: RearSetup, side: Side, heaveMm = 0): WheelGeom {
  const R = tireRadius(cfg.tires.rear);
  // ход подвески (+ сжатие): развал-гейн и бамп-стир задней оси — линейные коэффициенты из конфига
  const gamma = (setup.camberDeg + cfg.rear.camberGainDegPer10mm * (heaveMm / 10)) * DEG;
  const psi = -(setup.toeDeg + cfg.rear.bumpSteerDegPer10mm * (heaveMm / 10)) * DEG;
  const s = rotZ(rotX([0, 1, 0], -gamma), psi);
  const wc: V3 = [-cfg.wheelbase, cfg.trackRear / 2, R * Math.cos(gamma) + heaveMm];
  const contact = contactPoint(wc, s, R);
  const { headingRad, camberRad } = wheelAngles(s);
  const ai = cfg.rear.armInner;
  const pL = {
    wc,
    contact,
    lbj: add(wc, [0, -60, -150]) as V3,
    ubj: add(wc, [0, -40, 230]) as V3,
    otr: add(wc, [-90, -60, -90]) as V3,
    itr: [-cfg.wheelbase - 110, 330, 200] as V3,
    axisGround: contact,
    lcaFront: [-cfg.wheelbase + ai.xFront, ai.y, ai.z] as V3,
    lcaRear: [-cfg.wheelbase + ai.xRear, ai.y, ai.z] as V3,
    ucaFront: [-cfg.wheelbase + ai.xFront, ai.y + 40, ai.z + 380] as V3,
    ucaRear: [-cfg.wheelbase + ai.xRear, ai.y + 40, ai.z + 380] as V3,
  };
  const p = side === 'L' ? pL : (Object.fromEntries(Object.entries(pL).map(([k, v]) => [k, mirrorY(v)])) as typeof pL);
  const sgn = side === 'L' ? 1 : -1;
  return {
    side,
    ok: true,
    kingpinDeg: 0,
    headingDeg: (sgn * headingRad) / DEG,
    toeInDeg: -headingRad / DEG,
    camberDeg: camberRad / DEG,
    casterDeg: 0,
    kpiDeg: 0,
    trailMm: 0,
    scrubMm: 0,
    p,
    spin: side === 'L' ? s : mirrorY(s),
    tireR: R,
  };
}
