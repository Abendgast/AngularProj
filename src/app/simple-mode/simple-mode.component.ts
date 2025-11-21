import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { SimpleModeService, SimpleModeState, SimpleDefect } from './simple-mode.service';

@Component({
  selector: 'app-simple-mode',
  templateUrl: './simple-mode.component.html',
  styleUrls: ['./simple-mode.component.scss']
})
export class SimpleModeComponent implements OnInit, OnDestroy {
  @Output() backToMenu = new EventEmitter<void>();
  
  state$ = this.simpleModeService.state$;
  hammerPosition = { x: 100, y: 100 };
  isDragging = false;
  dragOffset = { x: 0, y: 0 };
  hoveredDefect: string | null = null;
  holdTimer: any = null;
  holdProgress = 0;
  circularProgress = 0;
  lastMouseAngle = 0;
  paintProgress: { [key: string]: number } = {};
  circularTrackingInterval: any = null;
  paintTrackingInterval: { [key: string]: any } = {};

  constructor(public simpleModeService: SimpleModeService) {}

  ngOnInit() {
    this.simpleModeService.startLevel(1);
  }

  ngOnDestroy() {
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
    }
    if (this.circularTrackingInterval) {
      clearInterval(this.circularTrackingInterval);
    }
    Object.values(this.paintTrackingInterval).forEach(interval => {
      if (interval) clearInterval(interval);
    });
  }

  onHammerMouseDown(event: MouseEvent) {
    event.preventDefault();
    this.isDragging = true;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    };
  }

  onMouseMove(event: MouseEvent) {
    if (this.isDragging) {
      this.hammerPosition = {
        x: event.clientX - this.dragOffset.x,
        y: event.clientY - this.dragOffset.y
      };
    }
    this.checkDefectHover(event);
  }

  onMouseUp(event: MouseEvent) {
    if (this.isDragging) {
      this.isDragging = false;
      this.checkDefectClick(event);
      this.clearHoldTimer();
    }
  }

  onMouseLeave() {
    this.isDragging = false;
  }

  onMouseWheel(event: WheelEvent) {
    if (this.hoveredDefect) {
      event.preventDefault();
      this.simpleModeService.handleWheelOnDefect(this.hoveredDefect, event.deltaY);
    }
  }

  checkDefectHover(event: MouseEvent) {
    const defects = document.querySelectorAll('.simple-defect');
    let foundHover = false;
    const hammerCenterX = this.hammerPosition.x + 30; // Hammer center
    const hammerCenterY = this.hammerPosition.y + 30;
    
    defects.forEach((defectEl) => {
      const rect = defectEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        Math.pow(hammerCenterX - centerX, 2) + 
        Math.pow(hammerCenterY - centerY, 2)
      );
      
      if (distance < 80) {
        const defectId = defectEl.getAttribute('data-defect-id');
        if (defectId && defectId !== this.hoveredDefect) {
          this.hoveredDefect = defectId;
          this.simpleModeService.getStateSnapshot().subscribe(state => {
            const defect = state.defects.find(d => d.id === defectId);
            if (defect && !defect.fixed) {
              if (defect.type === 'crack') {
                this.startHoldTimer(defectId);
              } else if (defect.type === 'screw') {
                this.startCircularTracking(defectId, centerX, centerY);
              } else if (defect.type === 'paint') {
                this.startPaintTracking(defectId);
              }
            }
          }).unsubscribe();
        }
        foundHover = true;
      }
    });
    
    if (!foundHover && this.hoveredDefect) {
      this.simpleModeService.getStateSnapshot().subscribe(state => {
        const defect = state.defects.find(d => d.id === this.hoveredDefect);
        if (!defect || defect.fixed || defect.type === 'wire') {
          this.hoveredDefect = null;
          this.clearHoldTimer();
          this.clearCircularTracking();
          this.clearPaintTracking();
        }
      }).unsubscribe();
    }
  }

  checkDefectClick(event: MouseEvent) {
    if (!this.hoveredDefect) return;
    
    this.simpleModeService.getStateSnapshot().subscribe(state => {
      const defect = state.defects.find(d => d.id === this.hoveredDefect);
      if (!defect || defect.fixed) return;
      
      if (defect.type === 'simple' || defect.type === 'crack') {
        if (defect.type === 'crack' && this.holdProgress < 100) {
          return; // Need to hold first
        }
        this.simpleModeService.hitDefect(this.hoveredDefect!);
      } else if (defect.type === 'screw') {
        // Check if screw has been rotated enough (via wheel or circular motion)
        const wheelProgress = defect.ui?.wheelProgress || 0;
        if (this.circularProgress >= 100 || wheelProgress >= 100) {
          this.simpleModeService.hitDefect(this.hoveredDefect!);
        }
      } else if (defect.type === 'wire') {
        // Wire connection is handled separately - need to connect first
        if (defect.ui?.connected) {
          this.simpleModeService.hitDefect(this.hoveredDefect!);
        }
      } else if (defect.type === 'paint') {
        if (this.paintProgress[defect.id] >= 100) {
          this.simpleModeService.hitDefect(this.hoveredDefect!);
        }
      }
    }).unsubscribe();
  }

  startHoldTimer(defectId: string) {
    this.clearHoldTimer();
    this.holdProgress = 0;
    const interval = 50; // Update every 50ms
    const totalTime = 500; // 0.5 seconds
    const increment = (interval / totalTime) * 100;
    
    this.holdTimer = setInterval(() => {
      this.holdProgress += increment;
      if (this.holdProgress >= 100) {
        this.holdProgress = 100;
        clearInterval(this.holdTimer);
        this.holdTimer = null;
      }
    }, interval);
  }

  clearHoldTimer() {
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdProgress = 0;
  }

  startCircularTracking(defectId: string, centerX: number, centerY: number) {
    if (this.circularTrackingInterval) {
      clearInterval(this.circularTrackingInterval);
    }
    this.circularProgress = 0;
    this.lastMouseAngle = 0;
    
    let lastHammerAngle = 0;
    this.circularTrackingInterval = setInterval(() => {
      if (this.hoveredDefect !== defectId) {
        this.clearCircularTracking();
        return;
      }
      
      const hammerCenterX = this.hammerPosition.x + 30;
      const hammerCenterY = this.hammerPosition.y + 30;
      const angle = Math.atan2(hammerCenterY - centerY, hammerCenterX - centerX);
      
      if (lastHammerAngle !== 0) {
        let angleDiff = angle - lastHammerAngle;
        // Normalize angle difference
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        if (Math.abs(angleDiff) > 0.05) {
          this.circularProgress = Math.min(100, this.circularProgress + Math.abs(angleDiff) * 30);
        }
      }
      lastHammerAngle = angle;
    }, 50);
  }

  clearCircularTracking() {
    if (this.circularTrackingInterval) {
      clearInterval(this.circularTrackingInterval);
      this.circularTrackingInterval = null;
    }
    this.circularProgress = 0;
    this.lastMouseAngle = 0;
  }

  startPaintTracking(defectId: string) {
    this.clearPaintTracking(defectId);
    if (!this.paintProgress[defectId]) {
      this.paintProgress[defectId] = 0;
    }
    // Paint progress increases while hovering
    const interval = setInterval(() => {
      if (this.hoveredDefect === defectId) {
        this.paintProgress[defectId] = Math.min(100, (this.paintProgress[defectId] || 0) + 2);
      } else {
        clearInterval(interval);
        delete this.paintTrackingInterval[defectId];
      }
    }, 50);
    this.paintTrackingInterval[defectId] = interval;
  }

  clearPaintTracking(defectId?: string) {
    if (defectId) {
      if (this.paintTrackingInterval[defectId]) {
        clearInterval(this.paintTrackingInterval[defectId]);
        delete this.paintTrackingInterval[defectId];
      }
    } else {
      Object.values(this.paintTrackingInterval).forEach(interval => {
        if (interval) clearInterval(interval);
      });
      this.paintTrackingInterval = {};
    }
  }

  onWireDragStart(event: DragEvent, defect: SimpleDefect) {
    if (defect.fixed || defect.type !== 'wire') return;
    event.dataTransfer!.setData('text/plain', defect.id);
    event.dataTransfer!.effectAllowed = 'move';
  }

  onWireDrop(event: DragEvent, targetDefect: SimpleDefect) {
    event.preventDefault();
    if (targetDefect.fixed || targetDefect.type !== 'wire') return;
    
    const sourceId = event.dataTransfer!.getData('text/plain');
    if (sourceId && sourceId !== targetDefect.id) {
      this.simpleModeService.getStateSnapshot().subscribe(state => {
        const sourceDefect = state.defects.find(d => d.id === sourceId);
        if (sourceDefect && sourceDefect.type === 'wire' && !sourceDefect.fixed) {
          this.simpleModeService.connectWires(sourceId, targetDefect.id);
        }
      }).unsubscribe();
    }
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
  }

  goBack() {
    this.backToMenu.emit();
  }

  getLevelName(level: number): string {
    const names: { [key: number]: string } = {
      1: 'Easy',
      2: 'Cracks Cleaning',
      3: 'Loose Screws',
      4: 'Broken Wires',
      5: 'Paint Leaks'
    };
    return names[level] || 'Unknown';
  }

  getFixedCount(defects: SimpleDefect[]): number {
    return defects.filter(d => d.fixed).length;
  }
}

