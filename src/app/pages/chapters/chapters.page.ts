import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonSearchbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  playCircleOutline,
  documentTextOutline,
  arrowBackOutline,
  searchOutline,
  micOutline,
  volumeHighOutline
} from 'ionicons/icons';
import { Observable, Subscription, combineLatest } from 'rxjs';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { Book, Chapter } from '../../core/models/app-config.model';

@Component({
  selector: 'app-chapters',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonSearchbar
  ],
  template: `
    <app-header [pageTitle]="activeBookTitle"></app-header>

    <ion-content class="ion-padding chapters-content">
      <div
        class="watermark-overlay"
        *ngIf="watermarkUrl$ | async as wmUrl"
        [style.backgroundImage]="'url(' + wmUrl + ')'"
        aria-hidden="true">
      </div>

      <div class="chapters-wrapper" *ngIf="activeBook">
        <!-- Title & Subtitle Card -->
        <div
          class="book-banner-card"
          [style.--cover-watermark]="'url(' + getCoverWatermarkUrl(activeBook) + ')'">
          <div class="banner-watermark-overlay" aria-hidden="true"></div>

          <div class="banner-content">
            <h1 class="book-title">{{ localize(activeBook.title) }}</h1>
            <p *ngIf="activeBook.subtitle" class="book-subtitle">{{ localize(activeBook.subtitle) }}</p>

            <div class="chapter-count-chip">
              <ion-icon name="book-outline"></ion-icon>
              <span>{{ getChaptersCountLabel(activeBook.chapters.length) }}</span>
            </div>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="chapter-searchbar-container">
          <ion-searchbar
            [placeholder]="getChapterSearchPlaceholder()"
            [debounce]="100"
            (ionInput)="onChapterSearch($event)"
            (ionClear)="clearChapterSearch()"
            class="chapter-searchbar">
          </ion-searchbar>
        </div>

        <div class="section-title">
          {{ getChaptersSectionTitle() }} ({{ filteredChapters.length }})
        </div>

        <!-- Chapter Items List -->
        <ion-list lines="inset" class="chapters-list">
          <ion-item
            *ngFor="let chapter of filteredChapters; trackBy: trackByChapterId"
            button
            detail="false"
            class="chapter-row-item"
            (click)="openReader(chapter.id)">
            <div class="chapter-index-circle" slot="start">
              {{ chapter.order }}
            </div>

            <ion-label class="ion-text-wrap chapter-title-label">
            <h2 class="chapter-primary-title">{{ localize(chapter.title) }}</h2>
            <p *ngIf="chapter.subtitle" class="chapter-subtitle-text">{{ localize(chapter.subtitle) }}</p>
            <!-- Audio Status Indicator: Clear distinction between Studio MP3 & Native TTS -->
            <p class="audio-available-hint">
              <ion-icon [name]="hasRecordedAudio(chapter) ? 'volume-high-outline' : 'mic-outline'" class="audio-status-icon"></ion-icon>
              <span>{{ getAudioBadgeLabel(chapter) }}</span>
            </p>
          </ion-label>

            <ion-icon
              slot="end"
              [name]="hasRecordedAudio(chapter) ? 'play-circle-outline' : 'mic-outline'"
              color="primary"
              class="media-icon">
            </ion-icon>
          </ion-item>

          <!-- Empty State -->
          <!-- Empty State -->
          <div *ngIf="filteredChapters.length === 0" class="no-chapters-hint">
            <ion-icon name="document-text-outline" class="empty-chapter-icon"></ion-icon>
            <p class="empty-chapter-title">{{ (uiText$ | async)?.['no_matches_title'] || 'No chapters match' }}: "{{ chapterSearchQuery }}"</p>
            <p class="empty-chapter-subtitle">Try searching by chapter name or order number</p>
          </div>
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [`
    .chapters-content {
      --background: var(--ion-background-color, #fffdf9);
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

    .chapter-subtitle-text {
      font-size: 0.84rem;
      color: var(--ion-color-medium);
      line-height: 1.35;
      margin: 2px 0 4px 0;
    }

    .chapters-wrapper {
      max-width: 780px;
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }

    .book-banner-card {
      position: relative;
      border-radius: 18px;
      overflow: hidden;
      margin-bottom: 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
      min-height: 130px;
      display: flex;
      align-items: center;
    }

    .banner-watermark-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: var(--cover-watermark, none);
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
      opacity: 0.18;
      pointer-events: none;
      z-index: 0;
    }

    .banner-content {
      position: relative;
      z-index: 1;
      width: 100%;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      box-sizing: border-box;
    }

    .book-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--ion-color-primary);
      margin: 0 0 4px 0;
      line-height: 1.3;
    }

    .book-subtitle {
      font-size: 0.88rem;
      color: var(--ion-color-medium);
      line-height: 1.35;
      margin: 2px 0 8px 0;
    }

    .chapter-count-chip {
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

    .chapter-searchbar-container {
      margin-bottom: 10px;
    }

    .chapter-searchbar {
      --background: var(--ion-card-background, #fff8ec);
      --color: var(--ion-text-color, #2c1810);
      --placeholder-color: var(--ion-color-medium, #888);
      --icon-color: var(--ion-color-primary, #8B2635);
      --clear-button-color: var(--ion-color-medium, #888);
      --border-radius: 12px;
      --box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      padding: 0;
    }

    .section-title {
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--ion-color-medium);
      margin: 14px 4px 8px;
    }

    .chapters-list {
      background: transparent;
      padding: 0;
    }

    .chapter-row-item {
      --background: rgba(255, 248, 236, 0.94);
      --border-radius: 14px;
      margin-bottom: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      --padding-start: 12px;
      --inner-padding-end: 12px;
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.12);
      transition: transform 0.15s ease;

      &:hover {
        transform: translateX(2px);
      }
    }

    .chapter-index-circle {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: rgba(var(--ion-color-primary-rgb), 0.12);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.9rem;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .chapter-primary-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--ion-text-color);
      margin: 2px 0;
    }

    .audio-available-hint {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--ion-color-medium);
      margin: 2px 0 0 0;
    }

    .audio-status-icon {
      font-size: 0.92rem;
      color: var(--ion-color-primary);
    }

    .media-icon {
      font-size: 1.45rem;
    }

    .no-chapters-hint {
      text-align: center;
      padding: 32px 16px;
      color: var(--ion-color-medium);
    }

    .empty-chapter-icon {
      font-size: 3rem;
      opacity: 0.6;
      margin-bottom: 8px;
    }

    .empty-chapter-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--ion-text-color);
      margin: 0 0 4px 0;
    }

    .empty-chapter-subtitle {
      font-size: 0.85rem;
      margin: 0;
    }
  `]
})
export class ChaptersPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);

  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public watermarkUrl$: Observable<string> = this.dataService.watermarkUrl$;
  public activeBook?: Book;
  public activeBookTitle = '';
  private currentLang = 'hi';
  private routeSub?: Subscription;

  public chapterSearchQuery = '';

  constructor() {
    addIcons({
      bookOutline,
      playCircleOutline,
      documentTextOutline,
      arrowBackOutline,
      searchOutline,
      micOutline,
      volumeHighOutline
    });
  }

  ngOnInit(): void {
    this.routeSub = combineLatest([
      this.route.paramMap,
      this.dataService.visibleBooks$,
      this.storageService.selectedLanguage$
    ]).subscribe(([params, books, lang]) => {
      this.currentLang = lang;
      const bookId = params.get('bookId');
      if (!bookId || !books) return;

      this.activeBook = books.find((b: Book) => b.id === bookId);
      if (this.activeBook) {
        this.activeBookTitle = this.localize(this.activeBook.title);
      }
    });
  }

  public get filteredChapters(): Chapter[] {
    if (!this.activeBook?.chapters) return [];
    if (!this.chapterSearchQuery) return this.activeBook.chapters;

    const q = this.chapterSearchQuery.trim().toLowerCase();
    return this.activeBook.chapters.filter((ch: Chapter) => {
      const titleMatch = ch.title
        ? Object.values(ch.title).some(t => String(t || '').toLowerCase().includes(q))
        : false;
      const subtitleMatch = ch.subtitle
        ? Object.values(ch.subtitle).some(s => String(s || '').toLowerCase().includes(q))
        : false;
      const orderMatch = String(ch.order) === q;
      return titleMatch || subtitleMatch || orderMatch;
    });
  }

  public onChapterSearch(event: any): void {
    this.chapterSearchQuery = event.detail?.value || '';
  }

  public clearChapterSearch(): void {
    this.chapterSearchQuery = '';
  }

  public getChapterSearchPlaceholder(): string {
    const map: Record<string, string> = {
      hi: 'अध्याय खोजें...',
      gu: 'પ્રકરણ શોધો...',
      mr: 'धडा शोधा...',
      en: 'Search chapters by name or number...'
    };
    return map[this.currentLang] || 'Search chapters by name or number...';
  }

  public getCoverWatermarkUrl(book: Book | undefined): string {
    return book?.coverImageUrl ? this.dataService.resolveMediaUrl(book.coverImageUrl) : '';
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public hasRecordedAudio(chapter: Chapter): boolean {
    const raw = this.dataService.localizeField(chapter.audioUrl, this.currentLang);
    return !!raw && raw.trim().length > 0;
  }

  public getAudioBadgeLabel(chapter: Chapter): string {
    if (this.hasRecordedAudio(chapter)) {
      return this.currentLang === 'gu'
        ? 'ઓડિયો ઉપલબ્ધ'
        : this.currentLang === 'mr'
        ? 'ऑडिओ उपलब्ध'
        : this.currentLang === 'en'
        ? 'Recorded Audio'
        : 'ऑडियो उपलब्ध';
    }
    return this.currentLang === 'gu'
      ? 'સાંભળો (TTS)'
      : this.currentLang === 'mr'
      ? 'ऐका (TTS)'
      : this.currentLang === 'en'
      ? 'Listen via TTS'
      : 'बोलकर सुनें (TTS)';
  }

  public getChaptersCountLabel(count: number): string {
    if (this.currentLang === 'gu') return `${count} પ્રકરણો`;
    if (this.currentLang === 'mr') return `${count} धडे`;
    if (this.currentLang === 'hi') return `${count} अध्याय`;
    return `${count} Chapters`;
  }

  public getChaptersSectionTitle(): string {
    if (this.currentLang === 'gu') return 'પ્રકરણ અનુક્રમણિકા';
    if (this.currentLang === 'mr') return 'अनुक्रमणिका';
    if (this.currentLang === 'hi') return 'अध्याय सूची';
    return 'Chapters Index';
  }

  public trackByChapterId(_index: number, chapter: Chapter): string {
    return chapter.id;
  }

  public openReader(chapterId: string): void {
    this.router.navigate(['/reader', this.activeBook?.id, chapterId]);
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }
}