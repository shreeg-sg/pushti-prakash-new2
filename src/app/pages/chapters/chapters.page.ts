import { Component, OnInit, inject } from '@angular/core';
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
import { Observable, combineLatest } from 'rxjs';

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
        <!-- Title & Description Header Section (Strict 15% Viewport Height with Cover Watermark) -->
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

        <!-- Section Heading -->
        <div class="section-title">
          {{ getChaptersSectionTitle() }}
        </div>

        <!-- Full List of Chapters -->
        <ion-list lines="full" class="chapters-list">
          <ion-item
            *ngFor="let chapter of activeBook.chapters; trackBy: trackByChapterId; let i = index"
            button
            detail="true"
            class="chapter-row-item"
            (click)="openChapter(activeBook.id, chapter.id)">
            <div slot="start" class="chapter-index-circle">
              {{ chapter.order || i + 1 }}
            </div>
            <ion-label class="ion-text-wrap chapter-label">
              <h2 class="chapter-title">{{ localize(chapter.title) }}</h2>
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
      position: relative;
    }
    .chapters-wrapper {
      max-width: 760px;
      margin: 0 auto;
      padding-bottom: 30px;
    }

    /* Requirement: Exactly 15% Viewport Height Title Section with Cover Watermark */
    .book-banner-card {
      position: relative;
      margin: 0 0 16px 0;
      border-radius: 18px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
      overflow: hidden;
      
      /* 15% Viewport Height */
      height: 15vh;
      min-height: 105px;
      max-height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
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
      opacity: 0.15; /* Watermark visibility */
      pointer-events: none;
      z-index: 0;
    }

    .banner-content {
      position: relative;
      z-index: 1;
      padding: 8px 16px;
      text-align: center;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .book-title {
      font-size: 1.25rem;
      font-weight: 800;
      margin: 0 0 4px 0;
      color: var(--ion-color-primary);
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 94%;
    }

    .book-subtitle {
      font-size: 0.85rem;
      color: var(--ion-color-medium);
      margin: 0 0 6px 0;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 94%;
    }

    .chapter-count-chip {
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

    .section-title {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--ion-color-medium);
      margin: 16px 4px 8px;
    }

    .chapters-list {
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      background: var(--ion-card-background, #fff8ec);
    }

    .chapter-row-item {
      --padding-start: 14px;
      --inner-padding-end: 14px;
      --min-height: 58px;
    }

    .chapter-index-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(var(--ion-color-primary-rgb), 0.1);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
      margin-right: 12px;
    }

    .chapter-title {
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--ion-text-color, #2c1810);
    }

    .media-icon {
      font-size: 1.35rem;
    }
  `]
})
export class ChaptersPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);

  public activeBook?: Book;
  public activeBookTitle = '';
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  private currentLang = 'hi';

  constructor() {
    addIcons({ bookOutline, playCircleOutline, documentTextOutline, arrowBackOutline });
  }

  ngOnInit(): void {
    combineLatest([
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

  public getCoverWatermarkUrl(book: Book): string {
    return this.dataService.resolveMediaUrl(book.coverImageUrl);
  }

  public getChaptersCountLabel(count: number): string {
    if (this.currentLang === 'hi' || this.currentLang === 'mr') return `${count} अध्याय`;
    if (this.currentLang === 'gu') return `${count} અધ્યાય`;
    return `${count} ${count === 1 ? 'Chapter' : 'Chapters'}`;
  }

  public getChaptersSectionTitle(): string {
    if (this.currentLang === 'hi' || this.currentLang === 'mr') return 'अध्याय सूची';
    if (this.currentLang === 'gu') return 'અધ્યાય સૂચિ';
    return 'Chapters';
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public hasRecordedAudio(chapter: Chapter): boolean {
    const raw = this.dataService.localizeField(chapter.audioUrl, this.currentLang);
    return !!raw && raw.trim().length > 0;
  }

  public openChapter(bookId: string, chapterId: string): void {
    this.router.navigate(['/reader', bookId, chapterId]);
  }

  public trackByChapterId(_index: number, chapter: Chapter): string {
    return chapter.id;
  }
}