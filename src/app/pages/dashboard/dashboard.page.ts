import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonFooter,
  IonRefresher,
  IonRefresherContent,
  IonGrid,
  IonRow,
  IonCol,
  IonIcon,
  IonButton,
  IonSpinner,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  megaphoneOutline,
  bookOutline,
  arrowForwardOutline,
  chevronBackOutline,
  chevronForwardOutline,
  searchOutline,
  cloudOfflineOutline,
  refreshOutline
} from 'ionicons/icons';
import { Observable, Subscription, BehaviorSubject, combineLatest, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../../layout/header.component';
import { DataService, ActiveBannerView } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { SecurityUtil } from '../../core/utils/security.util';
import { Book, AdvertisementItem } from '../../core/models/app-config.model';

interface AdSlideView {
  ad: AdvertisementItem;
  src: string;
  triedFallback: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    IonContent,
    IonFooter,
    IonRefresher,
    IonRefresherContent,
    IonGrid,
    IonRow,
    IonCol,
    IonIcon,
    IonButton,
    IonSpinner
  ],
  template: `
    <app-header
      [showBackButton]="false"
      [showSearch]="true"
      [searchPlaceholder]="getSearchPlaceholder()"
      (searchChange)="onSearchQueryChange($event)">
    </app-header>

    <ion-content class="ion-padding dashboard-content">
      <div
        class="watermark-overlay"
        *ngIf="watermarkUrl$ | async as wmUrl"
        [style.backgroundImage]="'url(' + wmUrl + ')'"
        aria-hidden="true">
      </div>

      <ion-refresher slot="fixed" (ionRefresh)="onPullRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Single Consolidated Announcement Banner (Scrolls with Dashboard) -->
      <ng-container *ngIf="(activeBanners$ | async) as banners">
        <div class="announcement-banner-card" *ngIf="banners.length > 0">
          <div class="announcement-header">
            <ion-icon name="megaphone-outline" class="announcement-header-icon"></ion-icon>
            <span class="announcement-heading-text">
              {{ (uiText$ | async)?.['announcement_heading'] || 'Announcement' }}
            </span>
          </div>

          <div class="announcement-list">
            <div
              class="announcement-row"
              *ngFor="let banner of banners; let last = last; trackBy: trackByBannerId"
              [class.announcement-row-divider]="!last">
              <span class="banner-new-badge" *ngIf="banner.isNew">NEW</span>
              <span class="announcement-message-inline">
                <span class="banner-text" [innerHTML]="banner.messageHtml"></span>
                <button
                  type="button"
                  class="inline-read-now-btn"
                  *ngIf="banner.targetBookId"
                  (click)="onBannerClick(banner)">
                  {{ banner.actionLabel || (uiText$ | async)?.['read_now'] || 'Read Now' }}
                  <ion-icon name="arrow-forward-outline"></ion-icon>
                </button>
              </span>
            </div>
          </div>
        </div>
      </ng-container>

      <!-- Library Grid -->
      <ion-grid fixed class="books-grid">
        <ion-row *ngIf="filteredBooks$ | async as books">
          <!-- Normal State: Book Cards -->
          <ng-container *ngIf="books.length > 0">
            <ion-col
              size="12"
              sizeMd="6"
              sizeLg="4"
              *ngFor="let book of books; trackBy: trackByBookId">
              <div
                class="book-card"
                [style.--book-watermark]="getCoverWatermarkUrl(book) ? 'url(' + getCoverWatermarkUrl(book) + ')' : 'none'"
                (click)="openBookChapters(book.id)">
                <div class="book-watermark-overlay" aria-hidden="true"></div>

                <div class="book-card-content">
                  <div class="title-row">
                    <h2 class="book-card-title">{{ localize(book.title) }}</h2>
                    <ion-icon name="arrow-forward-outline" class="action-arrow"></ion-icon>
                  </div>

                  <p *ngIf="book.subtitle" class="book-card-subtitle">{{ localize(book.subtitle) }}</p>

                  <div class="chapter-count-badge">
                    <ion-icon name="book-outline"></ion-icon>
                    <span>{{ book.chapterCount ?? book.chapters.length }} {{ (uiText$ | async)?.['chapters_label'] || 'Chapters' }}</span>
                  </div>
                </div>
              </div>
            </ion-col>
          </ng-container>

          <!-- Empty State A: User Searched and Found No Matches -->
          <ion-col size="12" *ngIf="books.length === 0 && currentSearchQuery.trim().length > 0" class="no-books-card ion-text-center">
            <div class="empty-state-box">
              <ion-icon name="search-outline" class="empty-icon"></ion-icon>
              <h3 class="empty-title">{{ (uiText$ | async)?.['no_matches_title'] || 'No books match' }}: "{{ currentSearchQuery }}"</h3>
              <p class="empty-hint">{{ (uiText$ | async)?.['search_empty_hint'] || '' }}</p>
            </div>
          </ion-col>

          <!-- Empty State B: Network Outage or Catalog Failed to Load -->
          <ion-col size="12" *ngIf="books.length === 0 && currentSearchQuery.trim().length === 0" class="no-books-card ion-text-center">
            <div class="empty-state-box">
              <ion-icon name="cloud-offline-outline" class="empty-icon warning-icon"></ion-icon>
              <h3 class="empty-title">{{ (uiText$ | async)?.['offline_title'] || 'Unable to Connect to Library' }}</h3>
              <p class="empty-hint">{{ (uiText$ | async)?.['offline_hint'] || 'Please check your internet connection and tap below to retry.' }}</p>

              <ion-button
                fill="outline"
                color="primary"
                class="retry-btn ion-margin-top"
                [disabled]="isRetrying"
                (click)="onRetrySync()">
                <ion-spinner name="crescent" *ngIf="isRetrying"></ion-spinner>
                <ion-icon slot="start" name="refresh-outline" *ngIf="!isRetrying"></ion-icon>
                {{ isRetrying ? '...' : ((uiText$ | async)?.['retry_button'] || 'Tap to Retry') }}
              </ion-button>
            </div>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>

    <!-- Sticky Bottom Advertisement Banner (Dashboard Only, 15-20% Screen Height) -->
    <ion-footer class="ion-no-border ad-banner-footer" *ngIf="visibleAds.length > 0">
      <div class="ad-carousel-shell" *ngIf="currentAdSlide as slide">
        <div
          class="ad-slide-clickable"
          [class.has-link]="!!slide.ad.url"
          (click)="onAdClick(slide.ad)">
          <img
            [src]="slide.src"
            [alt]="slide.ad.uniqueName"
            class="ad-banner-image"
            (error)="onAdImageError(slide)" />
        </div>

        <!-- Manual Navigation Arrows (Shown only when multiple ads exist) -->
        <button
          *ngIf="visibleAds.length > 1"
          type="button"
          class="ad-nav-btn ad-nav-prev"
          aria-label="Previous advertisement"
          (click)="prevAd($event)">
          <ion-icon name="chevron-back-outline"></ion-icon>
        </button>

        <button
          *ngIf="visibleAds.length > 1"
          type="button"
          class="ad-nav-btn ad-nav-next"
          aria-label="Next advertisement"
          (click)="nextAd($event)">
          <ion-icon name="chevron-forward-outline"></ion-icon>
        </button>

        <!-- Slide Indicator Dots -->
        <div class="ad-dots-bar" *ngIf="visibleAds.length > 1">
          <span
            *ngFor="let item of visibleAds; let i = index; trackBy: trackByAdSlide"
            class="ad-dot"
            [class.active-dot]="i === currentAdIndex"
            (click)="goToAd(i, $event)">
          </span>
        </div>
      </div>
    </ion-footer>
  `,
  styles: [`
    .dashboard-content {
      position: relative;
      --background: var(--ion-background-color, #fffdf9);
    }

    /* Single Consolidated Announcement Banner */
    .announcement-banner-card {
      margin: 0 auto 16px auto;
      max-width: 960px;
      width: 100%;
      position: relative;
      z-index: 2;
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.22);
      border-left: 5px solid var(--ion-color-primary);
      border-radius: 14px;
      padding: 10px 14px 12px;
      color: var(--ion-text-color, #2c1810);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
      box-sizing: border-box;
    }

    .announcement-header {
      display: flex;
      align-items: center;
      gap: 7px;
      padding-bottom: 7px;
      margin-bottom: 7px;
      border-bottom: 1px solid rgba(var(--ion-color-primary-rgb), 0.14);
    }

    .announcement-header-icon {
      font-size: 1.05rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
    }

    .announcement-heading-text {
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--ion-color-primary);
    }

    .announcement-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .announcement-row {
      font-size: 0.88rem;
      font-weight: 500;
      line-height: 1.5;
      word-break: break-word;
    }

    .announcement-row-divider {
      padding-bottom: 8px;
      border-bottom: 1px dashed rgba(var(--ion-color-primary-rgb), 0.16);
    }

    .banner-new-badge {
      display: inline-block;
      vertical-align: middle;
      background: var(--ion-color-primary, #8B2635);
      color: var(--ion-color-primary-contrast, #ffffff);
      font-size: 0.64rem;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 5px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      margin-right: 6px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.12);
    }

    .announcement-message-inline {
      display: inline;
    }

    .banner-text {
      display: inline;
      white-space: pre-line;
      word-break: break-word;
    }

    :host ::ng-deep .banner-text p {
      display: inline;
      margin: 0;
    }

    :host ::ng-deep .banner-text ul,
    :host ::ng-deep .banner-text ol {
      margin: 4px 0;
      padding-left: 18px;
    }

    .inline-read-now-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      vertical-align: baseline;
      margin-left: 6px;
      padding: 1px 8px;
      border: none;
      border-radius: 10px;
      background: rgba(var(--ion-color-primary-rgb), 0.12);
      color: var(--ion-color-primary);
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.18s ease, opacity 0.18s ease;

      &:active {
        opacity: 0.75;
      }

      ion-icon {
        font-size: 0.82rem;
      }
    }

    /* Sticky Bottom Advertisement Banner (15-20% Screen Height) */
    .ad-banner-footer {
      background: var(--ion-card-background, #fff8ec);
      border-top: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
      padding-bottom: var(--ion-safe-area-bottom, env(safe-area-inset-bottom, 0px));
      z-index: 10;
    }

    .ad-carousel-shell {
      position: relative;
      width: 100%;
      height: 17vh;
      min-height: 108px;
      max-height: 168px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ion-card-background, #fff8ec);
    }

    .ad-slide-clickable {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ad-slide-clickable.has-link {
      cursor: pointer;
    }

    .ad-banner-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .ad-nav-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.45);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      cursor: pointer;
      z-index: 3;
      padding: 0;
      transition: background 0.2s ease;

      &:active {
        background: rgba(0, 0, 0, 0.7);
      }
    }

    .ad-nav-prev {
      left: 8px;
    }

    .ad-nav-next {
      right: 8px;
    }

    .ad-dots-bar {
      position: absolute;
      bottom: 6px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.35);
      z-index: 3;
    }

    .ad-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease;
    }

    .ad-dot.active-dot {
      background: #ffffff;
      transform: scale(1.25);
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
      padding-top: 0;
      padding-bottom: 0;
    }

    .book-card {
      position: relative;
      border-radius: 18px;
      overflow: hidden;
      margin: 6px 0;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
      transition: transform 0.22s ease, box-shadow 0.22s ease;
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
      cursor: pointer;
      min-height: 140px;
      display: flex;
      align-items: stretch;

      &:hover {
        transform: translateY(-3px);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
      }
    }

    .book-watermark-overlay {
      position: absolute;
      inset: 0;
      background-image: var(--book-watermark, none);
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
      opacity: 0.20;
      pointer-events: none;
      z-index: 0;
    }

    .book-card-content {
      position: relative;
      z-index: 1;
      width: 100%;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }

    .title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .book-card-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--ion-color-primary);
      margin: 0;
      padding-top: 2px;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .action-arrow {
      font-size: 1.25rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
      margin-top: 4px;
    }

    .book-card-subtitle {
      margin: 6px 0 10px 0;
      font-size: 0.88rem;
      color: var(--ion-color-medium);
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chapter-count-badge {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(var(--ion-color-primary-rgb), 0.12);
      color: var(--ion-color-primary);
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .empty-state-box {
      padding: 42px 20px;
      margin: 20px auto;
      max-width: 440px;
      background: var(--ion-card-background, #fff8ec);
      border-radius: 20px;
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.15);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
    }

    .empty-icon {
      font-size: 3.5rem;
      color: var(--ion-color-medium);
      opacity: 0.6;
      margin-bottom: 12px;
    }

    .warning-icon {
      color: var(--ion-color-primary);
      opacity: 0.85;
    }

    .empty-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--ion-text-color);
      margin: 0 0 8px 0;
    }

    .empty-hint {
      font-size: 0.9rem;
      color: var(--ion-color-medium);
      margin: 0 0 16px 0;
      line-height: 1.45;
    }

    .retry-btn {
      --border-radius: 12px;
      font-weight: 700;
      height: 44px;
    }
  `]
})
export class DashboardPage implements OnInit, OnDestroy {
  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);
  private toastCtrl = inject(ToastController);

  public visibleBooks$: Observable<Book[]> = this.dataService.visibleBooks$;
  public activeBanners$: Observable<ActiveBannerView[]> = this.dataService.activeBanners$;
  public watermarkUrl$: Observable<string> = this.dataService.watermarkUrl$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  private currentLang = 'hi';
  private uiTextSnapshot: Record<string, string> = {};
  public currentSearchQuery = '';
  public isRetrying = false;
  private searchSubject = new BehaviorSubject<string>('');

  // Sticky Advertisement Carousel State (Dashboard Only)
  private readonly AD_ROTATION_INTERVAL_MS = 7000; // 7 seconds (within 5-10 sec requirement)
  public visibleAds: AdSlideView[] = [];
  public currentAdIndex = 0;
  private adTimer: ReturnType<typeof setInterval> | null = null;

  public get currentAdSlide(): AdSlideView | null {
    if (this.visibleAds.length === 0) return null;
    const safeIdx = this.currentAdIndex % this.visibleAds.length;
    return this.visibleAds[safeIdx] || null;
  }

  public filteredBooks$: Observable<Book[]> = combineLatest([
    this.dataService.visibleBooks$,
    this.searchSubject
  ]).pipe(
    map(([books, query]) => {
      const q = (query || '').trim().toLowerCase();
      if (!books) return [];
      if (!q) return books;
      return books.filter(book => {
        const titleMatch = Object.values(book.title || {}).some(t => (t || '').toLowerCase().includes(q));
        const subtitleMatch = book.subtitle
          ? Object.values(book.subtitle).some(s => (s || '').toLowerCase().includes(q))
          : false;
        const chapterMatch = (book.chapters || []).some(ch =>
          Object.values(ch.title || {}).some(ct => (ct || '').toLowerCase().includes(q)) ||
          (ch.subtitle ? Object.values(ch.subtitle).some(cs => (cs || '').toLowerCase().includes(q)) : false)
        );
        return titleMatch || subtitleMatch || chapterMatch;
      });
    })
  );

  private langSub?: Subscription;
  private uiSub?: Subscription;
  private adsSub?: Subscription;

  constructor() {
    addIcons({
      sparklesOutline,
      megaphoneOutline,
      bookOutline,
      arrowForwardOutline,
      chevronBackOutline,
      chevronForwardOutline,
      searchOutline,
      cloudOfflineOutline,
      refreshOutline
    });
  }

  ngOnInit(): void {
    this.langSub = this.storageService.selectedLanguage$.subscribe(lang => {
      this.currentLang = lang;
    });
    this.uiSub = this.dataService.uiText$.subscribe(ui => {
      this.uiTextSnapshot = ui || {};
    });
    this.adsSub = this.dataService.activeAdvertisements$.subscribe(ads => {
      this.visibleAds = (ads || [])
        .map(ad => ({
          ad,
          src: this.dataService.resolveAdImageUrl(ad, false),
          triedFallback: false
        }))
        .filter(slide => !!slide.src);

      this.currentAdIndex = 0;
      this.restartAdCarousel();
    });
  }

  private restartAdCarousel(): void {
    this.stopAdCarousel();
    if (this.visibleAds.length > 1) {
      this.adTimer = setInterval(() => {
        if (this.visibleAds.length > 1) {
          this.currentAdIndex = (this.currentAdIndex + 1) % this.visibleAds.length;
        }
      }, this.AD_ROTATION_INTERVAL_MS);
    }
  }

  private stopAdCarousel(): void {
    if (this.adTimer !== null) {
      clearInterval(this.adTimer);
      this.adTimer = null;
    }
  }

  public prevAd(event: Event): void {
    event.stopPropagation();
    if (this.visibleAds.length <= 1) return;
    this.currentAdIndex = (this.currentAdIndex - 1 + this.visibleAds.length) % this.visibleAds.length;
    this.restartAdCarousel();
  }

  public nextAd(event: Event): void {
    event.stopPropagation();
    if (this.visibleAds.length <= 1) return;
    this.currentAdIndex = (this.currentAdIndex + 1) % this.visibleAds.length;
    this.restartAdCarousel();
  }

  public goToAd(index: number, event: Event): void {
    event.stopPropagation();
    if (index < 0 || index >= this.visibleAds.length) return;
    this.currentAdIndex = index;
    this.restartAdCarousel();
  }

  public onAdClick(ad: AdvertisementItem): void {
    const rawUrl = (ad?.url || '').trim();
    if (!rawUrl) return;

    if (rawUrl.startsWith('/')) {
      this.router.navigateByUrl(rawUrl);
      return;
    }

    const safeUrl = SecurityUtil.sanitizeExternalUrl(rawUrl);
    if (!safeUrl) return;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }

  public onAdImageError(slide: AdSlideView): void {
    if (!slide.triedFallback) {
      slide.triedFallback = true;
      const fallbackSrc = this.dataService.resolveAdImageUrl(slide.ad, true);
      if (fallbackSrc && fallbackSrc !== slide.src) {
        slide.src = fallbackSrc;
        return;
      }
    }

    // Both remote and local fallback failed -> remove broken ad cleanly so no broken image shows
    this.visibleAds = this.visibleAds.filter(item => item.ad.id !== slide.ad.id);
    if (this.visibleAds.length === 0) {
      this.currentAdIndex = 0;
      this.stopAdCarousel();
    } else {
      this.currentAdIndex = this.currentAdIndex % this.visibleAds.length;
      this.restartAdCarousel();
    }
  }

  public trackByAdSlide(_index: number, slide: AdSlideView): string | number {
    return slide.ad.id;
  }

  public onBannerClick(banner: ActiveBannerView): void {
    if (!banner.targetBookId) return;

    if (banner.targetChapterId) {
      this.router.navigate(['/reader', banner.targetBookId, banner.targetChapterId]);
    } else {
      this.router.navigate(['/chapters', banner.targetBookId]);
    }
  }

  public trackByBannerId(_index: number, banner: ActiveBannerView): string {
    return banner.id;
  }

  public onSearchQueryChange(query: string): void {
    this.currentSearchQuery = query;
    this.searchSubject.next(query);
  }

  public getSearchPlaceholder(): string {
    if (this.uiTextSnapshot['search_books_placeholder']) {
      return this.uiTextSnapshot['search_books_placeholder'];
    }
    const map: Record<string, string> = {
      hi: 'ग्रंथ / पुस्तकें खोजें...',
      gu: 'ગ્રંથો / પુસ્તકો શોધો...',
      mr: 'पुस्तके शोधा...',
      en: 'Search books...'
    };
    return map[this.currentLang] || 'Search books...';
  }

  public getAlreadyUpToDateText(): string {
    if (this.uiTextSnapshot['already_up_to_date']) {
      return this.uiTextSnapshot['already_up_to_date'];
    }
    const map: Record<string, string> = {
      hi: 'पुस्तकालय पहले से ही अप टू डेट है',
      gu: 'પુસ્તકાલય પહેલેથી જ અપ ટુ ડેટ છે',
      mr: 'पुस्तकालय आधीपासूनच अद्ययावत आहे',
      en: 'Already up to date'
    };
    return map[this.currentLang] || 'Already up to date';
  }

  public getCoverWatermarkUrl(book: Book): string {
    if (!book?.coverImageUrl) return '';
    return this.dataService.resolveMediaUrl(book.coverImageUrl);
  }

  public async onPullRefresh(event: CustomEvent): Promise<void> {
    const result = await this.dataService.syncIfDueToday(true);
    (event.target as HTMLIonRefresherElement).complete();
    const uiText = await firstValueFrom(this.dataService.uiText$);

    let message: string;
    let color: string;

    if (!result.success) {
      message = uiText['offline_hint'] || 'Could not reach server. Showing saved library.';
      color = 'medium';
    } else if (result.isThrottled || !result.isUpdated) {
      message = uiText['already_up_to_date'] || this.getAlreadyUpToDateText();
      color = 'dark';
    } else {
      message = uiText['library_updated'] || 'Library updated successfully';
      color = 'success';
    }

    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
      color
    });
    await toast.present();
  }

  public async onRetrySync(): Promise<void> {
    this.isRetrying = true;
    const result = await this.dataService.syncWithRemote(true);
    this.isRetrying = false;

    if (!result.success) {
      const uiText = await firstValueFrom(this.dataService.uiText$);
      const toast = await this.toastCtrl.create({
        message: uiText['offline_hint'] || 'Connection failed. Please check internet connection.',
        duration: 2200,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    }
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

  ngOnDestroy(): void {
    this.stopAdCarousel();
    this.langSub?.unsubscribe();
    this.uiSub?.unsubscribe();
    this.adsSub?.unsubscribe();
  }
}
