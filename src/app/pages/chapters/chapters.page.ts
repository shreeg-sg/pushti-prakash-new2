import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonCard
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
    IonIcon,
    IonCard
  ],
  template: `
    <app-header [pageTitle]="activeBookTitle"></app-header>

    <ion-content class="ion-padding chapters-content">
      <!-- Direct Watermark Binding (15% opacity behind chapter list) -->
      <div
        class="watermark-overlay"
        *ngIf="watermarkUrl$ | async as wmUrl"
        [style.backgroundImage]="'url(' + wmUrl + ')'"
        aria-hidden="true">
      </div>

      <div class="chapters-wrapper" *ngIf="activeBook">
        <!-- Book Banner Header Card -->
        <ion-card class="book-banner-card">
          <div class="banner-inner">
            <img
              *ngIf="activeBook.coverImageUrl"
              [src]="dataService.resolveMediaUrl(activeBook.coverImageUrl)"
              [alt]="localize(activeBook.title)"
              class="banner-cover-img"
              (error)="onCoverError($event)" />
            <div class="banner-text">
              <h1 class="book-title">{{ localize(activeBook.title) }}</h1>
              <p *ngIf="activeBook.subtitle" class="book-subtitle">{{ localize(activeBook.subtitle) }}</p>
              <div class="chapter-count-chip">
                <ion-icon name="book-outline"></ion-icon>
                <span>{{ activeBook.chapters.length }} {{ (uiText$ | async)?.['nav_books_header'] || 'Chapters' }}</span>
              </div>
            </div>
          </div>
        </ion-card>

        <!-- Full List of Chapters -->
        <div class="section-title">
          {{ (uiText$ | async)?.['nav_books_header'] || 'Chapters' }}
        </div>

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
    .chapters-wrapper {
      position: relative;
      z-index: 1;
      max-width: 760px;
      margin: 0 auto;
      padding-bottom: 30px;
    }
    .book-banner-card {
      margin: 0 0 20px 0;
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
    }
    .banner-inner {
      display: flex;
      padding: 16px;
      gap: 16px;
      align-items: center;
    }
    .banner-cover-img {
      width: 90px;
      height: 120px;
      border-radius: 10px;
      object-fit: cover;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      flex-shrink: 0;
    }
    .banner-text {
      flex: 1;
    }
    .book-title {
      font-size: 1.3rem;
      font-weight: 800;
      margin: 0 0 6px 0;
      color: var(--ion-color-primary);
    }
    .book-subtitle {
      font-size: 0.88rem;
      color: var(--ion-color-medium);
      margin: 0 0 10px 0;
      line-height: 1.4;
    }
    .chapter-count-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(var(--ion-color-primary-rgb), 0.1);
      color: var(--ion-color-primary);
      padding: 4px 10px;
      border-radius: 20px;
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
      --min-height: 52px;
    }
    .chapter-index-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(var(--ion-color-primary-rgb), 0.12);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.82rem;
      margin-right: 8px;
    }
    .chapter-title {
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--ion-text-color, #2c1810);
    }
    .media-icon {
      font-size: 1.3rem;
    }
  `]
})
export class ChaptersPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);

  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public watermarkUrl$: Observable<string> = this.dataService.watermarkUrl$;

  public activeBook?: Book;
  public activeBookTitle = '';
  private currentLang = 'hi';

  constructor() {
    addIcons({ bookOutline, playCircleOutline, documentTextOutline, arrowBackOutline });
  }

  ngOnInit(): void {
    combineLatest([
      this.route.paramMap,
      this.storageService.selectedLanguage$,
      this.dataService.visibleBooks$
    ]).subscribe(([params, lang, books]) => {
      this.currentLang = lang;
      const bookId = params.get('bookId');
      if (bookId && books.length > 0) {
        this.activeBook = books.find(b => b.id === bookId);
        if (this.activeBook) {
          this.activeBookTitle = this.dataService.localizeField(this.activeBook.title, lang);
        }
      }
    });
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public hasRecordedAudio(chapter: Chapter): boolean {
    const url = this.dataService.localizeField(chapter.audioUrl, this.currentLang);
    return Boolean(url && url.trim().length > 0);
  }

  public openChapter(bookId: string, chapterId: string): void {
    this.router.navigate(['/reader', bookId, chapterId]);
  }

  public onCoverError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  public trackByChapterId(_index: number, chapter: Chapter): string {
    return chapter.id;
  }
}