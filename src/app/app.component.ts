import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { StorageService } from './core/services/storage.service';
import { DataService } from './core/services/data.service';
import { BackButtonService } from './core/services/back-button.service';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet *ngIf="isAppReady"></ion-router-outlet>
    </ion-app>
  `
})
export class AppComponent implements OnInit {
  public isAppReady = false;

  constructor(
    private router: Router,
    private storageService: StorageService,
    private dataService: DataService,
    private backButtonService: BackButtonService,
    private notificationService: NotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    // 1. Register notification tap listener immediately on app boot
    await this.notificationService.initialize();

    // 2. Hydrate local user preferences (language, font size, bookmarks)
    await this.storageService.initialize();

    // 3. Load config and sync daily
    await this.dataService.initialize();

    // 4. Initialize hardware back-button listener
    this.backButtonService.initialize();

    // 5. Route to Onboarding if first launch
    this.isAppReady = true;
    if (!this.storageService.hasCompletedOnboardingSnapshot()) {
      await this.router.navigate(['/onboarding'], { replaceUrl: true });
    }
  }
}