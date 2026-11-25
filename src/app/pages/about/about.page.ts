import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatboxEllipsesOutline, mailOutline, globeOutline, sparklesOutline } from 'ionicons/icons';
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
    IonCardContent,
    IonButton,
    IonIcon
  ],
  template: `
    <app-header></app-header>

    <ion-content class="ion-padding about-page-content">
      <div class="about-container" *ngIf="viewModel$ | async as vm">
        <ion-card class="about-card">
          <!-- Tinted Hero Header Band -->
          <div class="about-hero-band">
            <div class="about-logo-frame" *ngIf="vm.logoUrl">
              <img [src]="vm.logoUrl" alt="App Logo" class="about-logo" />
            </div>
            <h1 class="about-title">{{ vm.appName }}</h1>
            <div class="about-accent-divider">
              <span class="divider-line"></span>
              <ion-icon name="sparkles-outline" class="divider-icon"></ion-icon>
              <span class="divider-line"></span>
            </div>
          </div>

          <ion-card-content class="about-content">
            <!-- Compact Styled Description Box -->
            <div class="about-description-box" *ngIf="vm.description">
              <p class="about-description">{{ vm.description }}</p>
            </div>

            <!-- Compact Contact Pill Links -->
            <div class="contact-links" *ngIf="vm.safeMailtoHref || vm.safeWebsiteUrl">
              <a *ngIf="vm.safeMailtoHref" [href]="vm.safeMailtoHref" class="contact-pill-link">
                <span class="contact-icon-badge">
                  <ion-icon name="mail-outline"></ion-icon>
                </span>
                <span class="contact-pill-text">{{ vm.contactEmail }}</span>
              </a>

              <a *ngIf="vm.safeWebsiteUrl" [href]="vm.safeWebsiteUrl" target="_blank" rel="noopener noreferrer" class="contact-pill-link">
                <span class="contact-icon-badge">
                  <ion-icon name="globe-outline"></ion-icon>
                </span>
                <span class="contact-pill-text">{{ vm.safeWebsiteUrl }}</span>
              </a>
            </div>

            <!-- Feedback CTA -->
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
    .about-page-content {
      --background: var(--ion-background-color, #fffdf9);
    }

    .about-container {
      max-width: 620px;
      margin: 6px auto 16px;
    }

    .about-card {
      border-radius: 20px;
      overflow: hidden;
      padding: 0;
      margin: 0;
      text-align: center;
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.16);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    }

    .about-hero-band {
      background: linear-gradient(
        180deg,
        rgba(var(--ion-color-primary-rgb), 0.12) 0%,
        rgba(var(--ion-color-primary-rgb), 0.03) 100%
      );
      padding: 22px 16px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .about-logo-frame {
      width: 76px;
      height: 76px;
      border-radius: 18px;
      background: #ffffff;
      padding: 6px;
      box-shadow: 0 6px 16px rgba(var(--ion-color-primary-rgb), 0.16);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.14);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 10px;
    }

    .about-logo {
      width: 100%;
      height: 100%;
      border-radius: 12px;
      object-fit: contain;
    }

    .about-title {
      font-size: 1.18rem;
      font-weight: 800;
      letter-spacing: 0.2px;
      color: var(--ion-color-primary);
      margin: 0;
      text-align: center;
    }

    .about-accent-divider {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 130px;
      margin-top: 8px;
    }

    .divider-line {
      flex: 1;
      height: 1px;
      background: rgba(var(--ion-color-primary-rgb), 0.28);
    }

    .divider-icon {
      font-size: 0.85rem;
      color: var(--ion-color-secondary, var(--ion-color-primary));
    }

    .about-content {
      padding: 14px 16px 20px;
    }

    .about-description-box {
      background: rgba(var(--ion-color-primary-rgb), 0.04);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.1);
      border-radius: 14px;
      padding: 12px 14px;
      margin: 0 auto 16px;
      max-width: 520px;
    }

    .about-description {
      text-align: center;
      font-size: 0.85rem;
      line-height: 1.58;
      color: var(--ion-text-color, #2c1810);
      opacity: 0.92;
      margin: 0;
      white-space: pre-line;
    }

    .contact-links {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin: 0 auto 16px;
    }

    .contact-pill-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 7px 14px 7px 8px;
      border-radius: 22px;
      background: rgba(var(--ion-color-primary-rgb), 0.07);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.14);
      color: var(--ion-color-primary);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.82rem;
      max-width: 100%;
      transition: background 0.2s ease, transform 0.15s ease;

      &:active {
        transform: scale(0.98);
        background: rgba(var(--ion-color-primary-rgb), 0.14);
      }
    }

    .contact-icon-badge {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast, #ffffff);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.82rem;
      flex-shrink: 0;
    }

    .contact-pill-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .feedback-cta-wrapper {
      display: flex;
      justify-content: center;
      margin-top: 8px;
    }

    .feedback-btn {
      max-width: 290px;
      width: 100%;
      height: 42px;
      --border-radius: 12px;
      font-weight: 700;
      font-size: 0.86rem;
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
    addIcons({ chatboxEllipsesOutline, mailOutline, globeOutline, sparklesOutline });
  }

  public openFeedbackForm(url: string): void {
    const safeUrl = SecurityUtil.sanitizeExternalUrl(url);
    if (!safeUrl) return;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }
}