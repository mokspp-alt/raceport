/** Четыре главных графика: момент на руле и углы по углу руля / углу заноса, текущий пресет и сравнение. */

import { tireParams } from '../config/tire';
import { type State, type VehicleConfig } from '../config/vehicle';
import { analyzeCached, type Analysis } from '../physics/analysis';
import { LineChart, type ChartPoint, type Series } from './chart';

// Фиксированный порядок цветов (тёмная тема): blue, orange, aqua, yellow
const BLUE = '#3987e5';
const ORANGE = '#d95926';
const AQUA = '#199e70';
const YELLOW = '#c98500';

export interface AnalysisResult {
  current: Analysis;
  compare: Analysis | null;
  compareLabel: string;
}

export class AnalysisCharts {
  private c1 = new LineChart({ title: 'Момент на руле от угла руля (занос фиксирован)', xLabel: 'Угол руля, °', yLabel: 'T, Н·м' });
  private c2 = new LineChart({ title: 'Момент на руле от угла заноса (равновесие, газ постоянен)', xLabel: 'Угол заноса, °', yLabel: 'T, Н·м' });
  private c3 = new LineChart({ title: 'Углы увода передних колёс от угла руля', xLabel: 'Угол руля, °', yLabel: 'α, °' });
  private c4 = new LineChart({ title: 'Развал передних колёс от угла руля', xLabel: 'Угол руля, °', yLabel: 'развал, °' });
  private timer: number | undefined;
  private status = document.createElement('div');

  constructor(
    root: HTMLElement,
    private cfg: VehicleConfig,
    private getState: () => State,
    private getCompare: () => { label: string; state: State } | null,
    private onResult: (r: AnalysisResult) => void,
  ) {
    this.status.className = 'chartstatus';
    const grid = document.createElement('div');
    grid.className = 'chartgrid four';
    grid.append(this.c1.el, this.c2.el, this.c3.el, this.c4.el);
    root.append(this.status, grid);
  }

  /** Пересчёт с задержкой, чтобы слайдеры не тормозили. */
  schedule(): void {
    this.status.textContent = 'считаю…';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.update(), 140);
  }

  update(): void {
    const s = this.getState();
    const cur = analyzeCached(this.cfg, tireParams, s);
    const cmp = this.getCompare();
    const other = cmp ? analyzeCached(this.cfg, tireParams, cmp.state) : null;
    const lab = cmp ? `сравн. ${cmp.label}` : '';
    const zip = (x: number[], y: number[]): [number, number][] => x.map((v, i) => [v, y[i]]);
    const slipPts = (a: Analysis): [number, number][] => a.slip.slip.map((b, i) => [b, a.slip.torque[i] ?? NaN]);

    // 1. T(δ)
    const s1: Series[] = [{ name: 'текущий', color: BLUE, width: 2.5, pts: zip(cur.steer.steerDeg, cur.steer.torque) }];
    if (other) s1.push({ name: lab, color: ORANGE, dash: [6, 4], pts: zip(other.steer.steerDeg, other.steer.torque) });
    const p1: ChartPoint[] = [];
    if (cur.zero.steerDeg !== null) p1.push({ x: cur.zero.steerDeg, y: 0, color: BLUE, label: 'руль «висит»' });
    this.c1.setMarker(cur.eqSteerDeg ?? undefined);
    this.c1.update(s1, p1);

    // 2. T_eq(β)
    const s2: Series[] = [{ name: 'текущий', color: BLUE, width: 2.5, pts: slipPts(cur) }];
    if (other) s2.push({ name: lab, color: ORANGE, dash: [6, 4], pts: slipPts(other) });
    const p2: ChartPoint[] = [];
    if (cur.balance.star !== null) p2.push({ x: cur.balance.star, y: 0, color: BLUE, label: 'β*' });
    if (other?.balance.star != null) p2.push({ x: other.balance.star, y: 0, color: ORANGE, label: 'β* ' + cmp!.label });
    this.c2.setMarker(s.slipAngleDeg);
    this.c2.update(s2, p2);

    // 3. углы увода
    const s3: Series[] = [
      { name: 'внутр. (ПЛ)', color: BLUE, width: 2.5, pts: zip(cur.steer.steerDeg, cur.steer.alphaIn) },
      { name: 'внеш. (ПП)', color: AQUA, width: 2.5, pts: zip(cur.steer.steerDeg, cur.steer.alphaOut) },
    ];
    if (other) {
      s3.push({ name: `внутр. ${lab}`, color: ORANGE, dash: [6, 4], pts: zip(other.steer.steerDeg, other.steer.alphaIn) });
      s3.push({ name: `внеш. ${lab}`, color: YELLOW, dash: [6, 4], pts: zip(other.steer.steerDeg, other.steer.alphaOut) });
    }
    this.c3.setMarker(cur.eqSteerDeg ?? undefined);
    this.c3.update(s3);

    // 4. развал
    const s4: Series[] = [
      { name: 'внутр. (ПЛ)', color: BLUE, width: 2.5, pts: zip(cur.steer.steerDeg, cur.steer.camberIn) },
      { name: 'внеш. (ПП)', color: AQUA, width: 2.5, pts: zip(cur.steer.steerDeg, cur.steer.camberOut) },
    ];
    if (other) {
      s4.push({ name: `внутр. ${lab}`, color: ORANGE, dash: [6, 4], pts: zip(other.steer.steerDeg, other.steer.camberIn) });
      s4.push({ name: `внеш. ${lab}`, color: YELLOW, dash: [6, 4], pts: zip(other.steer.steerDeg, other.steer.camberOut) });
    }
    this.c4.setMarker(cur.eqSteerDeg ?? undefined);
    this.c4.update(s4);

    this.status.textContent = cur.eqSteerDeg === null ? 'Для текущего сценария нет равновесного заноса — вертикальная метка не показана.' : 'Вертикальная пунктирная линия: равновесный угол руля (график 1, 3, 4) / рабочий угол заноса (график 2).';
    this.onResult({ current: cur, compare: other, compareLabel: cmp?.label ?? '' });
  }
}
