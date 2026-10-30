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
  IonCardContent,
  IonChip,
  IonIcon,
  IonLabel,
  IonButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  closeCircleOutline,
  bookOutline,
  playCircleOutline,
  documentTextOutline
} from 'ionicons/icons';
import { Observable } from 'rxjs';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { Book, Chapter } from '../../core/models/app-config.model';

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
    IonCardContent,
    IonChip,
    IonIcon,
    IonLabel,
    IonButton
  ],
  template: `
    <app-header [showBackButton]="false"></app-header>

    <ion-content class="ion-padding reader-transcript-container">
      <!-- Pull to Refresh Firebase Config -->
      <ion-refresher slot="fixed" (ionRefresh)="onPullRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Firebase Hot-Update Notification Banner -->
      <div
        class="update-banner"
        *ngIf="(updateBanner$ | async) as bannerText"
        [hidden]="bannerDismissed">
        <div class="banner-left">
          <ion-icon name="sparkles-outline" class="banner-icon"></ion-icon>
          <span>{{ bannerText }}</span>
        </div>
        <ion-button fill="clear" size="small" (click)="bannerDismissed = true">
          <ion-icon slot="icon-only" name="close-circle-outline"></ion-icon>
        </ion-button>
      </div>

      <!-- Books Grid -->
      <ion-grid fixed>
        <ion-row *ngIf="visibleBooks$ | async as books">
          <ion-col
            size="12"
            sizeMd="6"
            sizeLg="4"
            *ngFor="let book of books; trackBy: trackByBookId">
            <ion-card class="book-card">
              <div
                class="book-cover-wrapper"
                (click)="openFirstChapter(book)">
                <img
                  *ngIf="book.coverImageUrl"
                  [src]="book.coverImageUrl"
                  [alt]="localize(book.title)"
                  class="book-cover-img"
                  (error)="onCoverError($event)" />
                <div class="chapter-count-badge">
                  <ion-icon name="book-outline"></ion-icon>
                  {{ book.chapters.length }}
                </div>
              </div>

              <ion-card-header (click)="openFirstChapter(book)">
                <ion-card-title class="book-card-title">
                  {{ localize(book.title) }}
                </ion-card-title>
                <ion-card-subtitle *ngIf="book.subtitle" class="book-card-subtitle">
                  {{ localize(book.subtitle) }}
                </ion-card-subtitle>
              </ion-card-header>

              <ion-card-content>
                <!-- Quick Chapter Chips -->
                <div class="chapter-chips-container">
                  <ion-chip
                    *ngFor="let ch of book.chapters; trackBy: trackByChapterId"
                    outline="true"
                    color="primary"
                    (click)="openChapter(book.id, ch.id)">
                    <ion-icon
                      [name]="hasRecordedAudio(ch) ? 'play-circle-outline' : 'document-text-outline'">
                    </ion-icon>
                    <ion-label>{{ localize(ch.title) }}</ion-label>
                  </ion-chip>
                </div>
              </ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
  styles: [`
    .update-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(var(--ion-color-secondary-rgb), 0.18);
      border-left: 4px solid var(--ion-color-primary);
      border-radius: 12px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-weight: 600;
      font-size: 0.92rem;
    }
    .banner-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .banner-icon {
      font-size: 1.3rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
    }
    .book-card {
      border-radius: 16px;
      overflow: hidden;
      margin: 8px 0;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
      height: calc(100% - 16px);
      display: flex;
      flex-direction: column;
    }
    .book-cover-wrapper {
      position: relative;
      height: 190px;
      background: rgba(var(--ion-color-primary-rgb), 0.08);
      cursor: pointer;
      overflow: hidden;
    }
    .book-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.25s ease;
    }
    .book-cover-wrapper:hover .book-cover-img {
      transform: scale(1.03);
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
    .book-card-title {
      font-size: 1.15rem;
      font-weight: 700;
      cursor: pointer;
    }
    .book-card-subtitle {
      margin-top: 4px;
      font-size: 0.86rem;
    }
    .chapter-chips-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
  `]
})
export class DashboardPage implements OnInit {
  private router = inject(Router);
  private dataService = inject(DataService);
  private storageService = inject(StorageService);

  public visibleBooks$: Observable<Book[]> = this.dataService.visibleBooks$;
  public updateBanner$: Observable<string | null> = this.dataService.updateBanner$;
  public bannerDismissed = false;

  private currentLang = 'hi';

  constructor() {
    addIcons({
      sparklesOutline,
      closeCircleOutline,
      bookOutline,
      playCircleOutline,
      documentTextOutline
    });
  }

  ngOnInit(): void {
    this.storageService.selectedLanguage$.subscribe(lang => {
      this.currentLang = lang;
    });
  }

  public async onPullRefresh(event: CustomEvent): Promise<void> {
    this.bannerDismissed = false;
    await this.dataService.syncWithFirebase();
    (event.target as HTMLIonRefresherElement).complete();
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public hasRecordedAudio(chapter: Chapter): boolean {
    const url = this.dataService.localizeField(chapter.audioUrl, this.currentLang);
    return Boolean(url && url.trim().length > 0);
  }

  public openFirstChapter(book: Book): void {
    if (book.chapters.length > 0) {
      this.openChapter(book.id, book.chapters[0].id);
    }
  }

  public openChapter(bookId: string, chapterId: string): void {
    this.router.navigate(['/reader', bookId, chapterId]);
  }

  public onCoverError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  public trackByBookId(_index: number, book: Book): string {
    return book.id;
  }

  public trackByChapterId(_index: number, chapter: Chapter): string {
    return chapter.id;
  }
}
