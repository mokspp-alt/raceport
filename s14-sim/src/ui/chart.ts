/** Лёгкий canvas-график: несколько линий, оси, нулевая линия, кроссхейр с подсказкой. */

export interface Series {
  name: string;
  color: string;
  width?: number;
  dash?: number[];
  pts: [number, number][];
}

export interface ChartOpts {
  title: string;
  xLabel: string;
  yLabel: string;
  /** Выделить вертикальной линией (например, текущий угол увода). */
  xMarker?: number;
}

const css = (n: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;

function niceStep(range: number, n: number): number {
  const raw = range / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

export class LineChart {
  readonly canvas = document.createElement('canvas');
  readonly legend = document.createElement('div');
  readonly el = document.createElement('figure');
  private series: Series[] = [];
  private hoverX: number | null = null;
  private bounds = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private pad = { l: 56, r: 10, t: 8, b: 30 };

  constructor(private opts: ChartOpts) {
    this.el.className = 'chart';
    const cap = document.createElement('figcaption');
    cap.textContent = opts.title;
    this.legend.className = 'legend';
    this.el.append(cap, this.legend, this.canvas);
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const { l, r: pr } = this.pad;
      const { x0, x1 } = this.bounds;
      const f = (e.clientX - r.left - l) / (r.width - l - pr);
      this.hoverX = f >= 0 && f <= 1 ? x0 + f * (x1 - x0) : null;
      this.draw();
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverX = null;
      this.draw();
    });
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  setMarker(x: number | undefined): void {
    this.opts.xMarker = x;
  }

  update(series: Series[]): void {
    this.series = series;
    this.legend.innerHTML = series
      .map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`)
      .join('');
    this.draw();
  }

  draw(): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const muted = css('--muted', '#8b97a8');
    const line = css('--line', '#262d39');
    const text = css('--text', '#dbe3ee');
    const { l, r, t, b } = this.pad;
    const all = this.series.flatMap((s) => s.pts);
    if (!all.length) return;
    let x0 = Math.min(...all.map((p) => p[0]));
    let x1 = Math.max(...all.map((p) => p[0]));
    let y0 = Math.min(0, ...all.map((p) => p[1]));
    let y1 = Math.max(0, ...all.map((p) => p[1]));
    if (y1 === y0) y1 = y0 + 1;
    const ys = niceStep(y1 - y0, 4);
    y0 = Math.floor(y0 / ys) * ys;
    y1 = Math.ceil(y1 / ys) * ys;
    this.bounds = { x0, x1, y0, y1 };
    const X = (v: number) => l + ((v - x0) / (x1 - x0)) * (W - l - r);
    const Y = (v: number) => H - b - ((v - y0) / (y1 - y0)) * (H - t - b);

    g.font = '11px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.lineWidth = 1;
    // сетка и подписи Y
    g.textAlign = 'right';
    for (let v = y0; v <= y1 + 1e-9; v += ys) {
      g.strokeStyle = Math.abs(v) < 1e-9 ? muted : line;
      g.beginPath();
      g.moveTo(l, Y(v) + 0.5);
      g.lineTo(W - r, Y(v) + 0.5);
      g.stroke();
      g.fillStyle = muted;
      g.fillText(String(+v.toPrecision(4)), l - 5, Y(v));
    }
    // ось X
    const xs = niceStep(x1 - x0, 6);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) {
      g.fillStyle = muted;
      g.fillText(String(+v.toPrecision(4)), X(v), H - b + 5);
      g.strokeStyle = line;
      g.beginPath();
      g.moveTo(X(v) + 0.5, H - b);
      g.lineTo(X(v) + 0.5, H - b + 3);
      g.stroke();
    }
    g.fillStyle = muted;
    g.fillText(this.opts.xLabel, l + (W - l - r) / 2, H - 13);
    g.save();
    g.translate(10, t + (H - t - b) / 2);
    g.rotate(-Math.PI / 2);
    g.textBaseline = 'middle';
    g.fillText(this.opts.yLabel, 0, 0);
    g.restore();

    // маркер
    if (this.opts.xMarker !== undefined && this.opts.xMarker >= x0 && this.opts.xMarker <= x1) {
      g.setLineDash([4, 3]);
      g.strokeStyle = muted;
      g.beginPath();
      g.moveTo(X(this.opts.xMarker) + 0.5, t);
      g.lineTo(X(this.opts.xMarker) + 0.5, H - b);
      g.stroke();
      g.setLineDash([]);
    }

    // линии
    g.save();
    g.beginPath();
    g.rect(l, t, W - l - r, H - t - b);
    g.clip();
    for (const s of this.series) {
      g.strokeStyle = s.color;
      g.lineWidth = s.width ?? 2;
      g.lineJoin = 'round';
      g.setLineDash(s.dash ?? []);
      g.beginPath();
      s.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      g.stroke();
    }
    g.restore();
    g.setLineDash([]);

    // кроссхейр
    if (this.hoverX !== null) {
      const hx = this.hoverX;
      g.strokeStyle = muted;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(X(hx) + 0.5, t);
      g.lineTo(X(hx) + 0.5, H - b);
      g.stroke();
      const rows = this.series.map((s) => {
        let best = s.pts[0];
        for (const p of s.pts) if (Math.abs(p[0] - hx) < Math.abs(best[0] - hx)) best = p;
        g.fillStyle = s.color;
        g.strokeStyle = css('--panel', '#151a22');
        g.lineWidth = 2;
        g.beginPath();
        g.arc(X(best[0]), Y(best[1]), 4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        return { s, v: best[1], x: best[0] };
      });
      const lines = [`${this.opts.xLabel.split(',')[0]}: ${rows[0]?.x.toFixed(1)}`, ...rows.map((r2) => `${r2.s.name}: ${+r2.v.toPrecision(4)}`)];
      const bw = Math.max(...lines.map((s) => g.measureText(s).width)) + 14;
      const bh = lines.length * 15 + 8;
      let bx = X(hx) + 10;
      if (bx + bw > W - 4) bx = X(hx) - 10 - bw;
      g.fillStyle = 'rgba(14,18,25,0.94)';
      g.strokeStyle = line;
      g.lineWidth = 1;
      g.fillRect(bx, t + 4, bw, bh);
      g.strokeRect(bx + 0.5, t + 4.5, bw, bh);
      g.fillStyle = text;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      lines.forEach((s, i) => g.fillText(s, bx + 7, t + 4 + 12 + i * 15));
    }
  }
}
