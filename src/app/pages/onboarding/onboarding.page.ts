import { Component, OnInit } from '@angular/core';
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
  IonChip,
  IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, arrowForwardOutline, globeOutline } from 'ionicons/icons';
import { Observable } from 'rxjs';

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
    IonChip,
    IonLabel
  ],
  template: `
    <ion-content class="ion-padding onboarding-bg">
      <div class="onboarding-wrapper" *ngIf="identity$ | async as identity">
        <!-- Client Brand Card & Welcome Message -->
        <ion-card class="onboarding-card">
          <div class="logo-stage" *ngIf="identity.logoUrl">
            <img [src]="identity.logoUrl" alt="App Logo" class="welcome-logo" />
          </div>

          <ion-card-header class="ion-text-center">
            <ion-card-title class="welcome-heading">
              {{ (uiText$ | async)?.['welcome_title'] || localize(identity.appName) || identity.defaultAppName }}
            </ion-card-title>
            <ion-card-subtitle class="welcome-subtitle">
              <ion-icon name="globe-outline"></ion-icon>
              {{ (uiText$ | async)?.['select_language_prompt'] || 'Please select your preferred language' }}
            </ion-card-subtitle>
          </ion-card-header>

          <ion-card-content>
            <!-- Language Selection Grid -->
            <div class="language-grid" *ngIf="enabledLanguages$ | async as languages">
              <button
                type="button"
                *ngFor="let lang of languages"
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

            <!-- Continue to Dashboard CTA -->
            <ion-button
              expand="block"
              size="large"
              color="primary"
              class="continue-btn ion-margin-top"
              [disabled]="!selectedLang"
              (click)="onContinue()">
              {{ (uiText$ | async)?.['continue_button'] || 'Continue' }}
              <ion-icon slot="end" name="arrow-forward-outline"></ion-icon>
            </ion-button>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  `,
  styles: [`
    .onboarding-wrapper {
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .onboarding-card {
      width: 100%;
      max-width: 440px;
      border-radius: 20px;
      padding: 16px 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
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
    .welcome-heading {
      font-size: 1.4rem;
      font-weight: 700;
      margin-top: 8px;
      color: var(--ion-color-primary);
    }
    .welcome-subtitle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 8px;
      font-size: 0.95rem;
    }
    .language-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
      gap: 12px;
      margin: 20px 0;
    }
    .lang-option-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-radius: 12px;
      border: 2px solid rgba(var(--ion-color-primary-rgb), 0.2);
      background: var(--ion-background-color, #ffffff);
      color: var(--ion-text-color, #2c1810);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .lang-option-btn.selected {
      border-color: var(--ion-color-primary);
      background: rgba(var(--ion-color-primary-rgb), 0.1);
      color: var(--ion-color-primary);
    }
    .check-icon {
      font-size: 1.25rem;
      color: var(--ion-color-primary);
    }
    .continue-btn {
      --border-radius: 12px;
      font-weight: 700;
    }
  `]
})
export class OnboardingPage implements OnInit {
  public identity$: Observable<AppIdentity> = this.dataService.identity$;
  public enabledLanguages$: Observable<SupportedLanguage[]> = this.dataService.enabledLanguages$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  public selectedLang = 'hi';

  constructor(
    private router: Router,
    private dataService: DataService,
    private storageService: StorageService
  ) {
    addIcons({ checkmarkCircle, arrowForwardOutline, globeOutline });
  }

  ngOnInit(): void {
    this.selectedLang = this.storageService.getCurrentLanguageSnapshot() || 'hi';
  }

  public async onSelectLanguage(langCode: string): Promise<void> {
    this.selectedLang = langCode;
    // Preview UI strings immediately in the chosen language
    await this.storageService.setLanguage(langCode);
  }

  public async onContinue(): Promise<void> {
    await this.storageService.completeOnboarding(this.selectedLang);
    await this.router.navigate(['/dashboard'], { replaceUrl: true });
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.selectedLang);
  }
}
