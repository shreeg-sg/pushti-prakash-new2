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

      <!-- Main Viewport: Clean full-height (Footer moved to sidebar) -->
      <div class="ion-page shell-main-viewport" id="main-content">
        <div class="shell-router-container">
          <ion-router-outlet></ion-router-outlet>
        </div>
      </div>
    </ion-split-pane>
  `,
  styles: [`
    .shell-main-viewport {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .shell-router-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
  `]
})
export class ShellComponent {}