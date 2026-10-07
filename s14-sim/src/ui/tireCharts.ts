/** Графики модели шины: Fy(α), пневматический трейл t(α), момент Mz(α). */

import { tireParams } from '../config/tire';
import { tire } from '../physics/tire';
import { LineChart, type Series } from './chart';
import type { State, VehicleConfig } from '../config/vehicle';

const DEG = Math.PI / 180;
// Категориальные цвета для тёмной темы (порядок фиксирован: blue, orange, aqua)
const COLORS = ['#3987e5', '#d95926', '#199e70'];

export class TireCharts {
  private axle: 'front' | 'rear' = 'front';
  private fzOverride: number | null = null;
  private fy = new LineChart({ title: 'Боковая сила Fy', xLabel: 'Угол увода α, °', yLabel: 'Fy, Н' });
  private tr = new LineChart({ title: 'Пневматический трейл', xLabel: 'Угол увода α, °', yLabel: 'трейл, мм' });
  private mz = new LineChart({ title: 'Момент самовыравнивания Mz', xLabel: 'Угол увода α, °', yLabel: 'Mz, Н·м' });
  private fzInput!: HTMLInputElement;
  private info!: HTMLElement;

  constructor(root: HTMLElement, private cfg: VehicleConfig, private getState: () => State) {
    const bar = document.createElement('div');
    bar.className = 'chartbar';
    bar.innerHTML = `
      <strong>Шина</strong>
      <span class="seg"><button data-ax="front" class="on">Перед</button><button data-ax="rear">Зад</button></span>
      <label>Нагрузка на колесо <input type="number" class="num" step="100" min="500" max="9000"> Н</label>
      <button data-static>статика</button>
      <span class="info"></span>`;
    this.fzInput = bar.querySelector('input')!;
    this.info = bar.querySelector('.info')!;
    bar.querySelectorAll<HTMLButtonElement>('[data-ax]').forEach((b) => {
      b.onclick = () => {
        this.axle = b.dataset.ax as 'front' | 'rear';
        bar.querySelectorAll('[data-ax]').forEach((x) => x.classList.toggle('on', x === b));
        this.fzOverride = null;
        this.update();
      };
    });
    this.fzInput.onchange = () => {
      const v = Number(this.fzInput.value);
      this.fzOverride = Number.isFinite(v) && v > 0 ? v : null;
      this.update();
    };
    bar.querySelector<HTMLButtonElement>('[data-static]')!.onclick = () => {
      this.fzOverride = null;
      this.update();
    };
    const grid = document.createElement('div');
    grid.className = 'chartgrid';
    grid.append(this.fy.el, this.tr.el, this.mz.el);
    root.append(bar, grid);
  }

  private staticFz(): number {
    const c = this.cfg;
    const wf = this.getState().frontWeightPct;
    const share = this.axle === 'front' ? wf : 100 - wf;
    return (c.mass * 9.81 * share) / 100 / 2;
  }

  update(): void {
    const s = this.getState();
    const c = this.cfg;
    const front = this.axle === 'front';
    const t = front ? c.tires.front : c.tires.rear;
    const p0 = front ? s.frontPressureBar : s.rearPressureBar;
    const camber = front ? s.frontCamberDeg : s.rearCamberDeg;
    const Fz = this.fzOverride ?? this.staticFz();
    this.fzInput.value = String(Math.round(Fz));
    const mk = (p: number, color: string, name: string, w: number): [Series, Series, Series] => {
      const fy: [number, number][] = [];
      const tr: [number, number][] = [];
      const mz: [number, number][] = [];
      for (let a = 0; a <= 40.001; a += 0.5) {
        // левое колесо: наклон в сторону +Y = развал
        const o = tire(tireParams, { alpha: a * DEG, Fz, gammaInc: camber * DEG, pressureBar: p, widthMm: t.width });
        fy.push([a, o.Fy]);
        tr.push([a, o.trail * 1000]);
        mz.push([a, o.Mz]);
      }
      return [
        { name, color, width: w, pts: fy },
        { name, color, width: w, pts: tr },
        { name, color, width: w, pts: mz },
      ];
    };
    const sets = [
      mk(p0 - 0.5, COLORS[1], `${(p0 - 0.5).toFixed(2)} бар`, 2),
      mk(p0, COLORS[0], `${p0.toFixed(2)} бар (текущее)`, 2.5),
      mk(p0 + 0.5, COLORS[2], `${(p0 + 0.5).toFixed(2)} бар`, 2),
    ];
    this.fy.update(sets.map((x) => x[0]));
    this.tr.update(sets.map((x) => x[1]));
    this.mz.update(sets.map((x) => x[2]));
    const o = tire(tireParams, { alpha: 0, Fz, gammaInc: camber * DEG, pressureBar: p0, widthMm: t.width });
    this.info.textContent = `${t.width}/${t.aspect}R${t.rimInch} · пятно ${(o.patchLength * 1000).toFixed(0)} мм · t₀ ${(o.trail0 * 1000).toFixed(1)} мм · Cα ${((o.Calpha * Math.PI) / 180).toFixed(0)} Н/° · μ ${o.mu.toFixed(2)}`;
  }
}
