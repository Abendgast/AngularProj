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

  private getViewportSize(): { width: number; height: number } {
    if (typeof window !== 'undefined') {
      return {
        width: window.innerWidth || 1400,
        height: window.innerHeight || 800
      };
    }
    return { width: 1400, height: 800 }; // Fallback
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

      // Random position - distribute across the entire viewport
      // Get actual viewport size
      const viewport = this.getViewportSize();
      
      // Header and HUD take approximately 150px from top
      const headerHeight = 150;
      const margin = 80; // Increased margin for better distribution
      const defectWidth = 100;
      const defectHeight = 100;
      
      // Use actual viewport dimensions, with fallback
      const viewportWidth = viewport.width || window.innerWidth || 1920;
      const viewportHeight = viewport.height || window.innerHeight || 1080;
      
      // Board takes full width and remaining height after header
      const boardWidth = viewportWidth;
      const boardHeight = viewportHeight - headerHeight;
      
      // Calculate available area for defects (with margins)
      const minX = margin;
      const maxX = boardWidth - margin - defectWidth;
      const minY = margin;
      const maxY = boardHeight - margin - defectHeight;
      
      // Ensure we have valid range
      const availableWidth = Math.max(400, maxX - minX);
      const availableHeight = Math.max(300, maxY - minY);
      
      // Generate random position across entire available area
      const x = minX + Math.random() * availableWidth;
      const y = minY + Math.random() * availableHeight;
      
      // Debug log for first few defects
      if (i < 3) {
        console.log(`Defect ${i} position:`, { 
          x: Math.round(x), 
          y: Math.round(y),
          viewportWidth,
          viewportHeight,
          boardWidth,
          boardHeight,
          availableWidth: Math.round(availableWidth),
          availableHeight: Math.round(availableHeight),
          range: {
            x: `${Math.round(minX)}-${Math.round(maxX)}`,
            y: `${Math.round(minY)}-${Math.round(maxY)}`
          }
        });
      }

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

