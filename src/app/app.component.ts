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
    // 1. Hydrate local preferences in 0ms (synchronous from memory/storage)
    await this.storageService.initialize();

    // 2. Register native listeners
    this.backButtonService.initialize();
    await this.notificationService.initialize();

    // 3. Mount router-outlet immediately so cold boot has 0ms visual latency
    this.isAppReady = true;

    // 4. Check onboarding status from disk cache
    if (!this.storageService.hasCompletedOnboardingSnapshot()) {
      await this.router.navigate(['/onboarding'], { replaceUrl: true });
    }

    // 5. Asynchronously trigger daily remote sync without blocking UI startup
    this.dataService.initialize().catch(err => {
      console.warn('[AppComponent] Background remote sync deferred:', err);
    });
  }
}