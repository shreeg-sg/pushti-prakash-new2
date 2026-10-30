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

    <ion-content class="ion-padding reader-transcript-container">
      <ng-container *ngIf="resolvedBookmarks$ | async as items">
        <!-- Empty State -->
        <div class="empty-state" *ngIf="items.length === 0">
          <ion-icon name="bookmark-outline" class="empty-icon"></ion-icon>
          <p>{{ (uiText$ | async)?.['empty_bookmarks'] || 'No chapters bookmarked yet.' }}</p>
        </div>

        <!-- Bookmarked Chapters List -->
        <ion-list lines="full" class="bookmarks-list" *ngIf="items.length > 0">
          <ion-item
            *ngFor="let item of items"
            button
            detail="true"
            (click)="openBookmark(item.bookId, item.chapterId)">
            <ion-icon slot="start" name="book-outline" color="primary"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2 class="bookmark-chapter-title">{{ item.chapterTitle }}</h2>
              <p class="bookmark-book-subtitle">{{ item.bookTitle }}</p>
            </ion-label>
            <ion-button
              slot="end"
              fill="clear"
              color="danger"
              (click)="removeBookmark($event, item.bookId, item.chapterId)">
              <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
            </ion-button>
          </ion-item>
        </ion-list>
      </ng-container>
    </ion-content>
  `,
  styles: [`
    .empty-state {
      text-align: center;
      margin-top: 80px;
      color: var(--ion-color-medium);
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
    }
    .bookmark-chapter-title {
      font-weight: 700;
      font-size: 1.02rem;
    }
    .bookmark-book-subtitle {
      font-size: 0.85rem;
      margin-top: 2px;
    }
  `]
})
export class BookmarksPage implements OnInit {
  private router = inject(Router);
  private dataService = inject(DataService);
  private storageService = inject(StorageService);

  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
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
          const chapter = book?.chapters.find(c => c.id === entry.chapterId);
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
}