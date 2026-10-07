/** Сборка расчёта по состоянию UI: передняя и задняя ось, измеренные величины. */

import type { State, VehicleConfig } from '../config/vehicle';
import { FrontAxle, rearWheel, type WheelGeom } from './kinematics';

export interface Computed {
  rackMm: number;
  maxSteerWheelDeg: number;
  front: { L: WheelGeom; R: WheelGeom };
  rear: { L: WheelGeom; R: WheelGeom };
  armPhiDeg: number;
  ackermann: { at10: number; at20: number; at35: number };
  bumpSteerDegPer10mm: number;
  camberGainDegPer10mm: number;
  /** Угол руля, при котором упирается рейка/лимит колеса/мёртвая точка тяги. */
  limitReached: boolean;
  /** Центр тяжести с учётом высоты подвески: x от передней оси (назад −), z от земли, мм. */
  cg: { xMm: number; zMm: number };
}

export interface AxisCache {
  key: string;
  axis: FrontAxle;
  maxRack: number;
  ackermann: Computed['ackermann'];
  bump: number;
  camberGain: number;
}
let cache: AxisCache | null = null;

function axisFor(cfg: VehicleConfig, s: State): AxisCache {
  const setup = {
    rackOffsetMm: s.rackOffsetMm,
    toeDeg: s.frontToeDeg,
    camberDeg: s.frontCamberDeg,
    casterDeg: s.casterDeg,
    ackermannPct: s.ackermannPct,
  };
  const key = JSON.stringify(setup);
  if (cache && cache.key === key) return cache;
  const axis = FrontAxle.create(cfg, setup);
  cache = {
    key,
    axis,
    maxRack: axis.maxRackMm(),
    ackermann: {
      at10: axis.measuredAckermannPct(10),
      at20: axis.measuredAckermannPct(20),
      at35: axis.measuredAckermannPct(35),
    },
    bump: axis.bumpSteerDegPer10mm(),
    camberGain: axis.camberGainDegPer10mm(),
  };
  return cache;
}

/** Ось и предрасчитанные величины для текущих настроек (кэшируется). */
export function getAxis(cfg: VehicleConfig, s: State): AxisCache {
  return axisFor(cfg, s);
}

export interface Overrides {
  rackMm: number;
  heaveL: number;
  heaveR: number;
  /** Готовые задние колёса (с учётом высоты и крена). */
  rear?: { L: WheelGeom; R: WheelGeom };
}

export function compute(cfg: VehicleConfig, s: State, ov?: Overrides): Computed {
  const a = axisFor(cfg, s);
  const mm = cfg.front.rackMmPerSteeringDeg;
  const wantRack = s.steerWheelDeg * mm;
  const rack = ov ? ov.rackMm : Math.max(-a.maxRack, Math.min(a.maxRack, wantRack));
  const rearSetup = { toeDeg: s.rearToeDeg, camberDeg: s.rearCamberDeg };
  const dF = s.frontRideHeightMm - cfg.rideHeight.frontRefMm;
  const dR = s.rearRideHeightMm - cfg.rideHeight.rearRefMm;
  const heaveStatic = s.heaveMm - dF; // + сжатие: ниже опорной высоты = в ходе сжатия
  const wf = s.frontWeightPct / 100;
  return {
    cg: { xMm: -(1 - wf) * cfg.wheelbase, zMm: s.cgHeightMm + wf * dF + (1 - wf) * dR },
    rackMm: rack,
    maxSteerWheelDeg: a.maxRack / mm,
    front: { L: a.axis.wheel('L', rack, ov ? ov.heaveL : heaveStatic), R: a.axis.wheel('R', rack, ov ? ov.heaveR : heaveStatic) },
    rear: ov?.rear ?? { L: rearWheel(cfg, rearSetup, 'L', -dR), R: rearWheel(cfg, rearSetup, 'R', -dR) },
    armPhiDeg: (a.axis.armPhi * 180) / Math.PI,
    ackermann: a.ackermann,
    bumpSteerDegPer10mm: a.bump,
    camberGainDegPer10mm: a.camberGain,
    limitReached: !ov && Math.abs(wantRack) > a.maxRack + 1e-9,
  };
}
