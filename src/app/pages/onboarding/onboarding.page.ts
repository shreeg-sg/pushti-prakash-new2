import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonButton,
  IonIcon,
  IonSpinner,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, arrowForwardOutline, globeOutline } from 'ionicons/icons';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { AppIdentity, SupportedLanguage } from '../../core/models/app-config.model';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonSpinner
  ],
  template: `
  <ion-content class="ion-padding onboarding-bg">
    <div class="onboarding-wrapper">
      <!-- 1. Loading State while Remote Config Resolves on Mobile -->
      <div class="onboarding-loading-box" *ngIf="isLoadingConfig && !(identity$ | async)">
        <ion-spinner name="crescent" color="primary" class="loading-spinner"></ion-spinner>
        <p class="loading-text">Loading preferences...</p>
      </div>

      <!-- 2. Interactive Language Selection Card -->
      <ion-card class="onboarding-card">
        <!-- Logo Display -->
        <div class="logo-stage" *ngIf="logoUrl">
          <img [src]="dataService.resolveMediaUrl(logoUrl)" alt="App Logo" class="welcome-logo" />
        </div>

        <!-- Welcome Header -->
        <ion-card-header class="welcome-header">
          <ion-card-title class="welcome-heading">
            {{ appName }}
          </ion-card-title>
          <ion-card-subtitle class="welcome-subtitle">
            <ion-icon name="globe-outline"></ion-icon>
            <span>Please select your preferred language / कृपया अपनी भाषा चुनें</span>
          </ion-card-subtitle>
        </ion-card-header>

        <ion-card-content>
          <!-- Language List -->
          <div class="language-column">
            <button
              type="button"
              *ngFor="let lang of availableLanguages"
              class="lang-option-btn"
              [class.selected]="selectedLang === lang.code"
              (click)="onSelectLanguage(lang.code)">
              <span class="lang-native-name">{{ lang.name }}</span>
              <ion-icon
                *ngIf="selectedLang === lang.code"
                name="checkmark-circle"
                class="check-icon">
              </ion-icon>
            </button>
          </div>

          <!-- Submit & Continue Button -->
          <ion-button
            expand="block"
            size="large"
            color="primary"
            class="continue-btn ion-margin-top"
            [disabled]="!selectedLang || isSubmitting"
            (click)="onContinue()">
            <ion-spinner name="dots" *ngIf="isSubmitting"></ion-spinner>
            <span *ngIf="!isSubmitting">Continue / आगे बढ़ें</span>
            <ion-icon slot="end" name="arrow-forward-outline" *ngIf="!isSubmitting"></ion-icon>
          </ion-button>
        </ion-card-content>
      </ion-card>
    </div>
  </ion-content>
  `,
  styles: [`
    :host {
      --ion-color-primary: #8B2635;
      --ion-color-primary-rgb: 139, 38, 53;
      --ion-color-secondary: #D4AF37;
      --ion-background-color: #FFFDF9;
      --ion-card-background: #FFF8EC;
    }
    .onboarding-bg {
      --background: var(--ion-background-color, #FFFDF9);
    }
    .onboarding-wrapper {
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .onboarding-loading-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--ion-color-medium);
    }
    .loading-spinner {
      width: 42px;
      height: 42px;
    }
    .loading-text {
      font-size: 0.95rem;
      font-weight: 500;
    }
    .onboarding-card {
      width: 100%;
      max-width: 440px;
      border-radius: 20px;
      padding: 16px 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
      background: var(--ion-card-background, #FFF8EC);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.15);
      text-align: center;
    }
    .logo-stage {
      display: flex;
      justify-content: center;
      margin-top: 12px;
    }
    .welcome-logo {
      width: 96px;
      height: 96px;
      border-radius: 20px;
      object-fit: contain;
      background: #ffffff;
      padding: 8px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
    }
    .welcome-header {
      text-align: center !important;
      padding-bottom: 8px;
    }
    .welcome-heading {
      font-size: 1.35rem;
      font-weight: 700;
      margin-top: 8px;
      color: var(--ion-color-primary);
      text-align: center !important;
    }
    .welcome-subtitle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 8px;
      font-size: 0.95rem;
      text-align: center !important;
      color: var(--ion-color-medium);
    }
    .language-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin: 20px auto;
      max-width: 320px;
      width: 100%;
    }
    .lang-option-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      padding: 14px 20px;
      border-radius: 12px;
      border: 2px solid rgba(var(--ion-color-primary-rgb), 0.2);
      background: #ffffff;
      color: var(--ion-text-color, #2C1810);
      font-size: 1.05rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .lang-option-btn.selected {
      border-color: var(--ion-color-primary);
      background: rgba(var(--ion-color-primary-rgb), 0.1);
      color: var(--ion-color-primary);
      font-weight: 700;
    }
    .check-icon {
      position: absolute;
      right: 16px;
      font-size: 1.35rem;
      color: var(--ion-color-primary);
    }
    .continue-btn {
      max-width: 320px;
      margin: 16px auto 0;
      --border-radius: 12px;
      font-weight: 700;
      height: 48px;
    }
  `]
})
export class OnboardingPage implements OnInit {
  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);
  private toastController = inject(ToastController);

  public identity$: Observable<AppIdentity> = this.dataService.identity$.pipe(
    catchError(() => of({
      defaultAppName: 'PushtiPrakash',
      appName: { hi: 'पुष्टिप्रकाश', en: 'PushtiPrakash' },
      logoUrl: 'images/logo.png',
      watermarkUrl: 'images/logo.png',
      theme: { primary: '#8B2635', secondary: '#D4AF37', tertiary: '#2E5A44', background: '#FFFDF9' }
    } as AppIdentity))
  );

  public selectedLang = 'hi';
  public isLoadingConfig = true;
  public isSubmitting = false;

  public appName = 'PushtiPrakash';
  public logoUrl: string | null = null;

  public availableLanguages: SupportedLanguage[] = [
    { code: 'hi', name: 'हिन्दी', ttsLocale: 'hi-IN', isEnabled: true },
    { code: 'gu', name: 'ગુજરાતી', ttsLocale: 'gu-IN', isEnabled: true },
    { code: 'en', name: 'English', ttsLocale: 'en-IN', isEnabled: true }
  ];

  constructor() {
    addIcons({ checkmarkCircle, arrowForwardOutline, globeOutline });
  }

  ngOnInit(): void {
    try {
      const savedLang = this.storageService.getCurrentLanguageSnapshot();
      if (savedLang) {
        this.selectedLang = savedLang;
      }
    } catch (e) {
      console.warn('Could not read saved language snapshot:', e);
    }

    this.identity$.subscribe({
      next: (identity) => {
        if (identity) {
          if (identity.appName) {
            this.appName = typeof identity.appName === 'string' 
              ? identity.appName 
              : (identity.appName['hi'] || identity.appName['en'] || identity.defaultAppName || 'PushtiPrakash');
          } else if (identity.defaultAppName) {
            this.appName = identity.defaultAppName;
          }
          if (identity.logoUrl) {
            this.logoUrl = identity.logoUrl;
          }
          // Correctly accessing theme properties from identity.theme
          if (identity.theme?.primary) {
            document.documentElement.style.setProperty('--ion-color-primary', identity.theme.primary);
          }
          if (identity.theme?.secondary) {
            document.documentElement.style.setProperty('--ion-color-secondary', identity.theme.secondary);
          }
        }
        this.isLoadingConfig = false;
      },
      error: () => {
        this.isLoadingConfig = false;
      }
    });

    this.dataService.enabledLanguages$.subscribe({
      next: (langs) => {
        if (langs && langs.length > 0) {
          this.availableLanguages = langs;
          if (!langs.some(l => l.code === this.selectedLang)) {
            this.selectedLang = langs[0].code;
          }
        }
      },
      error: () => {}
    });

    setTimeout(() => {
      this.isLoadingConfig = false;
    }, 1500);
  }

  public onSelectLanguage(code: string): void {
    this.selectedLang = code;
  }

  public async onContinue(): Promise<void> {
    if (!this.selectedLang || this.isSubmitting) return;

    this.isSubmitting = true;
    try {
      await this.storageService.completeOnboarding(this.selectedLang);
      await this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (err) {
      console.error('Error completing onboarding on mobile:', err);
      const toast = await this.toastController.create({
        message: 'Failed to save preferences. Please try again.',
        duration: 2500,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    } finally {
      this.isSubmitting = false;
    }
  }
}