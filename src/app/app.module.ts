import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { GameService } from './services/game.service';
import { SimpleModeComponent } from './simple-mode/simple-mode.component';

@NgModule({
  declarations: [AppComponent, SimpleModeComponent],
  imports: [BrowserModule, BrowserAnimationsModule, FormsModule],
  providers: [GameService],
  bootstrap: [AppComponent]
})
export class AppModule {}
