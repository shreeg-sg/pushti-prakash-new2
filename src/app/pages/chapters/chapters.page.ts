import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  playCircleOutline,
  documentTextOutline,
  arrowBackOutline
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
    IonIcon
  ],
  template: `
    <app-header [pageTitle]="activeBookTitle"></app-header>

    <ion-content class="ion-padding chapters-content">
      <div class="chapters-wrapper" *ngIf="activeBook">
        <!-- Title & Description Header Section (Max 20% Viewport Height + 2-Line Subtitle) -->
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

        <div class="section-title">
          {{ getChaptersSectionTitle() }}
        </div>

        <ion-list lines="inset" class="chapters-list">
          <ion-item
            *ngFor="let chapter of activeBook.chapters; trackBy: trackByChapterId"
            button
            detail="false"
            class="chapter-row-item"
            (click)="openReader(chapter.id)">
            <div class="chapter-index-circle" slot="start">
              {{ chapter.order }}
            </div>

            <ion-label class="ion-text-wrap chapter-title-label">
              <h2 class="chapter-primary-title">{{ localize(chapter.title) }}</h2>
              <p *ngIf="hasRecordedAudio(chapter)" class="audio-available-hint">
                {{ (uiText$ | async)?.['audio_available'] || 'Audio available' }}
              </p>
            </ion-label>

            <ion-icon
              slot="end"
              [name]="hasRecordedAudio(chapter) ? 'play-circle-outline' : 'document-text-outline'"
              color="primary"
              class="media-icon">
            </ion-icon>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [`
    .chapters-content {
      --background: var(--ion-background-color, #fffdf9);
    }

    .chapters-wrapper {
      max-width: 780px;
      margin: 0 auto;
    }

    /* 20% Viewport Height Max */
    .book-banner-card {
      position: relative;
      border-radius: 18px;
      overflow: hidden;
      margin-bottom: 18px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
      height: 20vh;
      max-height: 20vh;
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
      opacity: 0.15;
      pointer-events: none;
      z-index: 0;
    }

    .banner-content {
      position: relative;
      z-index: 1;
      width: 100%;
      padding: 12px 18px;
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
      margin: 0 0 2px 0;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* 2-line clamped description with natural line wrapping */
    .book-subtitle {
      font-size: 0.86rem;
      color: var(--ion-color-medium);
      line-height: 1.35;
      margin: 2px 0 6px 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      word-break: break-word;
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
      font-size: 0.78rem;
      font-weight: 700;
    }

    .section-title {
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--ion-color-medium);
      margin: 12px 4px 8px;
    }

    .chapters-list {
      background: transparent;
      padding: 0;
    }

    .chapter-row-item {
      --background: var(--ion-card-background, #fff8ec);
      --border-radius: 14px;
      margin-bottom: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      --padding-start: 12px;
      --inner-padding-end: 12px;
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.08);
      transition: transform 0.15s ease;

      &:hover {
        transform: translateX(2px);
      }
    }

    .chapter-index-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(var(--ion-color-primary-rgb), 0.12);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.88rem;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .chapter-primary-title {
      font-size: 1.02rem;
      font-weight: 700;
      color: var(--ion-text-color);
      margin: 2px 0;
    }

    .audio-available-hint {
      font-size: 0.75rem;
      color: var(--ion-color-medium);
      margin: 0;
    }

    .media-icon {
      font-size: 1.45rem;
    }
  `]
})
export class ChaptersPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);

  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public activeBook?: Book;
  public activeBookTitle = '';
  private currentLang = 'hi';
  private routeSub?: Subscription;

  constructor() {
    addIcons({
      bookOutline,
      playCircleOutline,
      documentTextOutline,
      arrowBackOutline
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
      if (!bookId) return;

      this.activeBook = books.find(b => b.id === bookId);
      if (this.activeBook) {
        this.activeBookTitle = this.localize(this.activeBook.title);
      }
    });
  }

  public getCoverWatermarkUrl(book: Book | undefined): string {
    return book ? this.dataService.resolveMediaUrl(book.coverImageUrl) : '';
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public hasRecordedAudio(chapter: Chapter): boolean {
    const raw = this.dataService.localizeField(chapter.audioUrl, this.currentLang);
    return !!raw && raw.trim().length > 0;
  }

  public getChaptersCountLabel(count: number): string {
    return `${count} Chapters`;
  }

  public getChaptersSectionTitle(): string {
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