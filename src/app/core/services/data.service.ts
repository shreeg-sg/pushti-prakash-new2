import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, combineLatest, firstValueFrom } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { App, AppState } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { PluginListenerHandle } from '@capacitor/core';

import { environment } from '../../../environments/environment';
import {
  AppConfigPayload,
  AppIdentity,
  Book,
  Chapter,
  SupportedLanguage,
  UiTranslations
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

  private configSubject = new BehaviorSubject<AppConfigPayload | null>(null);
  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  private appStateListener?: PluginListenerHandle;

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

  constructor() {}

  /**
   * REQUIREMENT 3: Pure TypeScript Once-Daily Update on App Open
   * (Zero Java dependencies, Zero Web Workers)
   * 1. Loads cached content from local storage instantly for 0ms startup.
   * 2. Checks if content was already updated today (YYYY-MM-DD).
   * 3. If first open today: fetches fresh data, updates local storage, stamps today's date.
   * 4. If already updated today: skips remote network request.
   */
  public async initialize(): Promise<void> {
    // 1. Instantly load local cache
    const cachedConfig = await this.loadCachedConfig();
    if (cachedConfig) {
      this.applyAndPublishConfig(cachedConfig);
    } else {
      await this.ensureFallbackLoaded();
    }

    // 2. Daily once update check
    await this.syncIfDueToday();

    // 3. Re-check if user keeps app open across midnight and resumes next day
    this.appStateListener = await App.addListener('appStateChange', async (state: AppState) => {
      if (state.isActive) {
        this.ngZone.run(async () => {
          await this.syncIfDueToday();
        });
      }
    });
  }

  /**
   * Once-Daily Sync Gatekeeper with Manual Cache-Clear Recovery:
   * 1. Checks if local cached data is present. If cache was cleared manually, it FORCES a fresh online fetch immediately.
   * 2. If cache is present and already updated today, skips the network request.
   * 3. If first open today (or next day), fetches fresh updates from server.
   */
  public async syncIfDueToday(force = false): Promise<SyncResult> {
    const today = new Date().toISOString().split('T')[0];
    const { value: lastSyncDate } = await Preferences.get({ key: this.LAST_DAILY_SYNC_KEY });
    const { value: cachedData } = await Preferences.get({ key: this.CACHE_KEY });

    const hasValidLocalCache = !!cachedData;

    // Only skip network if cache exists AND was already updated today
    if (!force && hasValidLocalCache && lastSyncDate === today) {
      console.log(`[DataService] App already updated today (${today}) with local cache intact. Skipping network call.`);
      return { success: true, message: 'Already updated today', isUpdated: false };
    }

    console.log(`[DataService] Online sync triggered (Has Cache: ${hasValidLocalCache}, Last Sync: ${lastSyncDate || 'none'}, Today: ${today}). Fetching from server...`);
    const result = await this.syncWithRemote();
    if (result.success) {
      await Preferences.set({ key: this.LAST_DAILY_SYNC_KEY, value: today });
    }
    return result;
  }

  /**
   * Manual Cache Clearance & Instant Online Sync:
   * Clears all local storage and immediately downloads fresh data from the online server.
   */
  public async clearCacheAndSync(): Promise<SyncResult> {
    console.log('[DataService] Manual cache clearance triggered. Wiping local storage and updating from online server...');
    await Preferences.remove({ key: this.CACHE_KEY });
    await Preferences.remove({ key: this.LAST_DAILY_SYNC_KEY });
    return this.syncWithRemote(true);
  }

  /**
   * Simple CORS GET Request with Query Timestamp Cache-Busting:
   */
  public async syncWithRemote(hardClearCache = false): Promise<SyncResult> {
    this.isSyncingSubject.next(true);

    const endpoint = environment.firebaseConfigUrl?.trim();
    if (!endpoint) {
      this.isSyncingSubject.next(false);
      return { success: false, message: 'No remote URL configured in environment.firebaseConfigUrl' };
    }

    const separator = endpoint.includes('?') ? '&' : '?';
    const requestUrl = `${endpoint}${separator}_cb=${Date.now()}`;

    console.log('[DataService] Fetching from repo:', requestUrl);

    try {
      const remoteConfig = await firstValueFrom(
        this.http.get<AppConfigPayload>(requestUrl)
      );

      if (remoteConfig && remoteConfig.app_identity && Array.isArray(remoteConfig.books)) {
        console.log('[DataService] Fresh data received successfully! Schema version:', remoteConfig.schemaVersion);

        if (hardClearCache) {
          await Preferences.remove({ key: this.CACHE_KEY });
        }

        await Preferences.set({
          key: this.CACHE_KEY,
          value: JSON.stringify(remoteConfig)
        });

        this.ngZone.run(() => {
          this.applyAndPublishConfig(remoteConfig);
        });

        this.isSyncingSubject.next(false);
        return {
          success: true,
          message: 'Updated to latest configuration',
          statusCode: 200,
          data: remoteConfig,
          isUpdated: true
        };
      }

      throw new Error('Received JSON is missing app_identity or books array.');
    } catch (error: any) {
      this.isSyncingSubject.next(false);
      console.warn('[DataService] Remote sync failed, continuing with cached content:', error?.message);
      return { success: false, message: 'Using offline cached content', statusCode: error?.status };
    }
  }

  public async syncWithFirebase(): Promise<SyncResult> {
    return this.syncWithRemote(true);
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

  private async ensureFallbackLoaded(): Promise<void> {
    if (this.configSubject.value) return;

    try {
      const bundled = await firstValueFrom(
        this.http.get<AppConfigPayload>(environment.fallbackMockPath)
      );
      if (bundled) {
        this.ngZone.run(() => {
          this.applyAndPublishConfig(bundled);
        });
      }
    } catch (err) {
      console.error('[DataService] Critical: No cached or bundled config available.', err);
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