import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  bookOutline,
  arrowForwardOutline
} from 'ionicons/icons';
import { Observable } from 'rxjs';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { Book } from '../../core/models/app-config.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonIcon
  ],
  template: `
    <app-header [showBackButton]="false"></app-header>

    <!-- Sticky Notification Banner (Pinned below header, multi-lingual, no cancel/close button) -->
    <div class="sticky-notification-banner" *ngIf="(updateBanner$ | async) as bannerText">
      <ion-icon name="sparkles-outline" class="banner-icon"></ion-icon>
      <span class="banner-text">{{ bannerText }}</span>
    </div>

    <ion-content class="ion-padding dashboard-content">
      <!-- Direct Watermark Binding (15% opacity behind book cards) -->
      <div
        class="watermark-overlay"
        *ngIf="watermarkUrl$ | async as wmUrl"
        [style.backgroundImage]="'url(' + wmUrl + ')'"
        aria-hidden="true">
      </div>

      <ion-refresher slot="fixed" (ionRefresh)="onPullRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Clean Book Cards (Clicking opens /chapters/:bookId) -->
      <ion-grid fixed class="books-grid">
        <ion-row *ngIf="visibleBooks$ | async as books">
          <ion-col
            size="12"
            sizeMd="6"
            sizeLg="4"
            *ngFor="let book of books; trackBy: trackByBookId">
            <ion-card class="book-card" (click)="openBookChapters(book.id)">
              <div class="book-cover-wrapper">
                <img
                  *ngIf="book.coverImageUrl"
                  [src]="dataService.resolveMediaUrl(book.coverImageUrl)"
                  [alt]="localize(book.title)"
                  class="book-cover-img"
                  (error)="onCoverError($event)" />
                <div class="chapter-count-badge">
                  <ion-icon name="book-outline"></ion-icon>
                  <span>{{ book.chapters.length }} Chapters</span>
                </div>
              </div>

              <ion-card-header>
                <div class="title-row">
                  <ion-card-title class="book-card-title">
                    {{ localize(book.title) }}
                  </ion-card-title>
                  <ion-icon name="arrow-forward-outline" class="action-arrow"></ion-icon>
                </div>
                <ion-card-subtitle *ngIf="book.subtitle" class="book-card-subtitle">
                  {{ localize(book.subtitle) }}
                </ion-card-subtitle>
              </ion-card-header>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
  styles: [`
    .sticky-notification-banner {
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(var(--ion-color-secondary-rgb), 0.22);
      border-bottom: 2px solid var(--ion-color-primary);
      padding: 10px 16px;
      color: var(--ion-text-color, #2c1810);
      font-weight: 600;
      font-size: 0.92rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .banner-icon {
      font-size: 1.25rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
    }
    .banner-text {
      flex: 1;
      line-height: 1.4;
    }
    .dashboard-content {
      position: relative;
    }
    .watermark-overlay {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 280px;
      height: 280px;
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      opacity: 0.15;
      pointer-events: none;
      z-index: 0;
    }
    .books-grid {
      position: relative;
      z-index: 1;
    }
    .book-card {
      border-radius: 16px;
      overflow: hidden;
      margin: 8px 0;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
      transition: transform 0.22s ease, box-shadow 0.22s ease;
      background: var(--ion-card-background, #fff8ec);
      cursor: pointer;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
      }
    }
    .book-cover-wrapper {
      position: relative;
      height: 190px;
      background: rgba(var(--ion-color-primary-rgb), 0.08);
      overflow: hidden;
    }
    .book-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .chapter-count-badge {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.72);
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .book-card-title {
      font-size: 1.15rem;
      font-weight: 700;
      flex: 1;
    }
    .action-arrow {
      font-size: 1.2rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
    }
    .book-card-subtitle {
      margin-top: 4px;
      font-size: 0.86rem;
    }
  `]
})
export class DashboardPage implements OnInit {
  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);

  public visibleBooks$: Observable<Book[]> = this.dataService.visibleBooks$;
  public updateBanner$: Observable<string | null> = this.dataService.updateBanner$;
  public watermarkUrl$: Observable<string> = this.dataService.watermarkUrl$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  private currentLang = 'hi';

  constructor() {
    addIcons({
      sparklesOutline,
      bookOutline,
      arrowForwardOutline
    });
  }

  ngOnInit(): void {
    this.storageService.selectedLanguage$.subscribe(lang => {
      this.currentLang = lang;
    });
  }

  public async onPullRefresh(event: CustomEvent): Promise<void> {
    await this.dataService.syncWithRemote();
    (event.target as HTMLIonRefresherElement).complete();
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public openBookChapters(bookId: string): void {
    this.router.navigate(['/chapters', bookId]);
  }

  public onCoverError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  public trackByBookId(_index: number, book: Book): string {
    return book.id;
  }
}