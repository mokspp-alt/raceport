import './style.css';
import { vehicle } from './config/vehicle';
import { compute, type Computed } from './physics/model';
import { SuspensionScene, type CameraPreset } from './scene/SuspensionScene';
import { Panel } from './ui/panel';
import { TireCharts } from './ui/tireCharts';

const panel = new Panel(document.getElementById('panel')!);
const view = new SuspensionScene(document.getElementById('view')!, vehicle);
const hud = document.getElementById('hud')!;
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

function update(): void {
  const m = compute(vehicle, panel.state);
  panel.setRange('steerWheelDeg', -Math.floor(m.maxSteerWheelDeg), Math.floor(m.maxSteerWheelDeg));
  if (Math.abs(panel.state.steerWheelDeg) > m.maxSteerWheelDeg) {
    // оставляем введённое значение, но показываем упор; рейка ограничена в compute()
  }
  view.update(m);
  renderHud(m);
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

panel.onChange(() => {
  update();
  updateTire();
});
updateTire();
update();
