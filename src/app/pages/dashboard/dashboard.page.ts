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
    IonIcon
  ],
  template: `
    <app-header [showBackButton]="false"></app-header>

    <!-- Sticky Notification Banner (Max 25vh, hides on scroll down) -->
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
      <!-- Direct Watermark Binding (15% opacity behind book grid) -->
      <div
        class="watermark-overlay"
        *ngIf="watermarkUrl$ | async as wmUrl"
        [style.backgroundImage]="'url(' + wmUrl + ')'"
        aria-hidden="true">
      </div>

      <ion-refresher slot="fixed" (ionRefresh)="onPullRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Book Cards (Max 15% Viewport Height with Cover Photo Watermark) -->
      <ion-grid fixed class="books-grid">
        <ion-row *ngIf="visibleBooks$ | async as books">
          <ion-col
            size="12"
            sizeMd="6"
            sizeLg="4"
            *ngFor="let book of books; trackBy: trackByBookId">
            <div
              class="book-card"
              [style.--book-watermark]="'url(' + getCoverWatermarkUrl(book) + ')'"
              (click)="openBookChapters(book.id)">
              <!-- Dynamic Cover Photo Watermark Background -->
              <div class="book-watermark-overlay" aria-hidden="true"></div>

              <!-- Card Content Floating on Top of Watermark -->
              <div class="book-card-content">
                <div class="title-row">
                  <h2 class="book-card-title">{{ localize(book.title) }}</h2>
                  <ion-icon name="arrow-forward-outline" class="action-arrow"></ion-icon>
                </div>
                <p *ngIf="book.subtitle" class="book-card-subtitle">{{ localize(book.subtitle) }}</p>

                <div class="chapter-count-badge">
                  <ion-icon name="book-outline"></ion-icon>
                  <span>{{ book.chapters.length }} Chapters</span>
                </div>
              </div>
            </div>
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

      max-height: 25vh;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;

      transition: transform 0.28s ease, opacity 0.28s ease, max-height 0.28s ease, padding 0.28s ease;
      transform: translateY(0);
      opacity: 1;
    }

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

    /* Requirement: 15% Viewport Height Max with Cover Photo Watermark */
    .book-card {
      position: relative;
      border-radius: 18px;
      overflow: hidden;
      margin: 8px 0;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
      transition: transform 0.22s ease, box-shadow 0.22s ease;
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
      cursor: pointer;

      /* 15% Viewport Height Max */
      height: 15vh;
      max-height: 15vh;
      min-height: 105px;
      display: flex;
      align-items: center;

      &:hover {
        transform: translateY(-3px);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
      }
    }

    /* Cover Photo Watermark Overlay */
    .book-watermark-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: var(--book-watermark, none);
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
      opacity: 0.15; /* Watermark visibility */
      pointer-events: none;
      z-index: 0;
    }

    .book-card-content {
      position: relative;
      z-index: 1;
      width: 100%;
      padding: 10px 18px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .book-card-title {
      font-size: 1.22rem;
      font-weight: 800;
      color: var(--ion-color-primary);
      margin: 0;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .action-arrow {
      font-size: 1.25rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
    }

    .book-card-subtitle {
      margin: 3px 0 8px 0;
      font-size: 0.85rem;
      color: var(--ion-color-medium);
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 90%;
    }

    .chapter-count-badge {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(var(--ion-color-primary-rgb), 0.12);
      color: var(--ion-color-primary);
      padding: 3px 10px;
      border-radius: 16px;
      font-size: 0.78rem;
      font-weight: 700;
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

    this.visibleBooks$.subscribe(books => {
      this.hasBooks = !!(books && books.length > 0);
      if (!this.hasBooks) {
        this.isBannerHidden = false;
      }
    });
  }

  public getCoverWatermarkUrl(book: Book): string {
    return this.dataService.resolveMediaUrl(book.coverImageUrl);
  }

  public onDashboardScroll(event: CustomEvent): void {
    if (!this.hasBooks) {
      this.isBannerHidden = false;
      return;
    }

    const currentScrollTop = event.detail.scrollTop;

    if (currentScrollTop <= 15) {
      this.isBannerHidden = false;
    } else if (currentScrollTop > this.lastScrollTop + 10 && currentScrollTop > 40) {
      this.isBannerHidden = true;
    } else if (currentScrollTop < this.lastScrollTop - 10) {
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

  public trackByBookId(_index: number, book: Book): string {
    return book.id;
  }
}