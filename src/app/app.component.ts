import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { StorageService } from './core/services/storage.service';
import { AuthService } from './core/services/auth.service';
import { DataService } from './core/services/data.service';
import { BackButtonService } from './core/services/back-button.service';
import { NotificationService } from './core/services/notification.service';
import { SplashOverlayComponent } from './layout/splash-overlay.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet, SplashOverlayComponent],
  template: `
    <ion-app>
      <app-splash-overlay
        *ngIf="showSplash"
        [fadingOut]="splashFading"
        [isSlowNetwork]="isSlowNetwork">
      </app-splash-overlay>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `
})
export class AppComponent implements OnInit {
  private readonly MIN_SPLASH_MS = 3000;
  private readonly MAX_SPLASH_MS = 15000;

  public showSplash = true;
  public splashFading = false;
  public isSlowNetwork = false;
  private splashDismissed = false;

  constructor(
    private router: Router,
    private storageService: StorageService,
    private authService: AuthService,
    private dataService: DataService,
    private backButtonService: BackButtonService,
    private notificationService: NotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    // Hard 15-second cap so splash always closes even on network hangs or errors
    const maxTimer = setTimeout(() => {
      this.dismissSplash();
    }, this.MAX_SPLASH_MS);

    // Switch progress bar to smooth indeterminate shimmer if startup runs past 3s
    const slowTimer = setTimeout(() => {
      if (!this.splashDismissed) {
        this.isSlowNetwork = true;
      }
    }, this.MIN_SPLASH_MS);

    const minDelay = new Promise<void>(resolve => setTimeout(resolve, this.MIN_SPLASH_MS));

    try {
      // 1. Hydrate local preferences & auth session
      await Promise.all([
        this.storageService.initialize(),
        this.authService.initialize()
      ]);

      // 2. Register native listeners non-blockingly
      this.backButtonService.initialize();
      this.notificationService.initialize().catch(err => {
        console.warn('[AppComponent] Notification init deferred:', err);
      });

      // 3. Enforce Language -> Login -> Dashboard flow from disk cache
      if (!this.storageService.hasCompletedOnboardingSnapshot()) {
        await this.router.navigate(['/onboarding'], { replaceUrl: true });
      } else if (this.authService.isLoginRequired() && !this.authService.isLoggedInSnapshot()) {
        await this.router.navigate(['/login'], { replaceUrl: true });
      }

      // 4. Run daily remote sync + active-user ping, bounded by the 15s splash cap
      const syncPromise = this.dataService.initialize()
        .then(async () => {
          if (
            this.storageService.hasCompletedOnboardingSnapshot() &&
            this.authService.isLoginRequired() &&
            !this.authService.isLoggedInSnapshot()
          ) {
            await this.router.navigate(['/login'], { replaceUrl: true });
            return;
          }
          await this.authService.syncSessionOnStartup();
        })
        .catch(err => {
          console.warn('[AppComponent] Background remote sync deferred:', err);
        });

      await Promise.all([
        minDelay,
        Promise.race([
          syncPromise,
          new Promise<void>(resolve => setTimeout(resolve, this.MAX_SPLASH_MS - 450))
        ])
      ]);
    } catch (err) {
      console.warn('[AppComponent] Startup error, continuing:', err);
      await minDelay;
    } finally {
      clearTimeout(maxTimer);
      clearTimeout(slowTimer);
      this.dismissSplash();
    }
  }

  private dismissSplash(): void {
    if (this.splashDismissed) return;
    this.splashDismissed = true;
    this.splashFading = true;
    setTimeout(() => {
      this.showSplash = false;
    }, 450);
  }
}
