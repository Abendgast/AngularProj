import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ElementType = 'button' | 'input' | 'card' | 'slider' | 'image' | 'label' | 'checkbox' | 'toggle' | 'dropdown';

export interface UIState {
  rotation?: number;
  currentText?: string;
  currentColor?: string;
  blurred?: boolean;
  disabled?: boolean;
  orderIndex?: number;
  clicked?: boolean;
  sliderValue?: number;
  checked?: boolean;
  toggleState?: boolean;
  selectedOption?: string;
  opacity?: number;
  scale?: number;
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
    checkboxBroken?: boolean;
    toggleBroken?: boolean;
    dropdownBroken?: string;
    opacityBroken?: number;
    scaleBroken?: number;
  };
  difficulty: number;
  fixed: boolean;
  hint: string;
  ui?: UIState;
  fixedAt?: number;
}

export interface PowerUp {
  id: string;
  name: string;
  icon: string;
  cost: number;
  active: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress?: number;
  target?: number;
}

export interface GameState {
  score: number;
  level: number;
  timeLeft: number;
  running: boolean;
  elements: GameElement[];
  message?: string;
  hintsUsed: number;
  combo: number;
  maxCombo: number;
  totalFixed: number;
  powerUps: PowerUp[];
  achievements: Achievement[];
  particles: Particle[];
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  text?: string;
}

@Injectable({ providedIn: 'root' })
export class GameService {
  private initialTimeBase = 90;
  private state$ = new BehaviorSubject<GameState>({
    score: 0,
    level: 1,
    timeLeft: this.initialTimeBase,
    running: false,
    elements: [],
    hintsUsed: 0,
    combo: 0,
    maxCombo: 0,
    totalFixed: 0,
    powerUps: this.initPowerUps(),
                                                  achievements: this.initAchievements(),
                                                  particles: []
  });
  private timer?: any;
  private lastFixTime = 0;
  private comboTimeout?: any;

  state = this.state$.asObservable();

  private initPowerUps(): PowerUp[] {
    return [
      { id: 'freeze', name: 'Freeze Time', icon: '❄️', cost: 300, active: false },
      { id: 'autofix', name: 'Auto-Fix', icon: '🔧', cost: 500, active: false },
      { id: 'double', name: '2x Points', icon: '⚡', cost: 200, active: false }
    ];
  }

  private initAchievements(): Achievement[] {
    return [
      { id: 'first_fix', name: 'First Fix', description: 'Fix your first element', icon: '🎯', unlocked: false },
      { id: 'combo_5', name: 'Combo Master', description: 'Reach 5x combo', icon: '🔥', unlocked: false },
      { id: 'speed_demon', name: 'Speed Demon', description: 'Complete level in under 30s', icon: '⚡', unlocked: false },
      { id: 'perfectionist', name: 'Perfectionist', description: 'Complete level without hints', icon: '💎', unlocked: false },
      { id: 'level_5', name: 'Expert', description: 'Reach level 5', icon: '👑', unlocked: false },
      { id: 'score_1000', name: 'High Roller', description: 'Score 1000 points', icon: '💰', unlocked: false, progress: 0, target: 1000 }
    ];
  }

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
    } catch {}
  }

  getStats() {
    try {
      const stats = localStorage.getItem('fti_stats');
      return stats ? JSON.parse(stats) : { totalFixed: 0, gamesPlayed: 0, maxCombo: 0 };
    } catch {
      return { totalFixed: 0, gamesPlayed: 0, maxCombo: 0 };
    }
  }

  saveStats(stats: any) {
    try {
      localStorage.setItem('fti_stats', JSON.stringify(stats));
    } catch {}
  }

  startLevel(level = 1) {
    clearInterval(this.timer);
    const elements = this.generateLevel(level);
    const time = this.initialTimeBase - (level - 1) * 8;
    const s = this.state$.value;

    const st: GameState = {
      ...s,
      level,
      timeLeft: Math.max(30, time),
      running: true,
      elements,
      hintsUsed: 0,
      combo: 0,
      message: undefined,
      powerUps: s.powerUps.map(p => ({ ...p, active: false }))
    };
    this.state$.next(st);
    this.runTimer();

    const stats = this.getStats();
    stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
    this.saveStats(stats);
  }

  private runTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const s = this.state$.value;
      if (!s.running) return;

      const freezeActive = s.powerUps.find(p => p.id === 'freeze')?.active;

      if (!freezeActive) {
        if (s.timeLeft <= 1) {
          this.finishLevel(false, '⏱️ Time is up!');
          return;
        }
        this.state$.next({ ...s, timeLeft: s.timeLeft - 1 });
      }
    }, 1000);
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.comboTimeout);
    const s = this.state$.value;
    this.state$.next({ ...s, running: false, message: '⏸️ Game paused', combo: 0 });
  }

  useHint(elementId?: string) {
    const s = this.state$.value;
    if (!s.running) return;

    const penalty = 8;
    const next = { ...s, timeLeft: Math.max(0, s.timeLeft - penalty), hintsUsed: s.hintsUsed + 1, combo: 0 };

    if (elementId) {
      const el = next.elements.find(e => e.id === elementId);
      if (el) next.message = `💡 ${el.hint}`;
    } else {
      const unfixed = s.elements.find(e => !e.fixed);
      if (unfixed) {
        next.message = `💡 Hint: ${unfixed.hint}`;
      }
    }

    this.state$.next(next);
    this.checkAchievements(next);
  }

  usePowerUp(powerUpId: string) {
    const s = this.state$.value;
    if (!s.running) return;

    const powerUp = s.powerUps.find(p => p.id === powerUpId);
    if (!powerUp || s.score < powerUp.cost) return;

    const newScore = s.score - powerUp.cost;
    const newPowerUps = s.powerUps.map(p =>
    p.id === powerUpId ? { ...p, active: true } : p
    );

    let message = `${powerUp.icon} ${powerUp.name} activated!`;
    let elements = s.elements;

    if (powerUpId === 'autofix') {
      const unfixed = elements.find(e => !e.fixed);
      if (unfixed) {
        elements = this.autoFixElement(elements, unfixed.id);
        message = `${powerUp.icon} Auto-fixed ${unfixed.type}!`;
      }
      newPowerUps.find(p => p.id === powerUpId)!.active = false;
    } else if (powerUpId === 'freeze') {
      setTimeout(() => {
        const current = this.state$.value;
        const updated = current.powerUps.map(p =>
        p.id === 'freeze' ? { ...p, active: false } : p
        );
        this.state$.next({ ...current, powerUps: updated });
      }, 10000);
    } else if (powerUpId === 'double') {
      setTimeout(() => {
        const current = this.state$.value;
        const updated = current.powerUps.map(p =>
        p.id === 'double' ? { ...p, active: false } : p
        );
        this.state$.next({ ...current, powerUps: updated });
      }, 15000);
    }

    this.state$.next({ ...s, score: newScore, powerUps: newPowerUps, elements, message });
  }

  private autoFixElement(elements: GameElement[], id: string): GameElement[] {
    return elements.map(el => {
      if (el.id !== id) return el;

      const ui = { ...el.ui };
      const bp = { ...el.brokenProps };

      if (bp.rotateBroken) ui.rotation = bp.rotateBroken;
      if (bp.textBroken) ui.currentText = bp.textBroken.expected;
      if (bp.colorWrong) ui.currentColor = bp.colorWrong;
      if (bp.blur) ui.blurred = false;
      if (bp.disabled) ui.disabled = false;
      if (bp.sliderBroken) ui.sliderValue = bp.sliderBroken;
      if (bp.checkboxBroken) ui.checked = true;
      if (bp.toggleBroken) ui.toggleState = true;
      if (bp.dropdownBroken) ui.selectedOption = bp.dropdownBroken;
      if (bp.opacityBroken) ui.opacity = bp.opacityBroken;
      if (bp.scaleBroken) ui.scale = bp.scaleBroken;

      return { ...el, ui, fixed: true, brokenProps: {} };
    });
  }

  fixAttempt(id: string, payload?: Partial<UIState>) {
    const s = this.state$.value;
    if (!s.running) return;

    const els = s.elements.map(el => {
      if (el.id !== id) return el;

      const newUi: UIState = { ...el.ui, ...(payload || {}) };
      const bp = { ...el.brokenProps };
      let fixed = true;

      if (bp.clickBroken) {
        if (newUi.clicked === true) delete bp.clickBroken;
        else fixed = false;
      }

      if (bp.rotateBroken && bp.rotateBroken % 360 !== 0) {
        const need = ((bp.rotateBroken % 360) + 360) % 360;
        const cur = (newUi.rotation || 0) % 360;
        const diff = Math.abs(cur - need);
        if (diff <= 15 || Math.abs(diff - 360) <= 15) delete bp.rotateBroken;
        else fixed = false;
      }

      if (bp.textBroken) {
        if ((newUi.currentText || '').trim().toLowerCase() === bp.textBroken.expected.trim().toLowerCase()) {
          bp.textBroken = null;
        } else fixed = false;
      }

      if (bp.colorWrong) {
        if (this.colorsMatch(newUi.currentColor || '', bp.colorWrong)) delete bp.colorWrong;
        else fixed = false;
      }

      if (bp.blur) {
        if (newUi.blurred === false) delete bp.blur;
        else fixed = false;
      }

      if (bp.disabled) {
        if (newUi.disabled === false) delete bp.disabled;
        else fixed = false;
      }

      if (typeof bp.sliderBroken === 'number') {
        const cur = newUi.sliderValue || 0;
        if (Math.abs(cur - bp.sliderBroken) <= 2) delete bp.sliderBroken;
        else fixed = false;
      }

      if (bp.checkboxBroken) {
        if (newUi.checked === true) delete bp.checkboxBroken;
        else fixed = false;
      }

      if (bp.toggleBroken) {
        if (newUi.toggleState === true) delete bp.toggleBroken;
        else fixed = false;
      }

      if (bp.dropdownBroken) {
        if (newUi.selectedOption === bp.dropdownBroken) delete bp.dropdownBroken;
        else fixed = false;
      }

      if (typeof bp.opacityBroken === 'number') {
        if (Math.abs((newUi.opacity || 1) - bp.opacityBroken) <= 0.1) delete bp.opacityBroken;
        else fixed = false;
      }

      if (typeof bp.scaleBroken === 'number') {
        if (Math.abs((newUi.scale || 1) - bp.scaleBroken) <= 0.1) delete bp.scaleBroken;
        else fixed = false;
      }

      const nowFixed = fixed && Object.values(bp).every(v => !v || (typeof v === 'number' && v === 0));

      return { ...el, ui: newUi, brokenProps: bp, fixed: nowFixed, fixedAt: nowFixed && !el.fixed ? Date.now() : el.fixedAt };
    });

    const updated = this.checkOrderTasks(els);
    const prevFixedCount = s.elements.filter(e => e.fixed).length;
    const nowFixedCount = updated.filter(e => e.fixed).length;

    let gained = 0;
    let newCombo = s.combo;

    if (nowFixedCount > prevFixedCount) {
      const now = Date.now();
      const timeSinceLast = now - this.lastFixTime;

      if (timeSinceLast < 3000 && s.combo > 0) {
        newCombo++;
      } else {
        newCombo = 1;
      }

      this.lastFixTime = now;

      clearTimeout(this.comboTimeout);
      this.comboTimeout = setTimeout(() => {
        const current = this.state$.value;
        this.state$.next({ ...current, combo: 0 });
      }, 3000);

      const diff = nowFixedCount - prevFixedCount;
      const perElementBase = 100 * s.level;
      const comboBonus = newCombo > 1 ? Math.floor(perElementBase * (newCombo * 0.25)) : 0;
      const timeBonus = Math.floor(s.timeLeft * 2);

      const doubleActive = s.powerUps.find(p => p.id === 'double')?.active;
      const multiplier = doubleActive ? 2 : 1;

      gained = (diff * perElementBase + comboBonus + timeBonus) * multiplier;
    }

    const newScore = s.score + gained;
    const maxCombo = Math.max(s.maxCombo, newCombo);
    const totalFixed = s.totalFixed + (nowFixedCount - prevFixedCount);

    const nextState: GameState = {
      ...s,
      elements: updated,
      score: newScore,
      combo: newCombo,
      maxCombo,
      totalFixed,
      message: gained ? `+${gained} pts${newCombo > 1 ? ` • ${newCombo}x COMBO! 🔥` : ''}` : s.message
    };

    this.state$.next(nextState);
    this.checkAchievements(nextState);

    if (updated.every(e => e.fixed)) {
      this.finishLevel(true, '✨ Level Complete!');
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

    return elements.map(e => {
      if (typeof e.brokenProps.orderIndex === 'number') {
        return { ...e, fixed: allGood };
      }
      return e;
    });
  }

  private checkAchievements(state: GameState) {
    const achievements = state.achievements.map(a => {
      if (a.unlocked) return a;

      let unlocked = false;
      let progress = a.progress;

      switch (a.id) {
        case 'first_fix':
          unlocked = state.totalFixed >= 1;
          break;
        case 'combo_5':
          unlocked = state.maxCombo >= 5;
          break;
        case 'speed_demon':
          unlocked = state.level > 1 && state.timeLeft > 60;
          break;
        case 'perfectionist':
          unlocked = state.elements.every(e => e.fixed) && state.hintsUsed === 0;
          break;
        case 'level_5':
          unlocked = state.level >= 5;
          break;
        case 'score_1000':
          progress = state.score;
          unlocked = state.score >= 1000;
          break;
      }

      if (unlocked && !a.unlocked) {
        setTimeout(() => {
          const current = this.state$.value;
          this.state$.next({ ...current, message: `🏆 Achievement: ${a.name}!` });
        }, 500);
      }

      return { ...a, unlocked, progress };
    });

    this.state$.next({ ...state, achievements });
  }

  private finishLevel(success: boolean, message: string) {
    clearInterval(this.timer);
    clearTimeout(this.comboTimeout);
    const s = this.state$.value;

    const extra = success ? s.timeLeft * 8 : 0;
    const comboBonus = success ? s.maxCombo * 50 : 0;
    const finalScore = s.score + extra + comboBonus;

    if (finalScore > this.getBest()) this.setBest(finalScore);

    const stats = this.getStats();
    stats.totalFixed = (stats.totalFixed || 0) + s.totalFixed;
    stats.maxCombo = Math.max(stats.maxCombo || 0, s.maxCombo);
    this.saveStats(stats);

    const nextLevel = success ? s.level + 1 : s.level;

    let fullMessage = message;
    if (success) {
      fullMessage += ` • +${extra} time bonus`;
      if (comboBonus > 0) fullMessage += ` • +${comboBonus} combo bonus`;
    }

    this.state$.next({
      ...s,
      running: false,
      message: fullMessage,
      score: finalScore,
      level: nextLevel,
      combo: 0
    });

    this.checkAchievements({ ...s, score: finalScore, level: nextLevel });
  }

  private generateLevel(level: number): GameElement[] {
    const baseCount = 4;
    const count = baseCount + Math.floor(level * 1.5);
    const elements: GameElement[] = [];
    const types: ElementType[] = ['button', 'input', 'card', 'slider', 'label', 'checkbox', 'toggle', 'dropdown'];

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const difficulty = 1 + Math.floor(Math.random() * Math.min(3, level));

      const brokenProps: GameElement['brokenProps'] = {};
      const ui: UIState = {
        rotation: 0,
        currentText: '',
        currentColor: '#808080',
        blurred: false,
        disabled: false,
        orderIndex: i,
        clicked: false,
        sliderValue: 0,
        checked: false,
        toggleState: false,
        selectedOption: '',
        opacity: 1,
        scale: 1
      };

      const allOpts = ['clickBroken', 'rotateBroken', 'textBroken', 'colorWrong', 'blur', 'disabled',
      'sliderBroken', 'orderIndex', 'checkboxBroken', 'toggleBroken', 'dropdownBroken',
      'opacityBroken', 'scaleBroken'];

      const pickCount = 1 + Math.floor(Math.random() * Math.min(2, Math.ceil(level / 2)));
      const picks = this.pickRandom(allOpts, pickCount);

      for (const p of picks) {
        switch (p) {
          case 'clickBroken':
            brokenProps.clickBroken = true;
            break;
          case 'rotateBroken':
            const angles = [90, 180, 270];
            const need = angles[Math.floor(Math.random() * angles.length)];
            brokenProps.rotateBroken = need;
            ui.rotation = (need + 180) % 360;
            break;
          case 'textBroken':
            const words = ['fix', 'hello', 'angular', 'debug', 'code', 'ui', 'dev', 'web', 'app'];
            const expected = words[Math.floor(Math.random() * words.length)];
            brokenProps.textBroken = { expected };
            ui.currentText = '';
            break;
          case 'colorWrong':
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F38181', '#AA96DA', '#FCBAD3'];
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
          case 'checkboxBroken':
            brokenProps.checkboxBroken = true;
            ui.checked = false;
            break;
          case 'toggleBroken':
            brokenProps.toggleBroken = true;
            ui.toggleState = false;
            break;
          case 'dropdownBroken':
            const options = ['Option A', 'Option B', 'Option C', 'Option D'];
            const correctOption = options[Math.floor(Math.random() * options.length)];
            brokenProps.dropdownBroken = correctOption;
            ui.selectedOption = '';
            break;
          case 'opacityBroken':
            brokenProps.opacityBroken = 1;
            ui.opacity = 0.3;
            break;
          case 'scaleBroken':
            brokenProps.scaleBroken = 1;
            ui.scale = 0.5;
            break;
        }
      }

      const hint = this.buildHint(type, brokenProps);
      elements.push({
        id: `el-${i}-${Date.now()}`,
                    type,
                    brokenProps,
                    difficulty,
                    fixed: false,
                    hint,
                    ui
      });
    }

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
    if (bp.rotateBroken) return 'Double-click to rotate to correct angle';
    if (bp.clickBroken) return 'Click the tile to activate';
    if (bp.textBroken) return `Type "${bp.textBroken!.expected}" in the input`;
    if (bp.colorWrong) return 'Pick the correct color';
    if (bp.blur) return 'Click to remove blur';
    if (bp.disabled) return 'Click to enable';
    if (bp.sliderBroken) return `Move slider to ${bp.sliderBroken}`;
    if (typeof bp.orderIndex === 'number') return 'Drag to correct position';
    if (bp.checkboxBroken) return 'Check the checkbox';
    if (bp.toggleBroken) return 'Toggle the switch ON';
    if (bp.dropdownBroken) return `Select "${bp.dropdownBroken}"`;
    if (bp.opacityBroken) return 'Adjust opacity to 100%';
    if (bp.scaleBroken) return 'Scale to normal size';
    return 'Interact to fix';
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
