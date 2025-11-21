import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { GameService, GameElement, GameState } from './services/game.service';

type ViewMode = 'menu' | 'game' | 'simple-mode';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  state$: Observable<GameState>;
  dragSrcId: string | null = null;
  currentView: ViewMode = 'menu';

  constructor(private game: GameService) {
    this.state$ = this.game.state;
  }

  showMenu() {
    this.currentView = 'menu';
  }

  startNormalGame() {
    this.currentView = 'game';
    const snap = this.getSnapshot();
    const lvl = snap ? snap.level : 1;
    this.game.startLevel(lvl);
  }

  startSimpleMode() {
    this.currentView = 'simple-mode';
  }

  start() {
    if (this.currentView !== 'game') return;
    const snap = this.getSnapshot();
    const lvl = snap ? snap.level : 1;
    this.game.startLevel(lvl);
  }

  stop() {
    this.game.stop();
  }

  useHint(elId?: string) {
    this.game.useHint(elId);
  }

  clickElement(el: GameElement, event: MouseEvent) {
    // Prevent interaction if already fixed
    if (el.fixed) return;

    // clickBroken: simple click fixes it
    if (el.brokenProps.clickBroken) {
      this.game.fixAttempt(el.id, { clicked: true });
      return;
    }

    // blur: click to unblur
    if (el.brokenProps.blur) {
      this.game.fixAttempt(el.id, { blurred: false });
      return;
    }

    // disabled: click to enable
    if (el.brokenProps.disabled) {
      this.game.fixAttempt(el.id, { disabled: false });
      return;
    }
  }

  rotateElement(el: GameElement, event: Event) {
    event.stopPropagation();
    if (el.fixed) return;

    const cur = el.ui?.rotation || 0;
    const next = (cur + 90) % 360;
    this.game.fixAttempt(el.id, { rotation: next });
  }

  onTextChange(el: GameElement, v: string) {
    if (el.fixed) return;
    this.game.fixAttempt(el.id, { currentText: v });
  }

  onColorPick(el: GameElement, v: string) {
    if (el.fixed) return;
    this.game.fixAttempt(el.id, { currentColor: v });
  }

  onSliderChange(el: GameElement, v: string) {
    if (el.fixed) return;
    const num = parseInt(v, 10);
    this.game.fixAttempt(el.id, { sliderValue: num });
  }

  dragStart(ev: DragEvent, el: GameElement) {
    if (el.fixed) {
      ev.preventDefault();
      return;
    }
    this.dragSrcId = el.id;
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', el.id);
      ev.dataTransfer.effectAllowed = 'move';
    }
  }

  drop(ev: DragEvent, targetEl: GameElement) {
    ev.preventDefault();
    if (targetEl.fixed) return;

    const srcId = this.dragSrcId || ev.dataTransfer?.getData('text/plain');
    if (!srcId) return;

    const snap = this.getSnapshot();
    if (!snap) return;

    const els = snap.elements.slice();
    const src = els.find(e => e.id === srcId);
    const tgt = els.find(e => e.id === targetEl.id);

    if (!src || !tgt) return;

    const srcOrder = src.ui?.orderIndex ?? 0;
    const tgtOrder = tgt.ui?.orderIndex ?? 0;

    // Swap order indices
    this.game.fixAttempt(src.id, { orderIndex: tgtOrder });
    this.game.fixAttempt(tgt.id, { orderIndex: srcOrder });
    this.dragSrcId = null;
  }

  allowDrop(ev: DragEvent) {
    ev.preventDefault();
  }

  getSnapshot(): GameState | null {
    let snap: GameState | null = null;
    this.state$.subscribe(s => (snap = s)).unsubscribe();
    return snap;
  }

  bestScore() {
    return this.game.getBest();
  }

  isLevelComplete(elements: GameElement[] | undefined): boolean {
    return elements ? elements.every(e => e.fixed) : false;
  }

  // Prevent drag on inputs
  onInputDragStart(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }
}
