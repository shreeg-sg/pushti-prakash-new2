import { Component, OnInit, OnDestroy, inject } from '@angular/core';
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
  speedometerOutline,
  refreshOutline
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
      <div
        slot="fixed"
        class="watermark-overlay"
        [style.backgroundImage]="'url(' + ((watermarkUrl$ | async) || '') + ')'"
        aria-hidden="true">
      </div>

      <div class="reader-body" *ngIf="activeBook && activeChapter">
        <div class="book-breadcrumb">{{ localize(activeBook.title) }}</div>
        <h1 class="chapter-heading">{{ localize(activeChapter.title) }}</h1>

        <!-- Center-Aligned Chapter Header Images (1 After Another) -->
        <div class="chapter-images-list" *ngIf="chapterImages.length > 0 && !isLoadingTranscript">
          <div class="chapter-image-wrapper" *ngFor="let imgUrl of chapterImages">
            <img
              [src]="imgUrl"
              alt="Chapter Illustration"
              class="chapter-featured-img"
              loading="lazy"
              (error)="onImageLoadError(imgUrl)" />
          </div>
        </div>

        <!-- Loading State -->
        <div class="transcript-loading" *ngIf="isLoadingTranscript">
          <ion-spinner name="crescent" color="primary"></ion-spinner>
          <p class="loading-label">Loading sacred text...</p>
        </div>

        <!-- Error State with Retry -->
        <div class="transcript-error" *ngIf="!isLoadingTranscript && transcriptParagraphs.length === 0">
          <p class="error-msg">Unable to load chapter content from media server.</p>
          <ion-button fill="outline" color="primary" (click)="retryLoadTranscript()">
            <ion-icon slot="start" name="refresh-outline"></ion-icon>
            Tap to Retry
          </ion-button>
        </div>

        <!-- Text Content -->
        <div class="transcript-content" *ngIf="!isLoadingTranscript && transcriptParagraphs.length > 0">
          <p
            *ngFor="let paragraph of transcriptParagraphs"
            class="transcript-paragraph"
            [class.active-tts-chunk]="isChunkHighlighted(paragraph, (playerState$ | async))"
            [innerHTML]="paragraph">
          </p>
        </div>
      </div>
    </ion-content>

    <div class="floating-dock-wrapper" *ngIf="playerState$ | async as state">
      <div class="sticky-stepper-bar">
        <ion-button
          fill="solid"
          color="light"
          class="stepper-nav-btn"
          [disabled]="!prevChapterId"
          (click)="goToSiblingChapter(prevChapterId)">
          <ion-icon slot="start" name="play-skip-back-outline"></ion-icon>
          Prev Chapter
        </ion-button>

        <ion-button
          fill="solid"
          color="light"
          class="stepper-nav-btn"
          [disabled]="!nextChapterId"
          (click)="goToSiblingChapter(nextChapterId)">
          Next Chapter
          <ion-icon slot="end" name="play-skip-forward-outline"></ion-icon>
        </ion-button>
      </div>

      <div class="floating-audio-dock">
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
          (ionKnobMoveEnd)="onSeek($event)">
        </ion-range>

        <div class="player-controls-row">
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
            </ion-select>
          </div>

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
    </div>
  `,
  styles: [`
    .reader-transcript-container {
      --background: var(--ion-background-color, #fffdf9);
      position: relative;
    }

    .watermark-overlay {
      position: absolute;
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

    .reader-body {
      max-width: 780px;
      margin: 0 auto;
      padding-bottom: 230px;
      position: relative;
      z-index: 1;
    }

    .book-breadcrumb {
      font-size: 0.88rem;
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
      margin-bottom: 18px;
      color: var(--ion-text-color);
      border-bottom: 2px solid rgba(var(--ion-color-primary-rgb), 0.15);
      padding-bottom: 10px;
    }

    /* Center-Aligned Chapter Header Images */
    .chapter-images-list {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin: 10px auto 22px;
      width: 100%;
    }

    .chapter-image-wrapper {
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .chapter-featured-img {
      max-width: 100%;
      max-height: 380px;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.12);
      background: var(--ion-card-background, #fff8ec);
    }

    .transcript-loading,
    .transcript-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 0;
      color: var(--ion-color-medium);
      text-align: center;
    }

    .loading-label,
    .error-msg {
      margin-top: 12px;
      font-size: 0.95rem;
      font-weight: 500;
    }

    .transcript-paragraph {
      font-size: var(--app-reader-font-size, 1.08rem);
      line-height: var(--app-reader-line-height, 1.65);
      margin-top: 0;
      margin-bottom: 14px;
      padding: 6px 10px;
      border-radius: 8px;
      white-space: pre-line;
      transition: background-color 0.2s ease;
      background: transparent;
      user-select: text;
    }

    .active-tts-chunk {
      background-color: rgba(var(--ion-color-secondary-rgb), 0.25) !important;
      border-left: 4px solid var(--ion-color-primary);
    }

    .floating-dock-wrapper {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 20px;
      max-width: 680px;
      margin: 0 auto;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sticky-stepper-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.2);
      border-radius: 14px;
      padding: 6px 10px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
    }

    .stepper-nav-btn {
      --border-radius: 10px;
      font-weight: 700;
      font-size: 0.88rem;
      height: 44px;
      min-width: 125px;
    }

    .floating-audio-dock {
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.22);
      border-radius: 18px;
      padding: 12px 16px 10px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.15);
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
      padding: 5px 12px;
      border-radius: 12px;
      font-size: 0.78rem;
      font-weight: 700;
    }

    .time-counter {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ion-color-medium);
    }

    .player-scrub-bar {
      --bar-height: 5px;
      --knob-size: 24px;
      padding: 2px 0;
      margin: 2px 0;
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
      padding: 4px 10px;
      height: 38px;
    }

    .speed-icon {
      font-size: 1.1rem;
      color: var(--ion-color-primary);
      margin-right: 4px;
    }

    .speed-select-popover {
      --padding-start: 2px;
      --padding-end: 2px;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--ion-color-primary);
    }

    .primary-transport {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .play-pause-btn {
      width: 52px;
      height: 52px;
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
  public watermarkUrl$: Observable<string> = this.dataService.watermarkUrl$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public isBookmarked$!: Observable<boolean>;

  public activeBook?: Book;
  public activeChapter?: Chapter;
  public activeChapterTitle = '';
  public transcriptParagraphs: string[] = [];
  public chapterImages: string[] = [];
  public isLoadingTranscript = false;
  public prevChapterId?: string;
  public nextChapterId?: string;

  private currentLang = 'hi';
  private bookId = '';
  private chapterId = '';
  private routeMediaSub?: Subscription;
  private shouldAutoPlayNext = false;

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
      speedometerOutline,
      refreshOutline
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

        await this.loadChapterTextAndAudio(resolved.book, resolved.chapter, lang, ttsLocale);
      });
  }

  private async loadChapterTextAndAudio(
    book: Book,
    chapter: Chapter,
    lang: string,
    ttsLocale: string
  ): Promise<void> {
    this.isLoadingTranscript = true;
    const content = await this.dataService.loadChapterContent(book.id, chapter);
    this.isLoadingTranscript = false;

    // Resolve images
    this.chapterImages = (content.images || []).map(img => this.dataService.resolveMediaUrl(img));

    const rawTranscript = this.dataService.localizeField(content.transcript, lang);
    this.transcriptParagraphs = rawTranscript
      .split(/\n\s*\n/g)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const chapters = book.chapters;
    const idx = chapters.findIndex(c => c.id === chapter.id);
    this.prevChapterId = idx > 0 ? chapters[idx - 1].id : undefined;
    this.nextChapterId = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1].id : undefined;

    const rawAudioUrl = this.dataService.localizeField(chapter.audioUrl, lang);
    const resolvedAudioUrl = this.dataService.resolveMediaUrl(rawAudioUrl);
    const resolvedCoverUrl = this.dataService.resolveMediaUrl(book.coverImageUrl);

    await this.ttsService.loadChapterMedia(
      {
        chapterId: chapter.id,
        chapterTitle: this.activeChapterTitle,
        bookTitle: this.dataService.localizeField(book.title, lang),
        coverImageUrl: resolvedCoverUrl,
        langCode: lang,
        ttsLocale,
        audioUrl: resolvedAudioUrl,
        transcript: rawTranscript
      },
      this.shouldAutoPlayNext
    );
    this.shouldAutoPlayNext = false;
  }

  public onImageLoadError(failedUrl: string): void {
    console.warn('[ReaderPage] Could not load image from:', failedUrl);
    this.chapterImages = this.chapterImages.filter(url => url !== failedUrl);
  }

  public async retryLoadTranscript(): Promise<void> {
    if (this.activeBook && this.activeChapter) {
      const lang = this.currentLang;
      const ttsLocale = `${lang}-IN`;
      await this.loadChapterTextAndAudio(this.activeBook, this.activeChapter, lang, ttsLocale);
    }
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

  public async goToSiblingChapter(targetChapterId?: string): Promise<void> {
    if (!targetChapterId || !this.bookId) return;

    const currentState = await firstValueFrom(this.playerState$);
    this.shouldAutoPlayNext = currentState.isPlaying;

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