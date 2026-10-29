import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chatboxEllipsesOutline,
  mailOutline,
  globeOutline
} from 'ionicons/icons';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';

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
    IonIcon,
    IonItem,
    IonLabel
  ],
  template: `
    <app-header></app-header>

    <ion-content class="ion-padding reader-transcript-container">
      <div class="about-container" *ngIf="viewModel$ | async as vm">
        <ion-card class="about-card">
          <div class="about-logo-box" *ngIf="vm.logoUrl">
            <img [src]="vm.logoUrl" alt="App Logo" class="about-logo" />
          </div>

          <ion-card-header class="ion-text-center">
            <ion-card-title class="about-title">{{ vm.appName }}</ion-card-title>
          </ion-card-header>

          <ion-card-content>
            <p class="about-description">{{ vm.description }}</p>

            <div class="contact-links" *ngIf="vm.contactEmail || vm.websiteUrl">
              <ion-item lines="none" *ngIf="vm.contactEmail" [href]="'mailto:' + vm.contactEmail">
                <ion-icon slot="start" name="mail-outline" color="primary"></ion-icon>
                <ion-label>{{ vm.contactEmail }}</ion-label>
              </ion-item>

              <ion-item lines="none" *ngIf="vm.websiteUrl" [href]="vm.websiteUrl" target="_blank">
                <ion-icon slot="start" name="globe-outline" color="primary"></ion-icon>
                <ion-label>{{ vm.websiteUrl }}</ion-label>
              </ion-item>
            </div>

            <!-- Language-Mapped Google Form Feedback CTA -->
            <ion-button
              *ngIf="vm.feedbackUrl"
              expand="block"
              color="primary"
              class="ion-margin-top feedback-btn"
              (click)="openFeedbackForm(vm.feedbackUrl)">
              <ion-icon slot="start" name="chatbox-ellipses-outline"></ion-icon>
              {{ vm.feedbackButtonLabel }}
            </ion-button>
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
      padding: 16px 8px;
    }
    .about-logo-box {
      display: flex;
      justify-content: center;
      margin-top: 12px;
    }
    .about-logo {
      width: 84px;
      height: 84px;
      border-radius: 18px;
      object-fit: contain;
    }
    .about-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--ion-color-primary);
    }
    .about-description {
      font-size: var(--app-reader-font-size, 1.05rem);
      line-height: var(--app-reader-line-height, 1.65);
      margin: 12px 0 20px;
      white-space: pre-line;
    }
    .feedback-btn {
      --border-radius: 12px;
      font-weight: 700;
    }
  `]
})
export class AboutPage {
  public viewModel$ = combineLatest([
    this.dataService.config$,
    this.dataService.uiText$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, uiText, lang]) => ({
      logoUrl: cfg.app_identity.logoUrl,
      appName:
        this.dataService.localizeField(cfg.app_identity.appName, lang) ||
        cfg.app_identity.defaultAppName,
      description: this.dataService.localizeField(cfg.about_info?.description, lang),
      contactEmail: cfg.about_info?.contactEmail,
      websiteUrl: cfg.about_info?.websiteUrl,
      feedbackUrl: this.dataService.localizeField(cfg.about_info?.feedback_links, lang),
      feedbackButtonLabel: uiText['feedback_cta'] || 'Submit Feedback'
    }))
  );

  constructor(
    private dataService: DataService,
    private storageService: StorageService
  ) {
    addIcons({ chatboxEllipsesOutline, mailOutline, globeOutline });
  }

  public openFeedbackForm(url: string): void {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
