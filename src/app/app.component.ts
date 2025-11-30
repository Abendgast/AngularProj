import { Component } from '@angular/core';

type ViewMode = 'menu' | 'simple-mode';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  currentView: ViewMode = 'menu';

  showMenu() {
    this.currentView = 'menu';
  }

  startSimpleMode() {
    this.currentView = 'simple-mode';
  }
}
