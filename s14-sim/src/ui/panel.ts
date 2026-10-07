import { defaultSetup, type State } from '../config/vehicle';
import { groups, type ParamDef } from './params';

type Listener = () => void;

export class Panel {
  readonly state: State = { ...defaultSetup };
  private listeners: Listener[] = [];
  private inputs = new Map<keyof State, { range: HTMLInputElement; num: HTMLInputElement }>();

  constructor(root: HTMLElement) {
    for (const g of groups) {
      const sec = document.createElement('section');
      sec.innerHTML = `<h2>${g.title}</h2>`;
      for (const p of g.params) sec.appendChild(this.row(p));
      root.appendChild(sec);
    }
    const bar = document.createElement('div');
    bar.className = 'bar';
    const reset = document.createElement('button');
    reset.textContent = 'Сброс к исходным';
    reset.onclick = () => {
      Object.assign(this.state, defaultSetup);
      this.syncAll();
      this.emit();
    };
    bar.appendChild(reset);
    root.appendChild(bar);
  }

  onChange(l: Listener): void {
    this.listeners.push(l);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Установить значение программно, без оповещения подписчиков. */
  setValue(key: keyof State, v: number): void {
    this.state[key] = v;
    const i = this.inputs.get(key);
    if (!i) return;
    i.range.value = String(v);
    i.num.value = String(Math.round(v * 100) / 100);
  }

  /** Обновить границы слайдера (например, ход руля зависит от геометрии). */
  setRange(key: keyof State, min: number, max: number): void {
    const i = this.inputs.get(key);
    if (!i) return;
    i.range.min = String(min);
    i.range.max = String(max);
    i.num.min = String(min);
    i.num.max = String(max);
  }

  private syncAll(): void {
    for (const [k, i] of this.inputs) {
      i.range.value = String(this.state[k]);
      i.num.value = String(this.state[k]);
    }
  }

  private row(p: ParamDef): HTMLElement {
    const el = document.createElement('div');
    el.className = 'param' + (p.later ? ' later' : '');
    const id = `p-${p.key}`;
    el.innerHTML = `
      <div class="head">
        <label for="${id}">${p.label}${p.later ? ' <span class="tag">этап 3</span>' : ''}</label>
        <span class="val"><input type="number" class="num" min="${p.min}" max="${p.max}" step="${p.step}"><span class="unit">${p.unit}</span></span>
      </div>
      <input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">
      <p class="hint">${p.hint}</p>`;
    const range = el.querySelector<HTMLInputElement>('input[type=range]')!;
    const num = el.querySelector<HTMLInputElement>('input[type=number]')!;
    range.value = String(this.state[p.key]);
    num.value = String(this.state[p.key]);
    const set = (v: number) => {
      if (!Number.isFinite(v)) return;
      this.state[p.key] = v;
      range.value = String(v);
      this.emit();
    };
    range.oninput = () => {
      num.value = Number(range.value).toFixed(p.decimals);
      set(Number(range.value));
    };
    num.onchange = () => set(Number(num.value));
    num.value = Number(this.state[p.key]).toFixed(p.decimals);
    this.inputs.set(p.key, { range, num });
    return el;
  }
}
