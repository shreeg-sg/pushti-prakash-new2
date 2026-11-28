import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bookmarkOutline, trashOutline, bookOutline } from 'ionicons/icons';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';

interface ResolvedBookmarkView {
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  savedAtIso: string;
}

@Component({
  selector: 'app-bookmarks',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonButton
  ],
  template: `
    <app-header></app-header>

    <ion-content class="ion-padding bookmarks-content">
      <div
        class="watermark-overlay"
        *ngIf="watermarkUrl$ | async as wmUrl"
        [style.backgroundImage]="'url(' + wmUrl + ')'"
        aria-hidden="true">
      </div>

      <ng-container *ngIf="resolvedBookmarks$ | async as items">
        <!-- Empty State -->
        <div class="empty-state" *ngIf="items.length === 0">
          <ion-icon name="bookmark-outline" class="empty-icon"></ion-icon>
          <p>{{ (uiText$ | async)?.['empty_bookmarks'] || 'No chapters bookmarked yet.' }}</p>
        </div>

        <!-- Bookmarked Chapters List -->
        <ion-list lines="full" class="bookmarks-list" *ngIf="items.length > 0">
          <ion-item
            *ngFor="let item of items; trackBy: trackByBookmark"
            button
            detail="true"
            class="bookmark-row-item"
            (click)="openBookmark(item.bookId, item.chapterId)">
            <ion-icon
              slot="start"
              name="book-outline"
              color="primary"
              class="bookmark-start-icon">
            </ion-icon>
            <ion-label class="ion-text-wrap bookmark-label">
              <h2 class="bookmark-chapter-title">{{ item.chapterTitle }}</h2>
              <p class="bookmark-book-subtitle">{{ item.bookTitle }}</p>
            </ion-label>
            <ion-button
              slot="end"
              fill="clear"
              color="danger"
              class="bookmark-delete-btn"
              aria-label="Remove Bookmark"
              (click)="removeBookmark($event, item.bookId, item.chapterId)">
              <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
            </ion-button>
          </ion-item>
        </ion-list>
      </ng-container>
    </ion-content>
  `,
  styles: [`
    .bookmarks-content {
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
    .empty-state {
      text-align: center;
      margin-top: 80px;
      color: var(--ion-color-medium);
      position: relative;
      z-index: 1;
    }
    .empty-icon {
      font-size: 3.5rem;
      color: var(--ion-color-primary);
      opacity: 0.5;
    }
    .bookmarks-list {
      border-radius: 14px;
      overflow: hidden;
      max-width: 760px;
      margin: 0 auto;
      background: transparent;
      position: relative;
      z-index: 1;
    }
    .bookmark-row-item {
      --background: var(--ion-card-background, #fff8ec);
    }
    .bookmark-start-icon {
      align-self: flex-start;
      margin-top: 14px;
      flex-shrink: 0;
    }
    .bookmark-delete-btn {
      align-self: flex-start;
      margin-top: 6px;
    }
    .bookmark-chapter-title {
      font-weight: 700;
      font-size: 1.02rem;
      line-height: 1.45;
      color: var(--ion-text-color);
    }
    .bookmark-book-subtitle {
      font-size: 0.85rem;
      line-height: 1.42;
      color: var(--ion-color-medium);
      margin-top: 2px;
    }
  `]
})
export class BookmarksPage implements OnInit {
  private router = inject(Router);
  private dataService = inject(DataService);
  private storageService = inject(StorageService);

  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public watermarkUrl$: Observable<string> = this.dataService.watermarkUrl$;
  public resolvedBookmarks$!: Observable<ResolvedBookmarkView[]>;

  constructor() {
    addIcons({ bookmarkOutline, trashOutline, bookOutline });
  }

  ngOnInit(): void {
    this.resolvedBookmarks$ = combineLatest([
      this.storageService.bookmarks$,
      this.dataService.visibleBooks$,
      this.storageService.selectedLanguage$
    ]).pipe(
      map(([bookmarks, books, lang]) => {
        const result: ResolvedBookmarkView[] = [];
        for (const entry of bookmarks) {
          const book = books.find(b => b.id === entry.bookId);
          if (book && (!book.chapters || book.chapters.length === 0)) {
            this.dataService.ensureBookChaptersLoaded(book.id).catch(() => {});
          }
          const chapter = book?.chapters?.find(c => c.id === entry.chapterId);
          if (book && chapter) {
            result.push({
              bookId: book.id,
              chapterId: chapter.id,
              bookTitle: this.dataService.localizeField(book.title, lang),
              chapterTitle: this.dataService.localizeField(chapter.title, lang),
              savedAtIso: entry.savedAtIso
            });
          }
        }
        return result;
      })
    );
  }

  public openBookmark(bookId: string, chapterId: string): void {
    this.router.navigate(['/reader', bookId, chapterId]);
  }

  public async removeBookmark(event: Event, bookId: string, chapterId: string): Promise<void> {
    event.stopPropagation();
    await this.storageService.removeBookmark(bookId, chapterId);
  }

  public trackByBookmark(_index: number, item: ResolvedBookmarkView): string {
    return `${item.bookId}_${item.chapterId}`;
  }
}