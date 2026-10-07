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
}

export function compute(cfg: VehicleConfig, s: State, ov?: Overrides): Computed {
  const a = axisFor(cfg, s);
  const mm = cfg.front.rackMmPerSteeringDeg;
  const wantRack = s.steerWheelDeg * mm;
  const rack = ov ? ov.rackMm : Math.max(-a.maxRack, Math.min(a.maxRack, wantRack));
  const rearSetup = { toeDeg: s.rearToeDeg, camberDeg: s.rearCamberDeg };
  return {
    rackMm: rack,
    maxSteerWheelDeg: a.maxRack / mm,
    front: { L: a.axis.wheel('L', rack, ov ? ov.heaveL : s.heaveMm), R: a.axis.wheel('R', rack, ov ? ov.heaveR : s.heaveMm) },
    rear: { L: rearWheel(cfg, rearSetup, 'L'), R: rearWheel(cfg, rearSetup, 'R') },
    armPhiDeg: (a.axis.armPhi * 180) / Math.PI,
    ackermann: a.ackermann,
    bumpSteerDegPer10mm: a.bump,
    camberGainDegPer10mm: a.camberGain,
    limitReached: !ov && Math.abs(wantRack) > a.maxRack + 1e-9,
  };
}
