import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App, AppState } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';

export type PlaybackMode = 'audio' | 'tts' | 'idle';

export interface PlayerState {
  mode: PlaybackMode;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  activeChunkText?: string;
}

export interface ChapterMediaMetadata {
  chapterId: string;
  chapterTitle?: string;
  bookTitle?: string;
  coverImageUrl?: string;
  langCode: string;
  ttsLocale: string;
  audioUrl: string;
  transcript: string;
}

@Injectable({
  providedIn: 'root'
})
export class TtsService implements OnDestroy {
  private readonly audioElement: HTMLAudioElement = new Audio();
  private ttsChunks: string[] = [];
  private currentChunkIndex = 0;
  private activeTtsLocale = 'hi-IN';
  private isTtsCancelled = false;
  private activeMetadata?: ChapterMediaMetadata;
  private currentPlayableUrl = '';
  private hasRetriedLowercase = false;

  private wakeLockSentinel: any = null;
  private appStateListener?: PluginListenerHandle;

  private stateSubject = new BehaviorSubject<PlayerState>({
    mode: 'idle',
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0
  });

  public readonly playerState$: Observable<PlayerState> = this.stateSubject.asObservable();

  constructor(private ngZone: NgZone) {
    this.audioElement.preload = 'auto';
    this.attachAudioListeners();
    this.setupAppVisibilityPauseListener();
  }

  private attachAudioListeners(): void {
    const audio = this.audioElement;

    const onMediaReady = () => {
      this.ngZone.run(() => {
        const dur = isFinite(audio.duration) && audio.duration > 0 ? Math.floor(audio.duration) : 0;
        this.patchState({ isLoading: false, duration: dur });
      });
    };

    audio.addEventListener('loadedmetadata', onMediaReady);
    audio.addEventListener('canplay', onMediaReady);
    audio.addEventListener('loadeddata', onMediaReady);

    audio.addEventListener('timeupdate', () => {
      this.ngZone.run(() => {
        this.patchState({ currentTime: Math.floor(audio.currentTime) });
      });
    });

    audio.addEventListener('ended', () => {
      this.ngZone.run(() => {
        this.patchState({ isPlaying: false, currentTime: 0 });
        this.releaseScreenWakeLock();
      });
    });

    audio.addEventListener('error', () => {
      if (this.currentPlayableUrl && /[A-Z]/.test(this.currentPlayableUrl) && !this.hasRetriedLowercase) {
        this.hasRetriedLowercase = true;
        const lowerUrl = this.currentPlayableUrl.toLowerCase();
        console.warn(`[TtsService] Audio failed with uppercase, retrying in lowercase: ${lowerUrl}`);
        audio.src = lowerUrl;
        audio.load();
        if (this.stateSubject.value.isPlaying) {
          audio.play().catch(() => {});
        }
        return;
      }

      this.ngZone.run(() => {
        console.warn(`[TtsService] Recorded audio unavailable for ${this.currentPlayableUrl}. Switching to TTS fallback.`);
        this.switchToTtsFallback();
      });
    });
  }

  public async loadChapterMedia(params: ChapterMediaMetadata, autoPlay = false): Promise<void> {
    const wasPlaying = this.stateSubject.value.isPlaying || autoPlay;
    await this.stop();

    this.activeMetadata = params;
    this.hasRetriedLowercase = false;
    const cleanAudioUrl = (params.audioUrl || '').trim();
    this.activeTtsLocale = params.ttsLocale || this.mapLangToLocale(params.langCode);
    this.ttsChunks = this.splitTranscriptIntoChunks(params.transcript || '');
    this.currentChunkIndex = 0;

    if (cleanAudioUrl.length > 0) {
      await this.setupRecordedAudio(params.chapterId, params.langCode, cleanAudioUrl, wasPlaying);
    } else {
      this.patchState({
        mode: 'tts',
        isPlaying: false,
        isLoading: false,
        currentTime: 0,
        duration: this.ttsChunks.length,
        activeChunkText: this.ttsChunks[0] || ''
      });
      if (wasPlaying) {
        await this.playTtsFromCurrentChunk();
      }
    }
  }

  private async setupRecordedAudio(
    chapterId: string,
    langCode: string,
    remoteUrl: string,
    autoPlay: boolean
  ): Promise<void> {
    this.patchState({
      mode: 'audio',
      isLoading: true,
      isPlaying: false,
      currentTime: 0,
      duration: 0
    });

    const playableUrl = await this.resolveOfflineOrRemoteAudioUrl(chapterId, langCode, remoteUrl);
    this.currentPlayableUrl = playableUrl;

    this.audioElement.src = playableUrl;
    this.audioElement.playbackRate = this.stateSubject.value.playbackRate;
    this.audioElement.load();

    if (autoPlay) {
      this.requestScreenWakeLock().catch(() => {});
      try {
        const playPromise = this.audioElement.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        this.patchState({ isPlaying: true, isLoading: false });
      } catch (err: any) {
        console.warn('[TtsService] Autoplay next chapter waiting for direct user tap:', err);
        this.patchState({ isPlaying: false, isLoading: false });
      }
    } else {
      setTimeout(() => {
        if (this.stateSubject.value.isLoading) {
          this.patchState({ isLoading: false });
        }
      }, 1000);
    }
  }

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
    this.requestScreenWakeLock().catch(() => {});

    if (state.mode === 'audio') {
      try {
        this.audioElement.playbackRate = state.playbackRate;
        const playPromise = this.audioElement.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        this.patchState({ isPlaying: true, isLoading: false });
      } catch (err: any) {
        console.warn('[TtsService] Audio play error:', err);
        if (err?.name !== 'AbortError') {
          this.patchState({ isPlaying: false, isLoading: false });
        }
      }
      return;
    }

    if (state.mode === 'tts') {
      await this.playTtsFromCurrentChunk();
    }
  }

  public async pause(): Promise<void> {
    const state = this.stateSubject.value;
    await this.releaseScreenWakeLock();

    if (state.mode === 'audio') {
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
    await this.releaseScreenWakeLock();

    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    await this.stopNativeTtsEngine();
    this.currentChunkIndex = 0;

    this.patchState({
      isPlaying: false,
      isLoading: false,
      currentTime: 0,
      activeChunkText: this.ttsChunks[0] || ''
    });
  }

  public async seekTo(value: number): Promise<void> {
    const state = this.stateSubject.value;

    if (state.mode === 'audio') {
      this.audioElement.currentTime = Math.min(Math.max(0, value), state.duration);
      this.patchState({ currentTime: Math.floor(this.audioElement.currentTime) });
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
    this.audioElement.playbackRate = rate;

    if (this.stateSubject.value.mode === 'tts' && this.stateSubject.value.isPlaying) {
      this.isTtsCancelled = true;
      await this.stopNativeTtsEngine();
      await this.playTtsFromCurrentChunk();
    }
  }

  private async requestScreenWakeLock(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
      } catch {
        // Ignore
      }
    }
  }

  private async releaseScreenWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch {
        // Ignore
      }
      this.wakeLockSentinel = null;
    }
  }

  private async setupAppVisibilityPauseListener(): Promise<void> {
    this.appStateListener = await App.addListener('appStateChange', (state: AppState) => {
      if (!state.isActive) {
        this.ngZone.run(() => {
          if (this.stateSubject.value.isPlaying) {
            this.pause();
          }
        });
      }
    });
  }

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
      if (stat.uri && stat.size && stat.size > 1000) {
        return Capacitor.convertFileSrc(stat.uri);
      }
    } catch {
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
      // Ignore
    }
  }

  private switchToTtsFallback(): void {
    this.audioElement.pause();
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
        await this.speakChunk(chunkText, this.activeTtsLocale, this.stateSubject.value.playbackRate);

        if (!this.isTtsCancelled) {
          this.currentChunkIndex++;
        }
      } catch (err) {
        if (!this.isTtsCancelled) {
          this.currentChunkIndex++;
        }
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
        this.releaseScreenWakeLock();
      });
    }
  }

  private speakChunk(text: string, lang: string, rate: number): Promise<void> {
    return new Promise(async (resolve) => {
      if (Capacitor.isNativePlatform()) {
        try {
          await TextToSpeech.speak({
            text,
            lang,
            rate,
            pitch: 1.0,
            volume: 1.0,
            category: 'ambient'
          });
          resolve();
          return;
        } catch {
          const shortLang = lang.split('-')[0];
          try {
            await TextToSpeech.speak({ text, lang: shortLang, rate, pitch: 1.0, volume: 1.0 });
            resolve();
            return;
          } catch {
            resolve();
            return;
          }
        }
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();

        window.speechSynthesis.speak(utterance);
        return;
      }

      resolve();
    });
  }

  private async stopNativeTtsEngine(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await TextToSpeech.stop();
      } catch {
        // Ignore
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private splitTranscriptIntoChunks(transcript: string): string[] {
    // Cross-platform chunk boundary splitting (safe for all iOS WebKit and Android versions without RegExp lookbehind)
    return transcript
      .replace(/([।॥.!?])\s+/g, '$1\n')
      .split(/\n+/g)
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
    this.appStateListener?.remove();
    this.stop();
  }
}