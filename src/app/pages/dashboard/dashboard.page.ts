import { Component, OnInit, OnDestroy, ViewChild, ElementRef, inject } from '@angular/core';
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
  bookOutline,
  arrowForwardOutline,
  searchOutline,
  cloudOfflineOutline,
  refreshOutline,
  chevronBackOutline,
  chevronForwardOutline
} from 'ionicons/icons';
import { Observable, Subscription, BehaviorSubject, combineLatest, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../../layout/header.component';
import { DataService, ActiveBannerView, ActiveAdView } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { Book } from '../../core/models/app-config.model';
import { SecurityUtil } from '../../core/utils/security.util';

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

      <!-- Active Announcement Cards (Top-Line Aligned Icons & Badges) -->
      <div class="notification-banner-container" *ngIf="(activeBanners$ | async) as banners">
        <div
          class="banner-item-card"
          *ngFor="let banner of banners; trackBy: trackByBannerId"
          [class.clickable-banner]="!!banner.targetBookId"
          (click)="onBannerClick(banner)">
          
          <div class="banner-left-meta">
            <ion-icon name="sparkles-outline" class="banner-icon"></ion-icon>
            <span class="banner-new-badge" *ngIf="banner.isNew">NEW</span>
          </div>

          <span class="banner-text" [innerHTML]="banner.messageHtml"></span>

          <div class="banner-action-chip" *ngIf="banner.targetBookId">
            <span>{{ banner.actionLabel || (uiText$ | async)?.['read_now'] || 'Read Now' }}</span>
            <ion-icon name="arrow-forward-outline"></ion-icon>
          </div>
        </div>
      </div>

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
                    <span>{{ book.chapters.length }} {{ (uiText$ | async)?.['chapters_label'] || 'Chapters' }}</span>
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

    <!-- Sticky 20% Bottom Advertisement Banner (Dashboard Only) -->
    <ion-footer class="ion-no-border dashboard-ad-footer" *ngIf="activeAds.length > 0">
      <div class="ad-banner-shell">
        <button
          type="button"
          class="ad-nav-arrow ad-arrow-left"
          *ngIf="activeAds.length > 1"
          (click)="prevAd($event)"
          aria-label="Previous Advertisement">
          <ion-icon name="chevron-back-outline"></ion-icon>
        </button>

        <div
          #adCarouselTrack
          class="ad-carousel-track"
          (scroll)="onAdCarouselScroll()">
          <div
            class="ad-slide-item"
            *ngFor="let ad of activeAds; trackBy: trackByAdId"
            (click)="onAdClick(ad)">
            <img
              [src]="ad.imageUrl"
              [alt]="ad.name || 'Advertisement'"
              class="ad-slide-img"
              loading="lazy"
              (error)="onAdImageError(ad.id)" />
          </div>
        </div>

        <button
          type="button"
          class="ad-nav-arrow ad-arrow-right"
          *ngIf="activeAds.length > 1"
          (click)="nextAd($event)"
          aria-label="Next Advertisement">
          <ion-icon name="chevron-forward-outline"></ion-icon>
        </button>

        <div class="ad-dots-indicator" *ngIf="activeAds.length > 1">
          <span
            *ngFor="let ad of activeAds; let i = index; trackBy: trackByAdId"
            class="ad-dot"
            [class.active-dot]="i === currentAdIndex"
            (click)="scrollToAd(i, $event)">
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

    .notification-banner-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0 auto 16px auto;
      max-width: 960px;
      width: 100%;
      position: relative;
      z-index: 2;
    }

    .banner-item-card {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 10px 12px;
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.22);
      border-left: 5px solid var(--ion-color-primary);
      border-radius: 14px;
      padding: 12px 16px;
      color: var(--ion-text-color, #2c1810);
      font-weight: 500;
      font-size: 0.92rem;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
      box-sizing: border-box;
      transition: transform 0.18s ease;
    }

    .banner-item-card.clickable-banner {
      cursor: pointer;

      &:active {
        transform: scale(0.99);
      }
    }

    .banner-left-meta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .banner-icon {
      font-size: 1.2rem;
      color: var(--ion-color-primary);
    }

    .banner-new-badge {
      background: var(--ion-color-primary, #8B2635);
      color: var(--ion-color-primary-contrast, #ffffff);
      font-size: 0.68rem;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 6px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    }

    .banner-text {
      flex: 1 1 180px;
      line-height: 1.48;
      white-space: pre-line;
      word-break: break-word;
    }

    :host ::ng-deep .banner-text p,
    :host ::ng-deep .banner-text ul,
    :host ::ng-deep .banner-text ol {
      margin: 0;
      padding-left: 18px;
    }

    .banner-action-chip {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: 5px;
      background: var(--ion-color-primary, #8B2635);
      color: var(--ion-color-primary-contrast, #ffffff);
      padding: 5px 12px;
      border-radius: 14px;
      font-size: 0.8rem;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 1px;
      transition: opacity 0.2s ease;
      white-space: nowrap;

      &:active {
        opacity: 0.8;
      }

      ion-icon {
        font-size: 0.9rem;
      }
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

    .dashboard-ad-footer {
      background: var(--ion-card-background, #fff8ec);
      border-top: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      z-index: 20;
    }

    .ad-banner-shell {
      position: relative;
      width: 100%;
      max-width: 960px;
      height: 20vh;
      min-height: 110px;
      max-height: 180px;
      margin: 0 auto;
      overflow: hidden;
      background: var(--ion-card-background, #fff8ec);
    }

    .ad-carousel-track {
      display: flex;
      width: 100%;
      height: 100%;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -ms-overflow-style: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .ad-slide-item {
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      scroll-snap-align: start;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .ad-slide-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .ad-nav-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 5;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.42);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      font-size: 1.1rem;
    }

    .ad-arrow-left {
      left: 8px;
    }

    .ad-arrow-right {
      right: 8px;
    }

    .ad-dots-indicator {
      position: absolute;
      bottom: 6px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      z-index: 5;
      background: rgba(0, 0, 0, 0.28);
      padding: 3px 8px;
      border-radius: 10px;
    }

    .ad-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.55);
      cursor: pointer;
      transition: background-color 0.2s ease, transform 0.2s ease;
    }

    .ad-dot.active-dot {
      background: #ffffff;
      transform: scale(1.2);
    }
  `]
})
export class DashboardPage implements OnInit, OnDestroy {
  @ViewChild('adCarouselTrack') adCarouselTrack?: ElementRef<HTMLDivElement>;

  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);
  private toastCtrl = inject(ToastController);

  public visibleBooks$: Observable<Book[]> = this.dataService.visibleBooks$;
  public activeBanners$: Observable<ActiveBannerView[]> = this.dataService.activeBanners$;
  public watermarkUrl$: Observable<string> = this.dataService.watermarkUrl$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  public activeAds: ActiveAdView[] = [];
  public currentAdIndex = 0;
  private adAutoScrollTimer: any = null;
  private adsSub?: Subscription;

  private currentLang = 'hi';
  private uiTextSnapshot: Record<string, string> = {};
  public currentSearchQuery = '';
  public isRetrying = false;
  private searchSubject = new BehaviorSubject<string>('');

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

  constructor() {
    addIcons({
      sparklesOutline,
      bookOutline,
      arrowForwardOutline,
      searchOutline,
      cloudOfflineOutline,
      refreshOutline,
      chevronBackOutline,
      chevronForwardOutline
    });
  }

  ngOnInit(): void {
    this.langSub = this.storageService.selectedLanguage$.subscribe(lang => {
      this.currentLang = lang;
    });
    this.uiSub = this.dataService.uiText$.subscribe(ui => {
      this.uiTextSnapshot = ui || {};
    });
    this.adsSub = this.dataService.activeAds$.subscribe(ads => {
      this.activeAds = ads || [];
      this.currentAdIndex = 0;
      this.restartAdAutoScroll();
    });
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

  public trackByAdId(_index: number, ad: ActiveAdView): string {
    return ad.id;
  }

  public onAdClick(ad: ActiveAdView): void {
    const safeUrl = SecurityUtil.sanitizeExternalUrl(ad?.url);
    if (!safeUrl) return;
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }

  public onAdImageError(adId: string): void {
    this.activeAds = this.activeAds.filter(a => a.id !== adId);
    if (this.currentAdIndex >= this.activeAds.length) {
      this.currentAdIndex = 0;
    }
    this.restartAdAutoScroll();
  }

  public prevAd(event: Event): void {
    event.stopPropagation();
    if (this.activeAds.length <= 1) return;
    const prevIdx = (this.currentAdIndex - 1 + this.activeAds.length) % this.activeAds.length;
    this.scrollToAd(prevIdx);
  }

  public nextAd(event: Event): void {
    event.stopPropagation();
    if (this.activeAds.length <= 1) return;
    const nextIdx = (this.currentAdIndex + 1) % this.activeAds.length;
    this.scrollToAd(nextIdx);
  }

  public scrollToAd(index: number, event?: Event): void {
    event?.stopPropagation();
    if (index < 0 || index >= this.activeAds.length) return;
    this.currentAdIndex = index;
    const el = this.adCarouselTrack?.nativeElement;
    if (el) {
      el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    }
    this.restartAdAutoScroll();
  }

  public onAdCarouselScroll(): void {
    const el = this.adCarouselTrack?.nativeElement;
    if (!el || el.clientWidth <= 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx >= 0 && idx < this.activeAds.length && idx !== this.currentAdIndex) {
      this.currentAdIndex = idx;
      this.restartAdAutoScroll();
    }
  }

  private restartAdAutoScroll(): void {
    if (this.adAutoScrollTimer) {
      clearInterval(this.adAutoScrollTimer);
      this.adAutoScrollTimer = null;
    }
    if (this.activeAds.length <= 1) return;
    const intervalMs = this.activeAds[0]?.intervalMs || 7000;
    this.adAutoScrollTimer = setInterval(() => {
      if (this.activeAds.length <= 1) return;
      const nextIdx = (this.currentAdIndex + 1) % this.activeAds.length;
      this.currentAdIndex = nextIdx;
      const el = this.adCarouselTrack?.nativeElement;
      if (el) {
        el.scrollTo({ left: nextIdx * el.clientWidth, behavior: 'smooth' });
      }
    }, intervalMs);
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
    this.langSub?.unsubscribe();
    this.uiSub?.unsubscribe();
    this.adsSub?.unsubscribe();
    if (this.adAutoScrollTimer) {
      clearInterval(this.adAutoScrollTimer);
      this.adAutoScrollTimer = null;
    }
  }
}