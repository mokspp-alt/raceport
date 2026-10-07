import { defaultSetup, type State } from '../config/vehicle';
import { groups, type ParamDef } from './params';
import { SETUP_KEYS } from '../physics/analysis';

type Listener = () => void;
type Slot = 'A' | 'B';
const STORE = 's14-sim-presets-v1';

export class Panel {
  readonly state: State = { ...defaultSetup };
  private listeners: Listener[] = [];
  private inputs = new Map<keyof State, { range: HTMLInputElement; num: HTMLInputElement }>();
  /** Сохранённые пресеты (только настройки подвески и шин, без сценария заноса и положения руля). */
  readonly presets: Record<Slot, Partial<State> | null> = { A: null, B: null };
  compare: 'none' | Slot = 'none';
  private presetNote!: HTMLElement;

  constructor(root: HTMLElement) {
    for (const g of groups) {
      const sec = document.createElement('section');
      sec.innerHTML = `<h2>${g.title}</h2>`;
      for (const p of g.params) sec.appendChild(this.row(p));
      root.appendChild(sec);
    }
    this.loadStore();
    root.appendChild(this.presetSection());
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

  private loadStore(): void {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const o = JSON.parse(raw);
        this.presets.A = o.A ?? null;
        this.presets.B = o.B ?? null;
      }
    } catch {
      /* хранилище недоступно — работаем без него */
    }
  }

  private saveStore(): void {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.presets));
    } catch {
      /* ignore */
    }
  }

  private snapshot(): Partial<State> {
    const o: Partial<State> = {};
    for (const k of SETUP_KEYS) o[k] = this.state[k];
    return o;
  }

  /** Состояние для сравнения: настройки из пресета + ТЕКУЩИЙ сценарий заноса. */
  compareState(): State | null {
    if (this.compare === 'none') return null;
    const p = this.presets[this.compare];
    return p ? ({ ...this.state, ...p } as State) : null;
  }

  private presetSection(): HTMLElement {
    const sec = document.createElement('section');
    sec.innerHTML = `
      <h2>Пресеты A / B</h2>
      <div class="presets">
        <div><b>A</b> <button data-save="A">Сохранить</button> <button data-apply="A">Применить</button></div>
        <div><b>B</b> <button data-save="B">Сохранить</button> <button data-apply="B">Применить</button></div>
      </div>
      <div class="cmp">Сравнивать графики с:
        <label><input type="radio" name="cmp" value="none" checked> нет</label>
        <label><input type="radio" name="cmp" value="A"> A</label>
        <label><input type="radio" name="cmp" value="B"> B</label>
      </div>
      <p class="hint presetnote"></p>`;
    this.presetNote = sec.querySelector('.presetnote')!;
    sec.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => {
      b.onclick = () => {
        this.presets[b.dataset.save as Slot] = this.snapshot();
        this.saveStore();
        this.refreshNote();
        this.emit();
      };
    });
    sec.querySelectorAll<HTMLButtonElement>('[data-apply]').forEach((b) => {
      b.onclick = () => {
        const p = this.presets[b.dataset.apply as Slot];
        if (!p) return;
        for (const k of SETUP_KEYS) if (p[k] !== undefined) this.setValue(k, p[k] as number);
        this.emit();
      };
    });
    sec.querySelectorAll<HTMLInputElement>('input[name=cmp]').forEach((r) => {
      r.onchange = () => {
        this.compare = r.value as 'none' | Slot;
        this.refreshNote();
        this.emit();
      };
    });
    this.refreshNote();
    return sec;
  }

  private refreshNote(): void {
    const d = (k: Slot) => (this.presets[k] ? 'сохранён' : 'пуст');
    const cmp = this.compare !== 'none' && !this.presets[this.compare] ? ' Выбранный для сравнения пресет пуст — сначала сохраните его.' : '';
    this.presetNote.textContent = `A: ${d('A')}, B: ${d('B')}. Пресет хранит только настройки подвески и шин; сравнение идёт при текущем сценарии заноса (угол, скорость, газ).${cmp}`;
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
