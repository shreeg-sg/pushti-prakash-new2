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

    <!-- Sticky Notification Banner (Max 25vh height, hides on scroll down when books are present) -->
    <div
      class="sticky-notification-banner"
      *ngIf="(updateBanner$ | async) as bannerText"
      [class.banner-hidden]="isBannerHidden">
      <ion-icon name="sparkles-outline" class="banner-icon"></ion-icon>
      <span class="banner-text" [innerHTML]="bannerText"></span>
    </div>

    <ion-content
      [scrollEvents]="true"
      (ionScroll)="onDashboardScroll($event)"
      class="ion-padding dashboard-content">
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
      align-items: flex-start;
      gap: 10px;
      background: rgba(var(--ion-color-secondary-rgb), 0.22);
      border-bottom: 2px solid var(--ion-color-primary);
      padding: 10px 16px;
      color: var(--ion-text-color, #2c1810);
      font-weight: 500;
      font-size: 0.92rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

      /* Requirement: Never exceed 25% of viewport height */
      max-height: 25vh;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;

      /* Smooth transition when hiding on scroll */
      transition: transform 0.28s ease, opacity 0.28s ease, max-height 0.28s ease, padding 0.28s ease;
      transform: translateY(0);
      opacity: 1;
    }

    /* Hidden state triggered on scroll down */
    .sticky-notification-banner.banner-hidden {
      transform: translateY(-100%);
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
      opacity: 0;
      pointer-events: none;
      border-bottom-width: 0;
    }

    .banner-icon {
      font-size: 1.3rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .banner-text {
      flex: 1;
      line-height: 1.45;
      white-space: pre-line;
    }

    .banner-text b, .banner-text strong {
      font-weight: 700;
    }

    .banner-text i, .banner-text em {
      font-style: italic;
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

  public isBannerHidden = false;
  private lastScrollTop = 0;
  private hasBooks = false;
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

    // Track if books are present
    this.visibleBooks$.subscribe(books => {
      this.hasBooks = !!(books && books.length > 0);
      if (!this.hasBooks) {
        this.isBannerHidden = false;
      }
    });
  }

  public onDashboardScroll(event: CustomEvent): void {
    // Only auto-hide if books are available to scroll through
    if (!this.hasBooks) {
      this.isBannerHidden = false;
      return;
    }

    const currentScrollTop = event.detail.scrollTop;

    // At the top of the page, always show banner
    if (currentScrollTop <= 15) {
      this.isBannerHidden = false;
    } else if (currentScrollTop > this.lastScrollTop + 10 && currentScrollTop > 40) {
      // Scrolling DOWN: hide banner
      this.isBannerHidden = true;
    } else if (currentScrollTop < this.lastScrollTop - 10) {
      // Scrolling UP: reveal banner
      this.isBannerHidden = false;
    }

    this.lastScrollTop = currentScrollTop;
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