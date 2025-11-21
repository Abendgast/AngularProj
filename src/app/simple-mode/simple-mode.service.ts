import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type SimpleDefectType = 'simple' | 'crack' | 'screw' | 'wire' | 'paint';

export interface SimpleDefectUI {
  rotation?: number;
  connected?: boolean;
  wheelProgress?: number;
}

export interface SimpleDefect {
  id: string;
  type: SimpleDefectType;
  x: number;
  y: number;
  fixed: boolean;
  ui?: SimpleDefectUI;
}

export interface SimpleModeState {
  level: number;
  defects: SimpleDefect[];
  levelComplete: boolean;
}

@Injectable({ providedIn: 'root' })
export class SimpleModeService {
  private stateSubject$ = new BehaviorSubject<SimpleModeState>({
    level: 1,
    defects: [],
    levelComplete: false
  });

  get state$(): Observable<SimpleModeState> {
    return this.stateSubject$.asObservable();
  }

  getStateSnapshot(): Observable<SimpleModeState> {
    return this.state$;
  }

  startLevel(level: number) {
    const defects = this.generateLevel(level);
    this.stateSubject$.next({
      level,
      defects,
      levelComplete: false
    });
  }

  hitDefect(defectId: string) {
    const state = this.stateSubject$.value;
    const defects = state.defects.map(d => {
      if (d.id === defectId && !d.fixed) {
        return { ...d, fixed: true };
      }
      return d;
    });

    const allFixed = defects.every(d => d.fixed);
    
    this.stateSubject$.next({
      ...state,
      defects,
      levelComplete: allFixed
    });
  }

  handleWheelOnDefect(defectId: string, deltaY: number) {
    const state = this.stateSubject$.value;
    const defect = state.defects.find(d => d.id === defectId);
    if (!defect || defect.fixed || defect.type !== 'screw') return;

    const defects = state.defects.map(d => {
      if (d.id === defectId) {
        const currentRotation = d.ui?.rotation || 0;
        const newRotation = (currentRotation + Math.abs(deltaY) * 0.5) % 360;
        const wheelProgress = Math.min(100, (d.ui?.wheelProgress || 0) + 2);
        return {
          ...d,
          ui: {
            ...d.ui,
            rotation: newRotation,
            wheelProgress
          }
        };
      }
      return d;
    });

    this.stateSubject$.next({
      ...state,
      defects
    });
  }

  connectWires(wire1Id: string, wire2Id: string) {
    const state = this.stateSubject$.value;
    const defects = state.defects.map(d => {
      if (d.id === wire1Id || d.id === wire2Id) {
        return {
          ...d,
          ui: {
            ...d.ui,
            connected: true
          }
        };
      }
      return d;
    });

    this.stateSubject$.next({
      ...state,
      defects
    });
  }

  nextLevel() {
    const currentLevel = this.stateSubject$.value.level;
    if (currentLevel < 5) {
      this.startLevel(currentLevel + 1);
    }
  }

  private generateLevel(level: number): SimpleDefect[] {
    const defects: SimpleDefect[] = [];
    const count = 10;
    const wirePairs: string[] = [];

    for (let i = 0; i < count; i++) {
      let type: SimpleDefectType = 'simple';
      
      if (level === 1) {
        type = 'simple';
      } else if (level === 2) {
        // Mix of simple and cracks
        type = i < 5 ? 'simple' : 'crack';
      } else if (level === 3) {
        // Mix of simple, cracks, and screws
        const rand = Math.random();
        if (rand < 0.3) type = 'simple';
        else if (rand < 0.6) type = 'crack';
        else type = 'screw';
      } else if (level === 4) {
        // Mix including wires (need pairs)
        const rand = Math.random();
        if (rand < 0.3) type = 'simple';
        else if (rand < 0.5) type = 'crack';
        else if (rand < 0.7) type = 'screw';
        else {
          type = 'wire';
          wirePairs.push(`defect-${i}`);
        }
      } else if (level === 5) {
        // All types including paint
        const rand = Math.random();
        if (rand < 0.2) type = 'simple';
        else if (rand < 0.35) type = 'crack';
        else if (rand < 0.5) type = 'screw';
        else if (rand < 0.7) {
          type = 'wire';
          wirePairs.push(`defect-${i}`);
        } else type = 'paint';
      }

      // Random position (avoid edges)
      const x = 10 + Math.random() * 80;
      const y = 10 + Math.random() * 80;

      defects.push({
        id: `defect-${i}`,
        type,
        x,
        y,
        fixed: false,
        ui: type === 'screw' ? { rotation: 0, wheelProgress: 0 } : type === 'wire' ? { connected: false } : undefined
      });
    }

    // Store wire pairs for level 4 and 5
    if (level >= 4 && wirePairs.length >= 2) {
      // Ensure even number of wires
      if (wirePairs.length % 2 === 1) {
        wirePairs.pop();
      }
    }

    return defects;
  }
}

