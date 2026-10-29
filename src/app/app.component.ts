import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { StorageService } from './core/services/storage.service';
import { DataService } from './core/services/data.service';
import { BackButtonService } from './core/services/back-button.service';

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
    private backButtonService: BackButtonService
  ) {}

  async ngOnInit(): Promise<void> {
    // 1. Hydrate local user preferences (language, font scale, bookmarks, onboarding flag)
    await this.storageService.initialize();

    // 2. Load cached Firebase JSON & start network-first hot-update + resume listener
    await this.dataService.initialize();

    // 3. Initialize hardware back-button listener (double-tap root exit, single-tap back)
    this.backButtonService.initialize();

    // 4. Route to Onboarding if first launch
    this.isAppReady = true;
    if (!this.storageService.hasCompletedOnboardingSnapshot()) {
      await this.router.navigate(['/onboarding'], { replaceUrl: true });
    }
  }
}
