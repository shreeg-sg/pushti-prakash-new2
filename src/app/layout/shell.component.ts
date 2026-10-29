import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonSplitPane,
  IonMenu,
  IonRouterOutlet
} from '@ionic/angular/standalone';

import { SidebarComponent } from './sidebar.component';
import { FooterComponent } from './footer.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonSplitPane,
    IonMenu,
    IonRouterOutlet,
    SidebarComponent,
    FooterComponent
  ],
  template: `
    <ion-split-pane contentId="main-content" when="lg">
      <!-- Global Slide-Out / Split-Pane Sidebar -->
      <ion-menu contentId="main-content" type="overlay">
        <app-sidebar class="ion-page"></app-sidebar>
      </ion-menu>

      <!-- Main Viewport Container (Routed Page + Global Footer) -->
      <div class="ion-page shell-main-viewport" id="main-content">
        <div class="shell-router-container">
          <ion-router-outlet></ion-router-outlet>
        </div>
        <app-footer></app-footer>
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
