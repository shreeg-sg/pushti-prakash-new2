import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonSplitPane,
  IonMenu,
  IonRouterOutlet
} from '@ionic/angular/standalone';

import { SidebarComponent } from './sidebar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonSplitPane,
    IonMenu,
    IonRouterOutlet,
    SidebarComponent
  ],
  template: `
    <ion-split-pane contentId="main-content" when="lg">
      <!-- Sidebar containing menu links and bottom footer -->
      <ion-menu contentId="main-content" type="overlay">
        <app-sidebar class="ion-page"></app-sidebar>
      </ion-menu>

      <!-- Main Viewport -->
      <ion-router-outlet id="main-content"></ion-router-outlet>
    </ion-split-pane>
  `
})
export class ShellComponent {}