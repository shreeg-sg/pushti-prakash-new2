import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export type PlaybackMode = 'audio' | 'tts' | 'idle';

export interface PlayerState {
  mode: PlaybackMode;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;     // Seconds (for 'audio') or current chunk index (for 'tts')
  duration: number;        // Total seconds (for 'audio') or total chunks (for 'tts')
  playbackRate: number;    // e.g., 0.85, 1.0, 1.25, 1.5
  activeChunkText?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TtsService implements OnDestroy {
  private audioElement: HTMLAudioElement | null = null;
  private ttsChunks: string[] = [];
  private currentChunkIndex = 0;
  private activeTtsLocale = 'hi-IN';
  private isTtsCancelled = false;

  private stateSubject = new BehaviorSubject<PlayerState>({
    mode: 'idle',
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0
  });

  public readonly playerState$: Observable<PlayerState> = this.stateSubject.asObservable();

  constructor(private ngZone: NgZone) {}

  /**
   * Initializes playback source for the active chapter and language.
   * Uses recorded audio if `audioUrl` is non-empty; otherwise prepares native TTS chunks.
   */
  public async loadChapterMedia(params: {
    chapterId: string;
    langCode: string;
    ttsLocale: string;
    audioUrl: string;
    transcript: string;
  }): Promise<void> {
    await this.stop();

    const cleanAudioUrl = (params.audioUrl || '').trim();
    this.activeTtsLocale = params.ttsLocale || this.mapLangToLocale(params.langCode);
    this.ttsChunks = this.splitTranscriptIntoChunks(params.transcript || '');
    this.currentChunkIndex = 0;

    if (cleanAudioUrl.length > 0) {
      await this.setupRecordedAudio(params.chapterId, params.langCode, cleanAudioUrl);
    } else {
      this.patchState({
        mode: 'tts',
        isPlaying: false,
        isLoading: false,
        currentTime: 0,
        duration: this.ttsChunks.length,
        activeChunkText: this.ttsChunks[0] || ''
      });
    }
  }

  /**
   * Toggles Play / Pause for whichever mode ('audio' or 'tts') is currently active.
   */
  public async togglePlayPause(): Promise<void> {
    const state = this.stateSubject.value;
    if (state.isPlaying) {
      await this.pause();
    } else {
      await this.play();
    }
  }

  public async play(): Promise<void> {
    const state = this.stateSubject.value;

    if (state.mode === 'audio' && this.audioElement) {
      try {
        this.audioElement.playbackRate = state.playbackRate;
        await this.audioElement.play();
        this.patchState({ isPlaying: true });
      } catch (err) {
        console.warn('[TtsService] Audio playback failed, falling back to native TTS:', err);
        this.switchToTtsFallback();
        await this.playTtsFromCurrentChunk();
      }
      return;
    }

    if (state.mode === 'tts') {
      await this.playTtsFromCurrentChunk();
    }
  }

  public async pause(): Promise<void> {
    const state = this.stateSubject.value;

    if (state.mode === 'audio' && this.audioElement) {
      this.audioElement.pause();
      this.patchState({ isPlaying: false });
      return;
    }

    if (state.mode === 'tts') {
      this.isTtsCancelled = true;
      await this.stopNativeTtsEngine();
      this.patchState({ isPlaying: false });
    }
  }

  public async stop(): Promise<void> {
    this.isTtsCancelled = true;

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.src = '';
      this.audioElement = null;
    }

    await this.stopNativeTtsEngine();
    this.currentChunkIndex = 0;

    this.patchState({
      isPlaying: false,
      isLoading: false,
      currentTime: 0,
      activeChunkText: this.ttsChunks[0] || ''
    });
  }

  /**
   * Seeks to a specific second (in 'audio' mode) or sentence chunk index (in 'tts' mode).
   */
  public async seekTo(value: number): Promise<void> {
    const state = this.stateSubject.value;

    if (state.mode === 'audio' && this.audioElement) {
      this.audioElement.currentTime = Math.min(Math.max(0, value), state.duration);
      this.patchState({ currentTime: this.audioElement.currentTime });
      return;
    }

    if (state.mode === 'tts') {
      const targetIndex = Math.min(
        Math.max(0, Math.floor(value)),
        Math.max(0, this.ttsChunks.length - 1)
      );
      const wasPlaying = state.isPlaying;
      this.isTtsCancelled = true;
      await this.stopNativeTtsEngine();

      this.currentChunkIndex = targetIndex;
      this.patchState({
        currentTime: targetIndex,
        activeChunkText: this.ttsChunks[targetIndex] || ''
      });

      if (wasPlaying) {
        await this.playTtsFromCurrentChunk();
      }
    }
  }

  public async setPlaybackRate(rate: number): Promise<void> {
    this.patchState({ playbackRate: rate });

    if (this.audioElement) {
      this.audioElement.playbackRate = rate;
    } else if (this.stateSubject.value.mode === 'tts' && this.stateSubject.value.isPlaying) {
      // Restart current TTS chunk with updated playback speed
      this.isTtsCancelled = true;
      await this.stopNativeTtsEngine();
      await this.playTtsFromCurrentChunk();
    }
  }

  // --- Internal Audio & Offline Caching Logic ---

  private async setupRecordedAudio(
    chapterId: string,
    langCode: string,
    remoteUrl: string
  ): Promise<void> {
    this.patchState({ mode: 'audio', isLoading: true, isPlaying: false, currentTime: 0, duration: 0 });

    const playableUrl = await this.resolveOfflineOrRemoteAudioUrl(chapterId, langCode, remoteUrl);
    const audio = new Audio(playableUrl);
    this.audioElement = audio;

    audio.addEventListener('loadedmetadata', () => {
      this.ngZone.run(() => {
        this.patchState({
          isLoading: false,
          duration: isFinite(audio.duration) ? Math.floor(audio.duration) : 0
        });
      });
    });

    audio.addEventListener('timeupdate', () => {
      this.ngZone.run(() => {
        this.patchState({ currentTime: Math.floor(audio.currentTime) });
      });
    });

    audio.addEventListener('ended', () => {
      this.ngZone.run(() => {
        this.patchState({ isPlaying: false, currentTime: 0 });
      });
    });

    audio.addEventListener('error', () => {
      this.ngZone.run(() => {
        console.warn('[TtsService] Audio stream error; switching automatically to native TTS.');
        this.switchToTtsFallback();
      });
    });
  }

  /**
   * Checks if the MP3 is already cached in Capacitor Filesystem (`Directory.Data`).
   * If not cached and online, caches it in the background for offline reading.
   */
  private async resolveOfflineOrRemoteAudioUrl(
    chapterId: string,
    langCode: string,
    remoteUrl: string
  ): Promise<string> {
    if (!Capacitor.isNativePlatform()) {
      return remoteUrl;
    }

    const filePath = `audio_cache/${chapterId}_${langCode}.mp3`;
    try {
      const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
      if (stat.uri) {
        return Capacitor.convertFileSrc(stat.uri);
      }
    } catch {
      // File not cached yet; cache asynchronously in background
      this.cacheAudioInBackground(filePath, remoteUrl);
    }
    return remoteUrl;
  }

  private async cacheAudioInBackground(filePath: string, remoteUrl: string): Promise<void> {
    try {
      await Filesystem.downloadFile({
        path: filePath,
        directory: Directory.Data,
        url: remoteUrl,
        recursive: true
      });
    } catch {
      // Ignore background download failure when offline
    }
  }

  // --- Internal Native TTS Logic ---

  private switchToTtsFallback(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    this.patchState({
      mode: 'tts',
      isLoading: false,
      isPlaying: false,
      currentTime: this.currentChunkIndex,
      duration: this.ttsChunks.length,
      activeChunkText: this.ttsChunks[this.currentChunkIndex] || ''
    });
  }

  private async playTtsFromCurrentChunk(): Promise<void> {
    if (this.ttsChunks.length === 0) return;

    this.isTtsCancelled = false;
    this.patchState({ mode: 'tts', isPlaying: true });

    while (this.currentChunkIndex < this.ttsChunks.length && !this.isTtsCancelled) {
      const chunkText = this.ttsChunks[this.currentChunkIndex];
      this.ngZone.run(() => {
        this.patchState({
          currentTime: this.currentChunkIndex,
          activeChunkText: chunkText
        });
      });

      try {
        await TextToSpeech.speak({
          text: chunkText,
          lang: this.activeTtsLocale,
          rate: this.stateSubject.value.playbackRate,
          pitch: 1.0,
          volume: 1.0,
          category: 'playback'
        });

        if (!this.isTtsCancelled) {
          this.currentChunkIndex++;
        }
      } catch (err) {
        console.warn('[TtsService] Native TTS speak interrupted or failed:', err);
        break;
      }
    }

    if (!this.isTtsCancelled && this.currentChunkIndex >= this.ttsChunks.length) {
      this.currentChunkIndex = 0;
      this.ngZone.run(() => {
        this.patchState({
          isPlaying: false,
          currentTime: 0,
          activeChunkText: this.ttsChunks[0] || ''
        });
      });
    }
  }

  private async stopNativeTtsEngine(): Promise<void> {
    try {
      await TextToSpeech.stop();
    } catch {
      // Ignore if TTS engine was not actively speaking
    }
  }

  private splitTranscriptIntoChunks(transcript: string): string[] {
    return transcript
      .split(/\n+|(?<=[।॥.!?])\s+/g)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private mapLangToLocale(langCode: string): string {
    const map: Record<string, string> = {
      hi: 'hi-IN',
      gu: 'gu-IN',
      mr: 'mr-IN',
      en: 'en-IN'
    };
    return map[langCode] || 'hi-IN';
  }

  private patchState(partial: Partial<PlayerState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...partial
    });
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
