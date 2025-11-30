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
  hammerPosition = { x: 200, y: 200 };
  isDragging = false;
  dragOffset = { x: 0, y: 0 };
  hoveredDefect: string | null = null;
  currentToolType: string = 'brush'; // 'brush', 'hammer', 'wrench', 'pliers'
  holdTimer: any = null;
  holdProgress = 0;
  circularProgress = 0;
  lastMouseAngle = 0;
  paintProgress: { [key: string]: number } = {};
  circularTrackingInterval: any = null;
  paintTrackingInterval: { [key: string]: any } = {};
  currentLevel = 1;
  elapsedTime = 0; // in seconds
  gameTimer: any = null;
  levelStartTime = Date.now();

  constructor(public simpleModeService: SimpleModeService) {}

  ngOnInit() {
    // Wait for viewport to be ready and DOM to be rendered
    setTimeout(() => {
      this.simpleModeService.startLevel(1);
      
      // Subscribe to state changes
      let previousLevel = 1;
      this.state$.subscribe(state => {
        // Only reset tool type when level actually changes, not on every state update
        if (state.level !== previousLevel) {
          previousLevel = state.level;
          this.currentLevel = state.level;
          this.levelStartTime = Date.now();
          this.elapsedTime = 0;
          this.startTimer(); // Restart timer for new level
          
          // Reset tool type when level changes
          if (state.level === 1) {
            this.currentToolType = 'brush';
          } else {
            this.currentToolType = 'hammer';
          }
        } else {
          this.currentLevel = state.level;
        }
        
        // Debug log
        console.log('Simple Mode State:', {
          level: state.level,
          defectsCount: state.defects.length,
          levelComplete: state.levelComplete
        });
        
        if (state.defects.length > 0) {
          console.log('First 3 defects:', state.defects.slice(0, 3).map(d => ({
            id: d.id,
            type: d.type,
            x: d.x,
            y: d.y,
            fixed: d.fixed
          })));
          
          // Check if defects are in DOM after a short delay
          setTimeout(() => {
            const defectsInDOM = document.querySelectorAll('.simple-defect');
            console.log('Defects in DOM:', defectsInDOM.length);
            if (defectsInDOM.length === 0) {
              console.error('ERROR: No defects found in DOM!');
            } else {
              defectsInDOM.forEach((el, idx) => {
                const rect = el.getBoundingClientRect();
                console.log(`Defect ${idx} in DOM:`, {
                  id: el.getAttribute('data-defect-id'),
                  visible: rect.width > 0 && rect.height > 0,
                  position: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
                });
              });
            }
          }, 200);
        }
        
        // Auto-advance to next level when current level is complete
        if (state.levelComplete && state.level < 5) {
          setTimeout(() => {
            this.simpleModeService.nextLevel();
          }, 2000); // Wait 2 seconds before auto-advancing
        }
      });
      
      // Start game timer
      this.startTimer();
    }, 200);
  }
  
  startTimer() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
    }
    this.gameTimer = setInterval(() => {
      this.elapsedTime = Math.floor((Date.now() - this.levelStartTime) / 1000);
    }, 1000); // Update every second
  }
  
  stopTimer() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
  }
  
  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  ngOnDestroy() {
    this.stopTimer();
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
    }
    if (this.circularTrackingInterval) {
      clearInterval(this.circularTrackingInterval);
    }
    Object.values(this.paintTrackingInterval).forEach(interval => {
      if (interval) clearInterval(interval);
    });
    // Clean up global listeners
    document.removeEventListener('mousemove', this.onGlobalMouseMove);
    document.removeEventListener('mouseup', this.onGlobalMouseUp);
  }

  onHammerMouseDown(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    };
    
    // Add global mouse move and up listeners for better dragging
    document.addEventListener('mousemove', this.onGlobalMouseMove);
    document.addEventListener('mouseup', this.onGlobalMouseUp);
  }
  
  onGlobalMouseMove = (event: MouseEvent) => {
    if (this.isDragging) {
      this.hammerPosition = {
        x: event.clientX - this.dragOffset.x,
        y: event.clientY - this.dragOffset.y
      };
      // Always check for defect overlap when dragging
      this.checkDefectHover(event);
    }
  }
  
  onGlobalMouseUp = (event: MouseEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      this.checkDefectClick(event);
      this.clearHoldTimer();
      document.removeEventListener('mousemove', this.onGlobalMouseMove);
      document.removeEventListener('mouseup', this.onGlobalMouseUp);
    }
  }

  onMouseMove(event: MouseEvent) {
    // Only check when tool is being dragged (not cursor hover)
    if (this.isDragging) {
      this.checkDefectHover(event);
    }
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
      
      // Check if screw is ready to fix after wheel
      this.simpleModeService.getStateSnapshot().subscribe(state => {
        const defect = state.defects.find(d => d.id === this.hoveredDefect);
        if (defect && defect.type === 'screw' && !defect.fixed) {
          const wheelProgress = defect.ui?.wheelProgress || 0;
          if (wheelProgress >= 100) {
            setTimeout(() => {
              console.log('Auto-fixing screw after wheel complete:', this.hoveredDefect);
              this.simpleModeService.hitDefect(this.hoveredDefect!);
            }, 100);
          }
        }
      }).unsubscribe();
    }
  }

  checkDefectHover(event: MouseEvent) {
    const defects = document.querySelectorAll('.simple-defect');
    let foundHover = false;
    
    // Get tool position and size
    const toolEl = document.querySelector('.tool') as HTMLElement;
    if (!toolEl) return;
    
    const toolRect = toolEl.getBoundingClientRect();
    const toolCenterX = toolRect.left + toolRect.width / 2;
    const toolCenterY = toolRect.top + toolRect.height / 2;
    const toolRadius = Math.max(toolRect.width, toolRect.height) / 2;
    
    defects.forEach((defectEl) => {
      const defectRect = defectEl.getBoundingClientRect();
      const defectCenterX = defectRect.left + defectRect.width / 2;
      const defectCenterY = defectRect.top + defectRect.height / 2;
      const defectRadius = Math.max(defectRect.width, defectRect.height) / 2;
      
      // Check if tool overlaps with defect (circle collision)
      const distance = Math.sqrt(
        Math.pow(toolCenterX - defectCenterX, 2) + 
        Math.pow(toolCenterY - defectCenterY, 2)
      );
      const minDistance = toolRadius + defectRadius;
      
      if (distance < minDistance) {
        const defectId = defectEl.getAttribute('data-defect-id');
        if (defectId && defectId !== this.hoveredDefect) {
          this.hoveredDefect = defectId;
          this.simpleModeService.getStateSnapshot().subscribe(state => {
            const defect = state.defects.find(d => d.id === defectId);
            if (defect && !defect.fixed) {
              // Don't auto-switch tools - user selects tool manually
              // Start appropriate tracking based on defect type and selected tool
              if (defect.type === 'simple' && this.currentLevel === 1 && this.currentToolType === 'brush') {
                // Level 1: simple defects need painting with brush
                this.startPaintTracking(defectId);
              } else if (defect.type === 'crack' && this.currentToolType === 'hammer') {
                // Cracks need hammer
                this.startHoldTimer(defectId);
              } else if (defect.type === 'screw' && this.currentToolType === 'wrench') {
                // Screws need wrench
                this.startCircularTracking(defectId, defectCenterX, defectCenterY);
              } else if (defect.type === 'paint' && this.currentToolType === 'brush') {
                // Paint leaks need brush
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
      
      // Check if correct tool is being used
      if (defect.type === 'simple') {
        if (this.currentLevel === 1 && this.currentToolType === 'brush') {
          // Level 1: need to paint first
          const progress = this.paintProgress[defect.id] || 0;
          if (progress >= 100) {
            console.log('Manual fix after 100% paint:', this.hoveredDefect);
            this.simpleModeService.hitDefect(this.hoveredDefect!);
          } else {
            console.log('Paint progress not complete:', progress);
          }
        } else if (this.currentLevel > 1 && this.currentToolType === 'hammer') {
          // Other levels: simple hit with hammer
          this.simpleModeService.hitDefect(this.hoveredDefect!);
        }
      } else if (defect.type === 'crack' && this.currentToolType === 'hammer') {
        if (this.holdProgress >= 100) {
          console.log('Fixing crack defect:', this.hoveredDefect);
          this.simpleModeService.hitDefect(this.hoveredDefect!);
        } else {
          console.log('Crack not ready, hold progress:', this.holdProgress);
        }
      } else if (defect.type === 'screw' && this.currentToolType === 'wrench') {
        // Check if screw has been rotated enough (via wheel or circular motion)
        const wheelProgress = defect.ui?.wheelProgress || 0;
        if (this.circularProgress >= 100 || wheelProgress >= 100) {
          this.simpleModeService.hitDefect(this.hoveredDefect!);
        }
      } else if (defect.type === 'wire' && this.currentToolType === 'pliers') {
        // Wire connection is handled separately - need to connect first
        if (defect.ui?.connected) {
          console.log('Fixing connected wire defect:', this.hoveredDefect);
          this.simpleModeService.hitDefect(this.hoveredDefect!);
        } else {
          console.log('Wire not connected yet. Drag wire ends together first.');
        }
      } else if (defect.type === 'paint' && this.currentToolType === 'brush') {
        const progress = this.paintProgress[defect.id] || 0;
        if (progress >= 100) {
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
      // Check if still hovering over the same defect
      if (this.hoveredDefect !== defectId) {
        this.clearHoldTimer();
        return;
      }
      
      this.holdProgress += increment;
      if (this.holdProgress >= 100) {
        this.holdProgress = 100;
        clearInterval(this.holdTimer);
        this.holdTimer = null;
        
        // Auto-fix when hold is complete
        setTimeout(() => {
          this.simpleModeService.getStateSnapshot().subscribe(state => {
            const defect = state.defects.find(d => d.id === defectId);
            if (defect && !defect.fixed && this.hoveredDefect === defectId) {
              console.log('Auto-fixing crack after hold complete:', defectId);
              this.simpleModeService.hitDefect(defectId);
            }
          }).unsubscribe();
        }, 100);
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
      
      // Get tool position for circular tracking
      const toolEl = document.querySelector('.tool') as HTMLElement;
      if (!toolEl) return;
      const toolRect = toolEl.getBoundingClientRect();
      const hammerCenterX = toolRect.left + toolRect.width / 2;
      const hammerCenterY = toolRect.top + toolRect.height / 2;
      const angle = Math.atan2(hammerCenterY - centerY, hammerCenterX - centerX);
      
      if (lastHammerAngle !== 0) {
        let angleDiff = angle - lastHammerAngle;
        // Normalize angle difference
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        if (Math.abs(angleDiff) > 0.05) {
          this.circularProgress = Math.min(100, this.circularProgress + Math.abs(angleDiff) * 30);
          
          // Auto-fix when circular progress reaches 100%
          if (this.circularProgress >= 100) {
            clearInterval(this.circularTrackingInterval);
            this.circularTrackingInterval = null;
            
            setTimeout(() => {
              this.simpleModeService.getStateSnapshot().subscribe(state => {
                const defect = state.defects.find(d => d.id === defectId);
                if (defect && !defect.fixed && this.hoveredDefect === defectId) {
                  console.log('Auto-fixing screw after circular motion complete:', defectId);
                  this.simpleModeService.hitDefect(defectId);
                }
              }).unsubscribe();
            }, 100);
            return;
          }
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
        const currentProgress = this.paintProgress[defectId] || 0;
        const newProgress = Math.min(100, currentProgress + 2);
        this.paintProgress[defectId] = newProgress;
        
        // Auto-fix when progress reaches 100%
        if (newProgress >= 100) {
          clearInterval(interval);
          delete this.paintTrackingInterval[defectId];
          
          // Small delay to ensure state is updated
          setTimeout(() => {
            // Check if defect is already fixed
            this.simpleModeService.getStateSnapshot().subscribe(state => {
              const defect = state.defects.find(d => d.id === defectId);
              if (defect && !defect.fixed) {
                console.log('Auto-fixing defect after 100% paint:', defectId, defect.type);
                this.simpleModeService.hitDefect(defectId);
              }
            }).unsubscribe();
          }, 100);
        }
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
    if (defect.fixed || defect.type !== 'wire' || defect.ui?.connected) {
      event.preventDefault();
      return;
    }
    event.dataTransfer!.setData('text/plain', defect.id);
    event.dataTransfer!.effectAllowed = 'move';
    console.log('Dragging wire:', defect.id);
  }

  onWireDrop(event: DragEvent, targetDefect: SimpleDefect) {
    event.preventDefault();
    event.stopPropagation();
    if (targetDefect.fixed || targetDefect.type !== 'wire' || targetDefect.ui?.connected) return;
    
    const sourceId = event.dataTransfer!.getData('text/plain');
    if (sourceId && sourceId !== targetDefect.id) {
      this.simpleModeService.getStateSnapshot().subscribe(state => {
        const sourceDefect = state.defects.find(d => d.id === sourceId);
        if (sourceDefect && sourceDefect.type === 'wire' && !sourceDefect.fixed && !sourceDefect.ui?.connected) {
          console.log('Connecting wires:', sourceId, 'to', targetDefect.id);
          this.simpleModeService.connectWires(sourceId, targetDefect.id);
          
          // Show message that wires are connected
          setTimeout(() => {
            console.log('Wires connected! Now use pliers tool to fix.');
          }, 100);
        } else {
          console.log('Cannot connect: source already connected or invalid');
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

  trackByDefectId(index: number, defect: SimpleDefect): string {
    return defect.id;
  }

  selectTool(tool: string) {
    this.currentToolType = tool;
  }
}

