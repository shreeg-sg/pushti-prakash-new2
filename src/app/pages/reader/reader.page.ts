import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonRange,
  IonBadge,
  IonSpinner,
  IonSelect,
  IonSelectOption,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  star,
  starOutline,
  play,
  pause,
  volumeHighOutline,
  micOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  speedometerOutline
} from 'ionicons/icons';
import { Observable, Subscription, combineLatest, firstValueFrom } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { TtsService, PlayerState } from '../../core/services/tts.service';
import { Book, Chapter } from '../../core/models/app-config.model';

@Component({
  selector: 'app-reader',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    IonContent,
    IonButton,
    IonIcon,
    IonRange,
    IonBadge,
    IonSpinner,
    IonSelect,
    IonSelectOption
  ],
  template: `
    <app-header [pageTitle]="activeChapterTitle">
      <ion-button
        headerEndActions
        (click)="onToggleBookmark()"
        aria-label="Toggle Bookmark">
        <ion-icon
          slot="icon-only"
          [name]="(isBookmarked$ | async) ? 'star' : 'star-outline'"
          [style.color]="(isBookmarked$ | async) ? '#FFD700' : '#FFFFFF'">
        </ion-icon>
      </ion-button>
    </app-header>

    <ion-content class="ion-padding reader-transcript-container">
      <!-- Watermark Background Emblem (12% opacity behind stotras) -->
      <div class="watermark-overlay" aria-hidden="true"></div>

      <div class="reader-body" *ngIf="activeBook && activeChapter">
        <div class="book-breadcrumb">{{ localize(activeBook.title) }}</div>
        <h1 class="chapter-heading">{{ localize(activeChapter.title) }}</h1>

        <!-- Loading spinner while on-demand transcript loads from split JSON -->
        <div class="transcript-loading" *ngIf="isLoadingTranscript">
          <ion-spinner name="crescent" color="primary"></ion-spinner>
          <p class="loading-label">Loading sacred text...</p>
        </div>

        <!-- Sacred Transcript: Completely protected from text selection and copying -->
        <div class="transcript-content" *ngIf="!isLoadingTranscript">
          <p
            *ngFor="let paragraph of transcriptParagraphs"
            class="transcript-paragraph"
            [class.active-tts-chunk]="isChunkHighlighted(paragraph, (playerState$ | async))">
            {{ paragraph }}
          </p>
        </div>

        <!-- Previous / Next Chapter Stepper Navigation -->
        <div class="chapter-step-nav">
          <ion-button
            fill="outline"
            size="small"
            [disabled]="!prevChapterId"
            (click)="goToSiblingChapter(prevChapterId)">
            <ion-icon slot="start" name="play-skip-back-outline"></ion-icon>
            Prev
          </ion-button>

          <ion-button
            fill="outline"
            size="small"
            [disabled]="!nextChapterId"
            (click)="goToSiblingChapter(nextChapterId)">
            Next
            <ion-icon slot="end" name="play-skip-forward-outline"></ion-icon>
          </ion-button>
        </div>
      </div>
    </ion-content>

    <!-- Floating Audio/TTS Player Dock with Screen-Awake Integration -->
    <div class="floating-audio-dock" *ngIf="playerState$ | async as state">
      <div class="player-meta-row">
        <ion-badge [color]="state.mode === 'audio' ? 'secondary' : 'tertiary'" class="mode-badge">
          <ion-icon [name]="state.mode === 'audio' ? 'volume-high-outline' : 'mic-outline'"></ion-icon>
          <span>
            {{
              state.mode === 'audio'
                ? ((uiText$ | async)?.['audio_playing_recorded'] || 'Recorded Audio')
                : ((uiText$ | async)?.['audio_playing_tts'] || 'Text-to-Speech (TTS)')
            }}
          </span>
        </ion-badge>

        <span class="time-counter" *ngIf="state.mode === 'audio'">
          {{ formatSeconds(state.currentTime) }} / {{ formatSeconds(state.duration) }}
        </span>
        <span class="time-counter" *ngIf="state.mode === 'tts'">
          {{ state.currentTime + 1 }} / {{ state.duration || 1 }}
        </span>
      </div>

      <ion-range
        class="player-scrub-bar"
        [min]="0"
        [max]="state.duration > 0 ? state.duration : 1"
        [value]="state.currentTime"
        (ionChange)="onSeek($event)">
      </ion-range>

      <div class="player-controls-row">
        <!-- Speed Picker with Clean Popover List -->
        <div class="speed-picker-wrapper">
          <ion-icon name="speedometer-outline" class="speed-icon"></ion-icon>
          <ion-select
            interface="popover"
            [value]="state.playbackRate"
            (ionChange)="onSpeedSelected($event.detail.value)"
            class="speed-select-popover"
            aria-label="Playback Speed">
            <ion-select-option [value]="0.75">0.75x</ion-select-option>
            <ion-select-option [value]="0.85">0.85x</ion-select-option>
            <ion-select-option [value]="1.0">1.0x (Normal)</ion-select-option>
            <ion-select-option [value]="1.25">1.25x</ion-select-option>
            <ion-select-option [value]="1.5">1.5x</ion-select-option>
            <ion-select-option [value]="1.75">1.75x</ion-select-option>
            <ion-select-option [value]="2.0">2.0x</ion-select-option>
          </ion-select>
        </div>

        <!-- Primary Play/Pause Button (Keeps screen awake while playing) -->
        <div class="primary-transport">
          <ion-button
            shape="round"
            color="primary"
            class="play-pause-btn"
            [disabled]="state.isLoading"
            (click)="ttsService.togglePlayPause()">
            <ion-spinner *ngIf="state.isLoading" name="crescent"></ion-spinner>
            <ion-icon
              *ngIf="!state.isLoading"
              slot="icon-only"
              [name]="state.isPlaying ? 'pause' : 'play'">
            </ion-icon>
          </ion-button>
        </div>

        <div class="transport-spacer-right"></div>
      </div>
    </div>
  `,
  styles: [`
    /* Anti-Copy & Text-Protection Shield */
    .reader-transcript-container,
    .reader-body,
    .transcript-content,
    .transcript-paragraph,
    .chapter-heading,
    .book-breadcrumb {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
    }

    .reader-transcript-container {
      position: relative;
    }

    .watermark-overlay {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 280px;
      height: 280px;
      background-image: var(--app-watermark-image, none);
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      opacity: 0.12;
      pointer-events: none;
      z-index: 0;
    }

    .reader-body {
      max-width: 780px;
      margin: 0 auto;
      padding-bottom: 155px;
      position: relative;
      z-index: 1;
    }

    .book-breadcrumb {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--ion-color-primary);
      margin-bottom: 4px;
    }

    .chapter-heading {
      font-size: 1.45rem;
      font-weight: 800;
      margin-top: 0;
      margin-bottom: 20px;
      color: var(--ion-text-color);
      border-bottom: 2px solid rgba(var(--ion-color-primary-rgb), 0.15);
      padding-bottom: 10px;
    }

    .transcript-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 0;
      color: var(--ion-color-medium);
    }

    .loading-label {
      margin-top: 10px;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .transcript-paragraph {
      font-size: var(--app-reader-font-size, 1.05rem);
      line-height: var(--app-reader-line-height, 1.65);
      margin-bottom: 16px;
      white-space: pre-line;
      padding: 6px 8px;
      border-radius: 8px;
      transition: background-color 0.2s ease;
    }

    .active-tts-chunk {
      background-color: rgba(var(--ion-color-secondary-rgb), 0.25);
      border-left: 3px solid var(--ion-color-primary);
    }

    .chapter-step-nav {
      display: flex;
      justify-content: space-between;
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }

    .floating-audio-dock {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 24px;
      max-width: 680px;
      margin: 0 auto;
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.22);
      border-radius: 18px;
      padding: 10px 16px 8px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.15);
      z-index: 100;
    }

    .player-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .mode-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
    }

    .time-counter {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--ion-color-medium);
    }

    .player-scrub-bar {
      --bar-height: 4px;
      --knob-size: 14px;
      padding-top: 0;
      padding-bottom: 0;
      margin: -4px 0;
    }

    .player-controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .speed-picker-wrapper {
      display: flex;
      align-items: center;
      background: rgba(var(--ion-color-primary-rgb), 0.08);
      border-radius: 14px;
      padding: 2px 8px;
    }

    .speed-icon {
      font-size: 1rem;
      color: var(--ion-color-primary);
      margin-right: 2px;
    }

    .speed-select-popover {
      --padding-start: 2px;
      --padding-end: 2px;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--ion-color-primary);
      min-height: 32px;
    }

    .primary-transport {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .play-pause-btn {
      width: 48px;
      height: 48px;
      --border-radius: 50%;
    }

    .transport-spacer-right {
      width: 76px;
    }
  `]
})
export class ReaderPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);
  public ttsService = inject(TtsService);

  public playerState$: Observable<PlayerState> = this.ttsService.playerState$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public isBookmarked$!: Observable<boolean>;

  public activeBook?: Book;
  public activeChapter?: Chapter;
  public activeChapterTitle = '';
  public transcriptParagraphs: string[] = [];
  public isLoadingTranscript = false;
  public prevChapterId?: string;
  public nextChapterId?: string;

  private currentLang = 'hi';
  private bookId = '';
  private chapterId = '';
  private routeMediaSub?: Subscription;

  // Intercept and block all mobile long-press menus, clipboard copying, cutting, and dragging
  @HostListener('contextmenu', ['$event'])
  @HostListener('copy', ['$event'])
  @HostListener('cut', ['$event'])
  @HostListener('paste', ['$event'])
  @HostListener('selectstart', ['$event'])
  public blockCopyPaste(event: Event): void {
    event.preventDefault();
  }

  constructor() {
    addIcons({
      star,
      starOutline,
      play,
      pause,
      volumeHighOutline,
      micOutline,
      playSkipBackOutline,
      playSkipForwardOutline,
      speedometerOutline
    });
  }

  ngOnInit(): void {
    this.routeMediaSub = combineLatest([
      this.route.paramMap,
      this.storageService.selectedLanguage$,
      this.dataService.enabledLanguages$
    ])
      .pipe(
        switchMap(([params, lang, enabledLangs]) => {
          this.bookId = params.get('bookId') || '';
          this.chapterId = params.get('chapterId') || '';
          this.currentLang = lang;
          this.isBookmarked$ = this.storageService.isChapterBookmarked$(
            this.bookId,
            this.chapterId
          );

          const langMeta = enabledLangs.find(l => l.code === lang);
          const ttsLocale = langMeta?.ttsLocale || `${lang}-IN`;

          return this.dataService.getChapterStream(this.bookId, this.chapterId).pipe(
            map(resolved => ({ resolved, lang, ttsLocale }))
          );
        })
      )
      .subscribe(async ({ resolved, lang, ttsLocale }) => {
        if (!resolved) return;

        this.activeBook = resolved.book;
        this.activeChapter = resolved.chapter;
        this.activeChapterTitle = this.dataService.localizeField(resolved.chapter.title, lang);

        // Loads on-demand modular transcript from split JSONs (chapters/{bookId}/{chapterId}.json)
        this.isLoadingTranscript = true;
        const transcriptMap = await this.dataService.loadChapterTranscript(this.bookId, resolved.chapter);
        this.isLoadingTranscript = false;

        const rawTranscript = this.dataService.localizeField(transcriptMap, lang);
        this.transcriptParagraphs = rawTranscript
          .split(/\n\s*\n|\n/g)
          .map(p => p.trim())
          .filter(p => p.length > 0);

        const chapters = resolved.book.chapters;
        const idx = chapters.findIndex(c => c.id === resolved.chapter.id);
        this.prevChapterId = idx > 0 ? chapters[idx - 1].id : undefined;
        this.nextChapterId = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1].id : undefined;

        const rawAudioUrl = this.dataService.localizeField(resolved.chapter.audioUrl, lang);
        const resolvedAudioUrl = this.dataService.resolveMediaUrl(rawAudioUrl);
        const resolvedCoverUrl = this.dataService.resolveMediaUrl(resolved.book.coverImageUrl);

        await this.ttsService.loadChapterMedia({
          chapterId: resolved.chapter.id,
          chapterTitle: this.activeChapterTitle,
          bookTitle: this.dataService.localizeField(resolved.book.title, lang),
          coverImageUrl: resolvedCoverUrl,
          langCode: lang,
          ttsLocale,
          audioUrl: resolvedAudioUrl,
          transcript: rawTranscript
        });
      });
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public async onToggleBookmark(): Promise<void> {
    if (!this.bookId || !this.chapterId) return;

    const isAdded = await this.storageService.toggleBookmark(this.bookId, this.chapterId);
    const uiText = await firstValueFrom(this.dataService.uiText$);
    const message = isAdded
      ? uiText['bookmark_added'] || 'Added to Bookmarks'
      : uiText['bookmark_removed'] || 'Removed from Bookmarks';

    const toast = await this.toastCtrl.create({
      message,
      duration: 1600,
      position: 'top',
      color: isAdded ? 'success' : 'medium'
    });
    await toast.present();
  }

  public onSeek(event: CustomEvent): void {
    const val = Number(event.detail.value);
    if (!isNaN(val)) {
      this.ttsService.seekTo(val);
    }
  }

  public onSpeedSelected(rate: number): void {
    if (rate) {
      this.ttsService.setPlaybackRate(Number(rate));
    }
  }

  public isChunkHighlighted(paragraph: string, state: PlayerState | null): boolean {
    if (!state || state.mode !== 'tts' || !state.isPlaying || !state.activeChunkText) {
      return false;
    }
    return paragraph.includes(state.activeChunkText);
  }

  public goToSiblingChapter(targetChapterId?: string): void {
    if (!targetChapterId || !this.bookId) return;
    this.router.navigate(['/reader', this.bookId, targetChapterId], { replaceUrl: true });
  }

  public formatSeconds(sec: number): string {
    if (!sec || sec < 0) return '0:00';
    const mins = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${mins}:${rem.toString().padStart(2, '0')}`;
  }

  ngOnDestroy(): void {
    this.routeMediaSub?.unsubscribe();
    this.ttsService.stop();
  }
}