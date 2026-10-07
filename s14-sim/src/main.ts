import './style.css';
import { vehicle } from './config/vehicle';
import { tireParams } from './config/tire';
import { compute, getAxis, type Computed } from './physics/model';
import { evalAtRack, solveSteady, type DriftCtx, type Eval, type SteadyResult } from './physics/drift';
import { SuspensionScene, type CameraPreset } from './scene/SuspensionScene';
import { Panel } from './ui/panel';
import { TireCharts } from './ui/tireCharts';

const panel = new Panel(document.getElementById('panel')!);
const view = new SuspensionScene(document.getElementById('view')!, vehicle);
const hud = document.getElementById('hud')!;
const driftEl = document.getElementById('drift')!;
const modeDrift = document.getElementById('mode-drift') as HTMLInputElement;
const modeAuto = document.getElementById('mode-auto') as HTMLInputElement;
const tireCharts = new TireCharts(document.getElementById('charts')!, vehicle, () => panel.state);

document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
  b.onclick = () => view.setCamera(b.dataset.cam as CameraPreset);
});

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

function renderHud(m: Computed): void {
  const row = (name: string, l: string, r: string) => `<tr><th>${name}</th><td>${l}</td><td>${r}</td></tr>`;
  const L = m.front.L;
  const R = m.front.R;
  hud.innerHTML = `
    <table>
      <tr><th></th><td class="h">Левое</td><td class="h">Правое</td></tr>
      ${row('Угол колеса, °', f(L.headingDeg), f(R.headingDeg))}
      ${row('Развал, °', f(L.camberDeg, 2), f(R.camberDeg, 2))}
      ${row('Кастер, °', f(L.casterDeg, 2), f(R.casterDeg, 2))}
      ${row('KPI, °', f(L.kpiDeg, 2), f(R.kpiDeg, 2))}
      ${row('Мех. трейл, мм', f(L.trailMm), f(R.trailMm))}
      ${row('Плечо обкатки, мм', f(L.scrubMm), f(R.scrubMm))}
    </table>
    <p>Рейка: <b>${f(m.rackMm)}</b> мм · Аккерман @10/20/35°:
      <b>${f(m.ackermann.at10, 0)}/${f(m.ackermann.at20, 0)}/${f(m.ackermann.at35, 0)} %</b></p>
    <p>Бамп-стир: <b>${f(m.bumpSteerDegPer10mm, 3)}</b> °/10мм · развал-гейн: <b>${f(m.camberGainDegPer10mm, 3)}</b> °/10мм</p>
    ${m.limitReached ? '<p class="warn">Упор: ход рейки / лимит угла колеса / «мёртвая точка» тяги.</p>' : ''}
    ${L.ok && R.ok ? '' : '<p class="warn">Нет решения кинематики для этих параметров.</p>'}`;
}

/** Вердикт по моменту на руле. «Дорога тянет» = момент, с которым руль стремится повернуться сам. */
function verdict(T: number, slipSign: number): string {
  const small = Math.abs(T) < 1;
  if (small) return '<span class="verdict">руль «висит» (момент ≈ 0)</span>';
  // контрруль в заносе противоположен знаку заноса: T того же знака, что и занос, тянет обратно к прямой
  const towardStraight = Math.sign(T) === slipSign;
  return towardStraight
    ? '<span class="verdict warn">тянет обратно (нужно усилие, чтобы держать контрруль)</span>'
    : '<span class="verdict warn">докручивает контрруль сам (нужно удерживать)</span>';
}

function renderDrift(ev: Eval | null, sol: SteadyResult | null, auto: boolean): void {
  if (!ev) {
    driftEl.innerHTML = `<h3>Установившийся занос</h3><p class="warn">${sol?.reason ?? 'нет решения для этих параметров'}</p>`;
    return;
  }
  const s = panel.state;
  const w = Object.fromEntries(ev.wheels.map((x) => [x.id, x]));
  const row = (name: string, a: string, b: string, c: string, d: string) =>
    `<tr><th>${name}</th><td>${a}</td><td>${b}</td><td>${c}</td><td>${d}</td></tr>`;
  const R = ev.r > 1e-3 ? ev.V / ev.r : Infinity;
  const slipSign = Math.sign(s.slipAngleDeg) || 1;
  driftEl.innerHTML = `
    <h3>Установившийся занос ${auto ? '' : '(руль задан вручную)'}</h3>
    <table>
      <tr><th></th><td class="h">ПЛ</td><td class="h">ПП</td><td class="h">ЗЛ</td><td class="h">ЗП</td></tr>
      ${row('Нагрузка, Н', ...(['FL', 'FR', 'RL', 'RR'] as const).map((k) => f(w[k].Fz, 0)) as [string, string, string, string])}
      ${row('Курс колеса, °', ...(['FL', 'FR', 'RL', 'RR'] as const).map((k) => f(w[k].headingDeg)) as [string, string, string, string])}
      ${row('Угол увода, °', ...(['FL', 'FR', 'RL', 'RR'] as const).map((k) => f(w[k].alphaDeg)) as [string, string, string, string])}
      ${row('Боковая сила, Н', ...(['FL', 'FR', 'RL', 'RR'] as const).map((k) => f(w[k].Fy, 0)) as [string, string, string, string])}
      ${row('Пневм. трейл, мм', ...(['FL', 'FR', 'RL', 'RR'] as const).map((k) => f(w[k].pneuTrailMm)) as [string, string, string, string])}
      ${row('Сцепление исп., %', ...(['FL', 'FR', 'RL', 'RR'] as const).map((k) => f(w[k].gripUse * 100, 0)) as [string, string, string, string])}
    </table>
    <p>Руль: <b>${f(ev.rackMm / vehicle.front.rackMmPerSteeringDeg, 0)}°</b> (рейка ${f(ev.rackMm)} мм) ·
       рыскание <b>${f(ev.r, 2)}</b> рад/с · радиус <b>${Number.isFinite(R) ? f(R, 0) : '∞'}</b> м</p>
    <p>Поперечное ускорение <b>${f(ev.ay / 9.81, 2)}</b> g · крен <b>${f(ev.rollDeg, 1)}°</b> ·
       ускорение вдоль скорости <b>${f(ev.aTang, 2)}</b> м/с²</p>
    <p>Момент от дороги на руле: <b>${f(ev.steer.roadTorqueNm, 1)} Н·м</b> (в руке с ГУР ≈ ${f(ev.steer.handTorqueNm, 1)} Н·м)<br>
       Сила на рейке: <b>${f(ev.steer.rackForceN, 0)} Н</b> · ${verdict(ev.steer.roadTorqueNm, slipSign)}</p>
    ${sol && sol.roots.length > 1 ? `<p class="warn">Найдено несколько равновесий: ${sol.roots.map((x) => f(x / vehicle.front.rackMmPerSteeringDeg, 0) + '°').join(', ')}. Показано ближайшее к контррулю.</p>` : ''}
    ${ev.wheels.some((x) => x.gripUse > 0.98) ? '<p class="warn">Часть шин на пределе сцепления.</p>' : ''}`;
}

let tireKey = '';
function updateTire(): void {
  const s = panel.state;
  const k = [s.frontPressureBar, s.rearPressureBar, s.frontCamberDeg, s.rearCamberDeg].join();
  if (k !== tireKey) {
    tireKey = k;
    tireCharts.update();
  }
}

function update(): void {
  const s = panel.state;
  const info = getAxis(vehicle, s);
  let ev: Eval | null = null;
  let sol: SteadyResult | null = null;
  const drift = modeDrift.checked;
  const auto = modeAuto.checked;

  if (drift) {
    const ctx: DriftCtx = {
      cfg: vehicle,
      tireP: tireParams,
      axis: info.axis,
      maxRack: info.maxRack,
      input: {
        slipAngleDeg: s.slipAngleDeg,
        speedKmh: s.speedKmh,
        throttlePct: s.throttlePct,
        frontPressureBar: s.frontPressureBar,
        rearPressureBar: s.rearPressureBar,
        rearToeDeg: s.rearToeDeg,
        rearCamberDeg: s.rearCamberDeg,
      },
    };
    if (auto) {
      sol = solveSteady(ctx);
      ev = sol.eval;
      if (ev) panel.setValue('steerWheelDeg', sol.steerWheelDeg);
    } else {
      const rack = Math.max(-info.maxRack, Math.min(info.maxRack, s.steerWheelDeg * vehicle.front.rackMmPerSteeringDeg));
      ev = evalAtRack(ctx, rack);
    }
  }

  const m = compute(vehicle, s, ev ? { rackMm: ev.rackMm, heaveL: ev.heaveL, heaveR: ev.heaveR } : undefined);
  panel.setRange('steerWheelDeg', -Math.floor(m.maxSteerWheelDeg), Math.floor(m.maxSteerWheelDeg));
  view.update(m, ev);
  renderHud(m);
  driftEl.style.display = drift ? '' : 'none';
  if (drift) renderDrift(ev, sol, auto);
}

panel.onChange(() => {
  update();
  updateTire();
});
modeDrift.onchange = update;
modeAuto.onchange = update;
updateTire();
update();
