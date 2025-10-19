import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ElementType = 'button' | 'input' | 'card' | 'slider' | 'image' | 'label';

export interface UIState {
  rotation?: number;
  currentText?: string;
  currentColor?: string;
  blurred?: boolean;
  disabled?: boolean;
  orderIndex?: number;
  clicked?: boolean;
  sliderValue?: number;
}

export interface GameElement {
  id: string;
  type: ElementType;
  brokenProps: {
    clickBroken?: boolean;
    rotateBroken?: number;
    textBroken?: { expected: string } | null;
    colorWrong?: string | null;
    orderIndex?: number;
    blur?: boolean;
    disabled?: boolean;
    sliderBroken?: number;
  };
  difficulty: number;
  fixed: boolean;
  hint: string;
  ui?: UIState;
}

export interface GameState {
  score: number;
  level: number;
  timeLeft: number;
  running: boolean;
  elements: GameElement[];
  message?: string;
  hintsUsed: number;
}

@Injectable({ providedIn: 'root' })
export class GameService {
  private initialTimeBase = 60;
  private state$ = new BehaviorSubject<GameState>({
    score: 0,
    level: 1,
    timeLeft: this.initialTimeBase,
    running: false,
    elements: [],
    hintsUsed: 0
  });
  private timer?: any;

  state = this.state$.asObservable();

  getBest(): number {
    try {
      const v = localStorage.getItem('fti_best');
      return v ? Number(v) : 0;
    } catch {
      return 0;
    }
  }

  setBest(v: number) {
    try {
      localStorage.setItem('fti_best', String(v));
    } catch {
      // storage unavailable
    }
  }

  startLevel(level = 1) {
    clearInterval(this.timer);
    const elements = this.generateLevel(level);
    const time = this.initialTimeBase - (level - 1) * 10;
    const st: GameState = {
      score: this.state$.value.score,
      level,
      timeLeft: Math.max(20, time),
      running: true,
      elements,
      hintsUsed: 0
    };
    this.state$.next(st);
    this.runTimer();
  }

  private runTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const s = this.state$.value;
      if (!s.running) return;
      if (s.timeLeft <= 1) {
        this.finishLevel(false, 'Time is up.');
        return;
      }
      this.state$.next({ ...s, timeLeft: s.timeLeft - 1 });
    }, 1000);
  }

  stop() {
    clearInterval(this.timer);
    const s = this.state$.value;
    this.state$.next({ ...s, running: false, message: 'Stopped.' });
  }

  useHint(elementId?: string) {
    const s = this.state$.value;
    if (!s.running) return;
    const penalty = 8;
    const next = { ...s, timeLeft: Math.max(0, s.timeLeft - penalty), hintsUsed: s.hintsUsed + 1 };
    if (elementId) {
      const el = next.elements.find(e => e.id === elementId);
      if (el) next.message = `Hint: ${el.hint}`;
    } else {
      next.message = 'Hint used. Time penalty applied.';
    }
    this.state$.next(next);
  }

  fixAttempt(id: string, payload?: Partial<UIState>) {
    const s = this.state$.value;
    if (!s.running) return;

    const els = s.elements.map(el => {
      if (el.id !== id) return el;

      const newUi: UIState = { ...el.ui, ...(payload || {}) };
      const bp = { ...el.brokenProps };
      let fixed = true;

      // clickBroken: need real click (just set clicked: true)
      if (bp.clickBroken) {
        if (newUi.clicked === true) {
          delete bp.clickBroken;
        } else {
          fixed = false;
        }
      }

      // rotateBroken: require rotation within tolerance
      if (bp.rotateBroken && bp.rotateBroken % 360 !== 0) {
        const need = ((bp.rotateBroken % 360) + 360) % 360;
        const cur = (newUi.rotation || 0) % 360;
        const diff = Math.abs(cur - need);
        if (diff <= 15 || Math.abs(diff - 360) <= 15) {
          delete bp.rotateBroken;
        } else {
          fixed = false;
        }
      }

      // textBroken: must match exactly
      if (bp.textBroken) {
        if ((newUi.currentText || '').trim().toLowerCase() === bp.textBroken.expected.trim().toLowerCase()) {
          bp.textBroken = null;
        } else {
          fixed = false;
        }
      }

      // colorWrong: must match exact color
      if (bp.colorWrong) {
        const expColor = (bp.colorWrong || '').toLowerCase();
        const curColor = (newUi.currentColor || '').toLowerCase();
        if (this.colorsMatch(curColor, expColor)) {
          delete bp.colorWrong;
        } else {
          fixed = false;
        }
      }

      // blur: click to unblur
      if (bp.blur) {
        if (newUi.blurred === false) delete bp.blur;
        else fixed = false;
      }

      // disabled: click to enable
      if (bp.disabled) {
        if (newUi.disabled === false) delete bp.disabled;
        else fixed = false;
      }

      // sliderBroken: must reach exact value
      if (typeof bp.sliderBroken === 'number') {
        const cur = newUi.sliderValue || 0;
        if (cur === bp.sliderBroken) {
          delete bp.sliderBroken;
        } else {
          fixed = false;
        }
      }

      // orderIndex checked later
      const nowFixed = fixed && Object.values(bp).every(v => !v || (typeof v === 'number' && v === 0));

      return { ...el, ui: newUi, brokenProps: bp, fixed: nowFixed };
    });

    const updated = this.checkOrderTasks(els);
    const prevFixedCount = s.elements.filter(e => e.fixed).length;
    const nowFixedCount = updated.filter(e => e.fixed).length;

    let gained = 0;
    if (nowFixedCount > prevFixedCount) {
      const diff = nowFixedCount - prevFixedCount;
      const perElementBase = 150 * s.level;
      gained = diff * perElementBase + Math.floor(s.timeLeft * 3);
    }

    const newScore = s.score + gained;
    const nextState = {
      ...s,
      elements: updated,
      score: newScore,
      message: gained ? `+${gained} pts` : s.message
    };

    this.state$.next(nextState);

    if (updated.every(e => e.fixed)) {
      this.finishLevel(true, 'Level cleared');
    }
  }

  private colorsMatch(c1: string, c2: string): boolean {
    const norm = (c: string) => c.replace(/\s/g, '').toLowerCase();
    return norm(c1) === norm(c2);
  }

  private checkOrderTasks(elements: GameElement[]): GameElement[] {
    const orderTargets = elements.filter(e => typeof e.brokenProps.orderIndex === 'number');
    if (orderTargets.length === 0) return elements;

    const requiredMap = new Map<number, string>();
    orderTargets.forEach(e => requiredMap.set(e.brokenProps.orderIndex as number, e.id));

    const sorted = [...elements].sort((a, b) => (a.ui?.orderIndex ?? 0) - (b.ui?.orderIndex ?? 0));

    let allGood = true;
    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      if (requiredMap.has(i)) {
        if (requiredMap.get(i) !== el.id) {
          allGood = false;
          break;
        }
      }
    }

    if (allGood) {
      return elements.map(e => ({ ...e, fixed: true }));
    }
    return elements;
  }

  private finishLevel(success: boolean, message: string) {
    clearInterval(this.timer);
    const s = this.state$.value;
    const extra = success ? s.timeLeft * 10 : 0;
    const finalScore = s.score + extra;

    if (finalScore > this.getBest()) this.setBest(finalScore);

    const nextLevel = success ? Math.min(3, s.level + 1) : s.level;
    this.state$.next({
      ...s,
      running: false,
      message: message + (success ? ` • +${extra} bonus` : ''),
                     score: finalScore,
                     level: nextLevel
    });
  }

  private generateLevel(level: number): GameElement[] {
    const count = 3 + level * 2;
    const elements: GameElement[] = [];
    const types: ElementType[] = ['button', 'input', 'card', 'slider', 'label'];

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const difficulty = 1 + Math.floor(Math.random() * level);

      const brokenProps: GameElement['brokenProps'] = {};
      const ui: UIState = {
        rotation: 0,
        currentText: '',
        currentColor: '#808080',
        blurred: false,
        disabled: false,
        orderIndex: i,
        clicked: false,
        sliderValue: 0
      };

      const opts: string[] = ['clickBroken', 'rotateBroken', 'textBroken', 'colorWrong', 'blur', 'disabled', 'sliderBroken', 'orderIndex'];
      const pickCount = 1 + Math.floor(Math.random() * Math.min(2, level));
      const picks = this.pickRandom(opts, pickCount);

      for (const p of picks) {
        switch (p) {
          case 'clickBroken':
            brokenProps.clickBroken = true;
            break;
          case 'rotateBroken':
            const need = [90, 180, 270][Math.floor(Math.random() * 3)];
            brokenProps.rotateBroken = need;
            ui.rotation = (need + 180) % 360;
            break;
          case 'textBroken':
            const words = ['fix', 'hello', 'angular', 'dev', 'web'];
            const expected = words[Math.floor(Math.random() * words.length)];
            brokenProps.textBroken = { expected };
            ui.currentText = '';
            break;
          case 'colorWrong':
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
            const expectedColor = colors[Math.floor(Math.random() * colors.length)];
            brokenProps.colorWrong = expectedColor;
            ui.currentColor = '#808080';
            break;
          case 'blur':
            brokenProps.blur = true;
            ui.blurred = true;
            break;
          case 'disabled':
            brokenProps.disabled = true;
            ui.disabled = true;
            break;
          case 'sliderBroken':
            const target = 30 + Math.floor(Math.random() * 40);
            brokenProps.sliderBroken = target;
            ui.sliderValue = 0;
            break;
          case 'orderIndex':
            const idx = Math.floor(Math.random() * count);
            brokenProps.orderIndex = idx;
            break;
        }
      }

      const hint = this.buildHint(type, brokenProps);
      elements.push({
        id: `el-${i}`,
        type,
        brokenProps,
        difficulty,
        fixed: false,
        hint,
        ui
      });
    }

    // shuffle
    for (let i = elements.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [elements[i], elements[j]] = [elements[j], elements[i]];
    }

    elements.forEach((el, idx) => {
      el.ui = { ...el.ui, orderIndex: idx };
    });

    return elements;
  }

  private buildHint(type: ElementType, bp: GameElement['brokenProps']): string {
    if (bp.rotateBroken) return 'Double-click to rotate this element.';
    if (bp.clickBroken) return 'Click the tile to activate.';
    if (bp.textBroken) return `Type "${bp.textBroken!.expected}" in the input.`;
    if (bp.colorWrong) return 'Pick the correct color from palette.';
    if (bp.blur) return 'Click to remove blur effect.';
    if (bp.disabled) return 'Click to enable this control.';
    if (bp.sliderBroken) return 'Drag slider to the correct position.';
    if (typeof bp.orderIndex === 'number') return 'Drag tiles to reorder them correctly.';
    return 'Interact with this element to fix it.';
  }

  private pickRandom<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    while (out.length < n && copy.length) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  }
}
