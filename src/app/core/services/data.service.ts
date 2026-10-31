import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, combineLatest, firstValueFrom, forkJoin, of } from 'rxjs';
import { map, filter, catchError } from 'rxjs/operators';
import { App, AppState } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { PluginListenerHandle } from '@capacitor/core';

import { environment } from '../../../environments/environment';
import {
  AppConfigPayload,
  AppIdentity,
  Book,
  Chapter,
  ChapterContentPayload,
  NotificationSchedule,
  SupportedLanguage,
  UiTranslations,
  AboutInfo
} from '../models/app-config.model';
import { ThemeService } from './theme.service';
import { StorageService } from './storage.service';
import { NotificationService } from './notification.service';

export interface SyncResult {
  success: boolean;
  message: string;
  statusCode?: number;
  data?: AppConfigPayload;
  isUpdated?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DataService implements OnDestroy {
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);
  private themeService = inject(ThemeService);
  private storageService = inject(StorageService);
  private notificationService = inject(NotificationService);

  private readonly CACHE_KEY = `app_manifest_${environment.clientKey}`;
  private readonly LAST_DAILY_SYNC_KEY = `app_last_daily_sync_${environment.clientKey}`;
  private readonly CHAPTER_CACHE_PREFIX = `app_chapter_${environment.clientKey}_`;

  private configSubject = new BehaviorSubject<AppConfigPayload | null>(null);
  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  private appStateListener?: PluginListenerHandle;

  // In-memory transcript cache for high performance
  private chapterTranscriptCache = new Map<string, Record<string, string>>();

  // Public Reactive Streams
  public readonly config$: Observable<AppConfigPayload> = this.configSubject.asObservable().pipe(
    filter((cfg): cfg is AppConfigPayload => cfg !== null)
  );
  public readonly isSyncing$: Observable<boolean> = this.isSyncingSubject.asObservable();

  public readonly identity$: Observable<AppIdentity> = this.config$.pipe(
    map(cfg => cfg.app_identity)
  );

  public readonly watermarkUrl$: Observable<string> = this.identity$.pipe(
    map(identity => {
      const url = identity?.watermarkUrl || identity?.logoUrl;
      return this.resolveMediaUrl(url);
    })
  );

  public readonly updateBanner$: Observable<string | null> = combineLatest([
    this.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, lang]) => {
      if (!cfg?.updateBannerMessage) return null;
      return this.localizeField(cfg.updateBannerMessage, lang) || null;
    })
  );

  public readonly enabledLanguages$: Observable<SupportedLanguage[]> = this.config$.pipe(
    map(cfg => (cfg.supportedLanguages || []).filter(lang => lang.isEnabled))
  );

  public readonly visibleBooks$: Observable<Book[]> = this.config$.pipe(
    map(cfg =>
      (cfg.books || [])
        .filter(book => book.isVisible)
        .sort((a, b) => a.order - b.order)
        .map(book => ({
          ...book,
          chapters: (book.chapters || [])
            .filter(ch => ch.isVisible)
            .sort((a, b) => a.order - b.order)
        }))
    )
  );

  public readonly uiText$: Observable<Record<string, string>> = combineLatest([
    this.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, langCode]) => this.resolveUiTranslations(cfg.ui_translations, langCode))
  );

  constructor() { }

  /**
   * ITEM 1: Once-Daily Startup with Cache-Clear Recovery
   */
  public async initialize(): Promise<void> {
    // 1. Instantly load local cache (0ms startup)
    const cachedConfig = await this.loadCachedConfig();
    if (cachedConfig) {
      this.applyAndPublishConfig(cachedConfig);
    } else {
      await this.ensureFallbackLoaded();
    }

    // 2. Perform daily sync check
    await this.syncIfDueToday();

    // 3. Re-check on app resume (e.g. across midnight)
    this.appStateListener = await App.addListener('appStateChange', async (state: AppState) => {
      if (state.isActive) {
        this.ngZone.run(async () => {
          await this.syncIfDueToday();
        });
      }
    });
  }

  /**
   * ITEM 1: Once-Daily Sync Gatekeeper with Automatic Cache-Clear Recovery
   * - If cache exists AND already updated today -> skips network.
   * - If cache was cleared manually -> FORCES remote fetch immediately.
   * - If first open today -> fetches remote updates and stamps today.
   */
  public async syncIfDueToday(force = false): Promise<SyncResult> {
    const today = new Date().toISOString().split('T')[0];
    const { value: lastSyncDate } = await Preferences.get({ key: this.LAST_DAILY_SYNC_KEY });
    const { value: cachedData } = await Preferences.get({ key: this.CACHE_KEY });

    const hasValidLocalCache = !!cachedData;

    // Only skip network if local cache exists AND was already updated today
    if (!force && hasValidLocalCache && lastSyncDate === today) {
      console.log(`[DataService] App already updated today (${today}) with local cache intact. Skipping network call.`);
      return { success: true, message: 'Already updated today', isUpdated: false };
    }

    console.log(`[DataService] Online sync triggered (Has Cache: ${hasValidLocalCache}, Last Sync: ${lastSyncDate || 'none'}, Today: ${today}). Fetching split version...`);
    const result = await this.syncWithRemote();
    if (result.success) {
      await Preferences.set({ key: this.LAST_DAILY_SYNC_KEY, value: today });
    }
    return result;
  }

  /**
   * ITEM 2: Remote Fetch Exclusively from the Split Version (Never data.json)
   * Fetches app_identity.json, supportedLanguages.json, ui_translations.json, books.json, etc. in parallel.
   */
  public async syncWithRemote(hardClearCache = false): Promise<SyncResult> {
    this.isSyncingSubject.next(true);

    let baseDir = (environment.firebaseConfigUrl || '').trim();
    if (!baseDir) {
      this.isSyncingSubject.next(false);
      return { success: false, message: 'No remote endpoint configured' };
    }

    if (!baseDir.endsWith('/')) {
      baseDir = `${baseDir}/`;
    }

    const cb = `_cb=${Date.now()}`;
    console.log('[DataService] Fetching split configuration from:', baseDir);

    try {
      const modular = await firstValueFrom(
        forkJoin({
          identity: this.http.get<AppIdentity>(`${baseDir}app_identity.json?${cb}`),
          languages: this.http.get<SupportedLanguage[]>(`${baseDir}supportedLanguages.json?${cb}`),
          ui: this.http.get<UiTranslations>(`${baseDir}ui_translations.json?${cb}`),
          books: this.http.get<Book[]>(`${baseDir}books.json?${cb}`),
          banner: this.http.get<Record<string, string>>(`${baseDir}updateBannerMessage.json?${cb}`).pipe(catchError(() => of({}))),
          about: this.http.get<AboutInfo>(`${baseDir}about_info.json?${cb}`).pipe(catchError(() => of({ description: {}, feedback_links: {} }))),
          schedules: this.http.get<NotificationSchedule[]>(`${baseDir}notification_schedules.json?${cb}`).pipe(catchError(() => of([])))
        })
      );

      if (modular.identity && Array.isArray(modular.books)) {
        const assembledConfig: AppConfigPayload = {
          schemaVersion: 2,
          lastUpdatedIso: new Date().toISOString(),
          app_identity: modular.identity,
          supportedLanguages: modular.languages,
          ui_translations: modular.ui,
          books: modular.books,
          updateBannerMessage: modular.banner,
          about_info: modular.about,
          notification_schedules: modular.schedules
        };

        if (hardClearCache) {
          await Preferences.remove({ key: this.CACHE_KEY });
        }

        await Preferences.set({
          key: this.CACHE_KEY,
          value: JSON.stringify(assembledConfig)
        });

        this.ngZone.run(() => {
          this.applyAndPublishConfig(assembledConfig);
        });

        this.isSyncingSubject.next(false);
        return {
          success: true,
          message: 'Updated to latest configuration from split JSONs',
          statusCode: 200,
          data: assembledConfig,
          isUpdated: true
        };
      }

      throw new Error('Split JSON files missing required identity or books array.');
    } catch (error: any) {
      this.isSyncingSubject.next(false);
      console.warn('[DataService] Remote split sync failed, continuing with cached content:', error?.message);
      return { success: false, message: 'Using offline cached content', statusCode: error?.status };
    }
  }

  public async syncWithFirebase(): Promise<SyncResult> {
    return this.syncWithRemote(true);
  }

  /**
   * Manual Cache Clearance & Instant Online Sync
   */
  public async clearCacheAndSync(): Promise<SyncResult> {
    console.log('[DataService] Manual cache clearance triggered. Wiping local storage and updating from online server...');
    await Preferences.remove({ key: this.CACHE_KEY });
    await Preferences.remove({ key: this.LAST_DAILY_SYNC_KEY });
    return this.syncWithRemote(true);
  }

  /**
   * ITEM 2: Modular On-Demand Chapter Transcript Loader
   * Loads from memory -> local persistent Preferences -> remote CDN/GitHub split file.
   */
  public async loadChapterTranscript(bookId: string, chapter: Chapter): Promise<Record<string, string>> {
    if (chapter.transcript && Object.keys(chapter.transcript).length > 0) {
      return chapter.transcript;
    }

    const cacheKey = `${this.CHAPTER_CACHE_PREFIX}${bookId}_${chapter.id}`;

    if (this.chapterTranscriptCache.has(cacheKey)) {
      return this.chapterTranscriptCache.get(cacheKey)!;
    }

    try {
      const { value } = await Preferences.get({ key: cacheKey });
      if (value) {
        const parsed = JSON.parse(value);
        this.chapterTranscriptCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {
      // Ignore cache read errors
    }

    // Automatically ensures the path targets mock/chapters/... matching your repository
    let relativePath = chapter.contentUrl || `mock/chapters/${bookId}/${chapter.id}.json`;
    if (!relativePath.startsWith('mock/') && !relativePath.startsWith('assets/mock/')) {
      relativePath = `mock/${relativePath}`;
    }

    const fullUrl = this.resolveMediaUrl(relativePath);

    try {
      console.log('[DataService] Loading modular chapter transcript:', fullUrl);
      const res = await firstValueFrom(this.http.get<ChapterContentPayload>(fullUrl));
      if (res && res.transcript) {
        await Preferences.set({
          key: cacheKey,
          value: JSON.stringify(res.transcript)
        });
        this.chapterTranscriptCache.set(cacheKey, res.transcript);
        return res.transcript;
      }
    } catch (err) {
      console.warn('[DataService] Failed to load modular transcript from:', fullUrl, err);
    }

    return {};
  }

  public resolveMediaUrl(urlOrPath: string | undefined): string {
    if (!urlOrPath) return '';
    let clean = urlOrPath.trim();

    if (clean.includes('github.com/') && clean.includes('/blob/')) {
      clean = clean
        .replace(/^https?:\/\/github\.com\//, 'https://raw.githubusercontent.com/')
        .replace('/blob/', '/');
      return clean;
    }

    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
      return clean;
    }

    const baseUrl = this.configSubject.value?.app_identity?.mediaBaseUrl;
    if (!baseUrl) return clean;

    let base = baseUrl.replace(/\/+$/, '');
    const sanitizedPath = clean.replace(/^\/+/, '');

    const isAudio = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'].some(ext => sanitizedPath.toLowerCase().endsWith(ext));
    if (isAudio && base.includes('cdn.jsdelivr.net/gh/')) {
      base = base
        .replace('https://cdn.jsdelivr.net/gh/', 'https://raw.githubusercontent.com/')
        .replace('@', '/');
    }

    return `${base}/${sanitizedPath}`;
  }

  public localizeField(fieldMap: Record<string, string> | undefined, langCode: string): string {
    if (!fieldMap) return '';
    return (
      fieldMap[langCode] ||
      fieldMap['en'] ||
      fieldMap['hi'] ||
      Object.values(fieldMap)[0] ||
      ''
    );
  }

  public getChapterStream(bookId: string, chapterId: string): Observable<{ book: Book; chapter: Chapter } | null> {
    return this.visibleBooks$.pipe(
      map(books => {
        const book = books.find(b => b.id === bookId);
        const chapter = book?.chapters.find(c => c.id === chapterId);
        return book && chapter ? { book, chapter } : null;
      })
    );
  }

  private applyAndPublishConfig(config: AppConfigPayload): void {
    const effectiveWatermark = config.app_identity.watermarkUrl || config.app_identity.logoUrl;
    const resolvedIdentity: AppIdentity = {
      ...config.app_identity,
      logoUrl: this.resolveMediaUrl(config.app_identity.logoUrl),
      watermarkUrl: this.resolveMediaUrl(effectiveWatermark)
    };
    this.themeService.applyAppIdentityTheme(resolvedIdentity);

    const currentLang = this.storageService.getCurrentLanguageSnapshot();
    const enabledCodes = (config.supportedLanguages || [])
      .filter(l => l.isEnabled)
      .map(l => l.code);

    if (currentLang && enabledCodes.length > 0 && !enabledCodes.includes(currentLang)) {
      this.storageService.setLanguage(enabledCodes[0]);
    }

    this.configSubject.next(config);

    const activeLang = this.storageService.getCurrentLanguageSnapshot() || 'hi';
    this.notificationService.rescheduleNotifications(
      config.notification_schedules || [],
      activeLang
    );
  }

  /**
   * ITEM 2: Offline Fallback Exclusively from Local Split Files (Never data.json)
   */
  private async ensureFallbackLoaded(): Promise<void> {
    if (this.configSubject.value) return;

    try {
      const fallback = await firstValueFrom(
        forkJoin({
          identity: this.http.get<AppIdentity>('assets/mock/app_identity.json'),
          languages: this.http.get<SupportedLanguage[]>('assets/mock/supportedLanguages.json'),
          ui: this.http.get<UiTranslations>('assets/mock/ui_translations.json'),
          books: this.http.get<Book[]>('assets/mock/books.json'),
          banner: this.http.get<Record<string, string>>('assets/mock/updateBannerMessage.json').pipe(catchError(() => of({}))),
          about: this.http.get<AboutInfo>('assets/mock/about_info.json').pipe(catchError(() => of({ description: {}, feedback_links: {} }))),
          schedules: this.http.get<NotificationSchedule[]>('assets/mock/notification_schedules.json').pipe(catchError(() => of([])))
        })
      );

      if (fallback.identity && Array.isArray(fallback.books)) {
        const assembledFallback: AppConfigPayload = {
          schemaVersion: 1,
          lastUpdatedIso: new Date().toISOString(),
          app_identity: fallback.identity,
          supportedLanguages: fallback.languages,
          ui_translations: fallback.ui,
          books: fallback.books,
          updateBannerMessage: fallback.banner,
          about_info: fallback.about,
          notification_schedules: fallback.schedules
        };

        this.ngZone.run(() => {
          this.applyAndPublishConfig(assembledFallback);
        });
      }
    } catch (err) {
      console.error('[DataService] Critical: Failed to load local split mock files.', err);
    }
  }

  private async loadCachedConfig(): Promise<AppConfigPayload | null> {
    try {
      const { value } = await Preferences.get({ key: this.CACHE_KEY });
      return value ? (JSON.parse(value) as AppConfigPayload) : null;
    } catch {
      return null;
    }
  }

  private resolveUiTranslations(
    translations: UiTranslations | undefined,
    langCode: string
  ): Record<string, string> {
    const resolved: Record<string, string> = {};
    if (!translations) return resolved;

    for (const [key, mapObj] of Object.entries(translations)) {
      resolved[key] = this.localizeField(mapObj, langCode);
    }
    return resolved;
  }

  ngOnDestroy(): void {
    this.appStateListener?.remove();
  }
}