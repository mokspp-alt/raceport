/** Вкладка «Чувствительность»: рейтинг параметров по влиянию на точку баланса руля. */

import { tireParams } from '../config/tire';
import type { State, VehicleConfig } from '../config/vehicle';
import { sensitivity, type SensitivityRow } from '../physics/analysis';

const f = (v: number | null, d = 2, sign = true) => (v === null || !Number.isFinite(v) ? '—' : (sign && v > 0 ? '+' : '') + v.toFixed(d));

export class SensitivityView {
  private out = document.createElement('div');
  private btn = document.createElement('button');
  private busy = false;

  constructor(root: HTMLElement, private cfg: VehicleConfig, private getState: () => State) {
    const head = document.createElement('div');
    head.className = 'chartbar';
    this.btn.textContent = 'Анализ чувствительности';
    this.btn.onclick = () => void this.run();
    const note = document.createElement('span');
    note.className = 'info';
    note.textContent = 'Каждый параметр сдвигается на ± шаг от текущих настроек при текущем сценарии заноса; показан эффект от +шага.';
    head.append(this.btn, note);
    this.out.className = 'sens';
    root.append(head, this.out);
  }

  async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.btn.disabled = true;
    const s = { ...this.getState() };
    this.out.textContent = 'Считаю…';
    try {
      const r = await sensitivity(this.cfg, tireParams, s, (d, n) => (this.out.textContent = `Считаю… ${d}/${n}`));
      this.render(r, s);
    } finally {
      this.busy = false;
      this.btn.disabled = false;
    }
  }

  private render(r: { baseStar: number | null; baseTorque: number | null; baseMismatch: number | null; rows: SensitivityRow[] }, s: State): void {
    const hasStar = r.baseStar !== null;
    const score = (x: SensitivityRow) => (hasStar ? Math.abs(x.dStar ?? 0) : Math.abs(x.dTorque ?? 0));
    const max = Math.max(1e-9, ...r.rows.map(score));
    const rows = r.rows
      .map((x, i) => {
        let verdict = '—';
        if (x.dTorque !== null && r.baseTorque !== null) {
          const better = Math.abs(r.baseTorque + x.dTorque) < Math.abs(r.baseTorque);
          verdict = better ? '+шаг: |T| меньше (ближе к «висит»)' : '+шаг: |T| больше';
        }
        return `<tr>
          <td>${i + 1}</td><td class="l">${x.label}</td><td>${x.step} ${x.unit}</td>
          <td>${f(x.dStar, 2)}</td><td>${f(x.dTorque, 2)}</td><td>${f(x.dMismatch, 1)}</td>
          <td class="bar"><i style="width:${(score(x) / max) * 100}%"></i></td><td class="l">${verdict}</td></tr>`;
      })
      .join('');
    const base = hasStar
      ? `Точка баланса сейчас: β* = <b>${r.baseStar!.toFixed(1)}°</b> (рабочий угол ${s.slipAngleDeg}°).`
      : `Точки баланса в диапазоне углов заноса нет (момент не пересекает ноль) — рейтинг по влиянию на момент T при рабочем угле ${s.slipAngleDeg}° (сейчас ${f(r.baseTorque, 1)} Н·м).`;
    this.out.innerHTML = `<p>${base} Δ(δ*−δ0) сейчас: <b>${f(r.baseMismatch, 0, false)}°</b> руля.</p>
      <table><thead><tr><th>#</th><th class="l">Параметр</th><th>Шаг</th><th>Δβ*, °</th><th>ΔT, Н·м</th><th>Δ(δ*−δ0), °</th><th>Влияние</th><th class="l">Направление</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="hint">Δβ* — сдвиг точки баланса (если она есть); ΔT — изменение момента от дороги на руле при рабочем угле заноса; Δ(δ*−δ0) — изменение разницы между нужным контррулём и углом руля, при котором он «висит». Эффект от +шага: для −шага знаки обратные (линейное приближение).</p>`;
  }
}
