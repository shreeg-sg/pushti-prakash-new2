import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatboxEllipsesOutline, mailOutline, globeOutline } from 'ionicons/icons';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { SecurityUtil } from '../../core/utils/security.util';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonIcon
  ],
  template: `
    <app-header></app-header>

    <ion-content class="ion-padding about-page-content">
      <div class="about-container" *ngIf="viewModel$ | async as vm">
        <ion-card class="about-card">
          <div class="about-logo-box" *ngIf="vm.logoUrl">
            <img [src]="vm.logoUrl" alt="App Logo" class="about-logo" />
          </div>

          <ion-card-header class="ion-text-center">
            <ion-card-title class="about-title">{{ vm.appName }}</ion-card-title>
          </ion-card-header>

          <ion-card-content class="about-content">
            <p class="about-description">{{ vm.description }}</p>

            <!-- Centered Contact Links -->
            <div class="contact-links" *ngIf="vm.safeMailtoHref || vm.safeWebsiteUrl">
              <a *ngIf="vm.safeMailtoHref" [href]="vm.safeMailtoHref" class="contact-pill-link">
                <ion-icon name="mail-outline"></ion-icon>
                <span>{{ vm.contactEmail }}</span>
              </a>

              <a *ngIf="vm.safeWebsiteUrl" [href]="vm.safeWebsiteUrl" target="_blank" rel="noopener noreferrer" class="contact-pill-link">
                <ion-icon name="globe-outline"></ion-icon>
                <span>{{ vm.safeWebsiteUrl }}</span>
              </a>
            </div>

            <!-- Centered Feedback CTA -->
            <div class="feedback-cta-wrapper" *ngIf="vm.safeFeedbackUrl">
              <ion-button
                expand="block"
                color="primary"
                class="feedback-btn"
                (click)="openFeedbackForm(vm.safeFeedbackUrl)">
                <ion-icon slot="start" name="chatbox-ellipses-outline"></ion-icon>
                {{ vm.feedbackButtonLabel }}
              </ion-button>
            </div>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  `,
  styles: [`
    .about-container {
      max-width: 680px;
      margin: 0 auto;
    }
    .about-card {
      border-radius: 18px;
      padding: 20px 12px;
      text-align: center;
    }
    .about-logo-box {
      display: flex;
      justify-content: center;
      margin-top: 10px;
    }
    .about-logo {
      width: 88px;
      height: 88px;
      border-radius: 20px;
      object-fit: contain;
    }
    .about-title {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--ion-color-primary);
      text-align: center !important;
    }
    .about-description {
      text-align: center !important;
      font-size: 1rem;
      line-height: 1.6;
      margin: 12px auto 20px;
      white-space: pre-line;
      max-width: 560px;
    }
    .contact-links {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin: 18px auto;
    }
    .contact-pill-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 20px;
      background: rgba(var(--ion-color-primary-rgb), 0.08);
      color: var(--ion-color-primary);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      transition: background 0.2s ease;
    }
    .feedback-cta-wrapper {
      display: flex;
      justify-content: center;
      margin-top: 24px;
    }
    .feedback-btn {
      max-width: 320px;
      width: 100%;
      --border-radius: 12px;
      font-weight: 700;
    }
  `]
})
export class AboutPage {
  private dataService = inject(DataService);
  private storageService = inject(StorageService);

  public viewModel$ = combineLatest([
    this.dataService.config$,
    this.dataService.uiText$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, uiText, lang]) => {
      const rawEmail = (cfg.about_info?.contactEmail || '').trim();
      const safeMailtoHref = rawEmail
        ? SecurityUtil.sanitizeExternalUrl(`mailto:${rawEmail}`, true)
        : '';
      const safeWebsiteUrl = SecurityUtil.sanitizeExternalUrl(cfg.about_info?.websiteUrl);
      const rawFeedback = this.dataService.localizeField(cfg.about_info?.feedback_links, lang);
      const safeFeedbackUrl = SecurityUtil.sanitizeExternalUrl(rawFeedback);

      return {
        logoUrl: this.dataService.resolveMediaUrl(cfg.app_identity.logoUrl),
        appName:
          this.dataService.localizeField(cfg.app_identity.appName, lang) ||
          cfg.app_identity.defaultAppName,
        description: this.dataService.localizeField(cfg.about_info?.description, lang),
        contactEmail: rawEmail,
        safeMailtoHref,
        safeWebsiteUrl,
        safeFeedbackUrl,
        feedbackButtonLabel: uiText['feedback_cta'] || 'Submit Feedback'
      };
    })
  );

  constructor() {
    addIcons({ chatboxEllipsesOutline, mailOutline, globeOutline });
  }

  public openFeedbackForm(url: string): void {
    const safeUrl = SecurityUtil.sanitizeExternalUrl(url);
    if (!safeUrl) return;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }
}