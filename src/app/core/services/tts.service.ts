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
  currentTime: number; // Seconds (for 'audio') or current chunk index (for 'tts')
  duration: number; // Total seconds (for 'audio') or total chunks (for 'tts')
  playbackRate: number; // e.g., 0.75, 1.0, 1.25, 1.5, 2.0
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
   * If audioUrl is non-empty, attempts to load recorded MP3.
   * If audioUrl is empty or fails to load, prepares TTS sentence chunks.
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
        console.warn('[TtsService] Audio play error; switching to TTS fallback:', err);
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

  public async seekTo(value: number): Promise<void> {
    const state = this.stateSubject.value;

    if (state.mode === 'audio' && this.audioElement) {
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

    if (this.audioElement) {
      this.audioElement.playbackRate = rate;
    } else if (this.stateSubject.value.mode === 'tts' && this.stateSubject.value.isPlaying) {
      this.isTtsCancelled = true;
      await this.stopNativeTtsEngine();
      await this.playTtsFromCurrentChunk();
    }
  }

  // --- Internal Audio Logic ---

  private async setupRecordedAudio(
    chapterId: string,
    langCode: string,
    remoteUrl: string
  ): Promise<void> {
    this.patchState({ mode: 'audio', isLoading: true, isPlaying: false, currentTime: 0, duration: 0 });

    const playableUrl = await this.resolveOfflineOrRemoteAudioUrl(chapterId, langCode, remoteUrl);
    console.log('[TtsService] Loading recorded audio from:', playableUrl);

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }

    const audio = new Audio();
    audio.src = playableUrl;
    audio.preload = 'metadata';
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

    audio.addEventListener('error', (err) => {
      this.ngZone.run(() => {
        console.warn(`[TtsService] Audio stream failed for ${playableUrl}. Switching to TTS fallback.`, err);
        this.switchToTtsFallback();
      });
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
      if (stat.uri) {
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
      // Ignore background download failure
    }
  }

  // --- Internal TTS Engine (Dual Web Speech API + Capacitor Native Engine) ---

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
        await this.speakChunk(chunkText, this.activeTtsLocale, this.stateSubject.value.playbackRate);

        if (!this.isTtsCancelled) {
          this.currentChunkIndex++;
        }
      } catch (err) {
        console.warn('[TtsService] Chunk speak interrupted or failed:', err);
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
      });
    }
  }

  /**
   * Dual-Engine Speech Synthesizer:
   * - Browser / Web: Uses window.speechSynthesis (Web Speech API)
   * - Android / iOS: Uses Capacitor TextToSpeech plugin with automatic locale fallback
   */
  private speakChunk(text: string, lang: string, rate: number): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // 1. Native Android / iOS Device
      if (Capacitor.isNativePlatform()) {
        try {
          await TextToSpeech.speak({
            text,
            lang,
            rate,
            pitch: 1.0,
            volume: 1.0,
            category: 'playback'
          });
          resolve();
          return;
        } catch (nativeErr) {
          console.warn('[TtsService] Native TTS error, retrying with base language code:', nativeErr);
          const shortLang = lang.split('-')[0];
          try {
            await TextToSpeech.speak({ text, lang: shortLang, rate, pitch: 1.0, volume: 1.0 });
            resolve();
            return;
          } catch {
            resolve(); // Do not break the reading loop
            return;
          }
        }
      }

      // 2. Web Browser (ionic serve / ng serve)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;

        utterance.onend = () => {
          resolve();
        };

        utterance.onerror = (e) => {
          console.warn('[TtsService] Web Speech utterance error:', e);
          resolve(); // Resolve so the loop continues
        };

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