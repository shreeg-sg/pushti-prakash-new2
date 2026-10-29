import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, combineLatest, firstValueFrom } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { App, AppState } from '@capacitor/app';
import { Network } from '@capacitor/network';
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

@Injectable({
  providedIn: 'root'
})
export class DataService implements OnDestroy {
  private readonly CACHE_KEY = `app_config_cache_${environment.clientKey}`;

  private configSubject = new BehaviorSubject<AppConfigPayload | null>(null);
  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  private updateBannerSubject = new BehaviorSubject<string | null>(null);
  private appStateListener?: PluginListenerHandle;

  // Public Reactive Streams
  public readonly config$: Observable<AppConfigPayload> = this.configSubject.asObservable().pipe(
    filter((cfg): cfg is AppConfigPayload => cfg !== null)
  );
  public readonly isSyncing$: Observable<boolean> = this.isSyncingSubject.asObservable();
  public readonly updateBanner$: Observable<string | null> = this.updateBannerSubject.asObservable();

  // Derived Reactive Streams
  public readonly identity$: Observable<AppIdentity> = this.config$.pipe(
    map(cfg => cfg.app_identity)
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

  /**
   * Emits a dictionary of resolved UI strings for the currently selected language,
   * automatically falling back to 'en' or 'hi' if a translation key is missing.
   */
  public readonly uiText$: Observable<Record<string, string>> = combineLatest([
    this.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, langCode]) => this.resolveUiTranslations(cfg.ui_translations, langCode))
  );

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    private themeService: ThemeService,
    private storageService: StorageService,
    private notificationService: NotificationService
  ) {}

  /**
   * Call once inside AppComponent.ngOnInit().
   * Initializes cached config immediately for zero-latency boot, then performs network hot-update
   * and registers the Capacitor App resume listener.
   */
  public async initialize(): Promise<void> {
    // 1. Load cached JSON first for instant UI paint & offline resilience
    const cachedConfig = await this.loadCachedConfig();
    if (cachedConfig) {
      this.applyAndPublishConfig(cachedConfig, false);
    }

    // 2. Attempt silent hot-update from Firebase if connected
    await this.syncWithFirebase();

    // 3. Register Capacitor App resume listener for hot-updates on foregrounding
    this.appStateListener = await App.addListener('appStateChange', (state: AppState) => {
      if (state.isActive) {
        this.ngZone.run(() => {
          this.syncWithFirebase();
        });
      }
    });
  }

  /**
   * Network-first synchronization with offline fallback.
   */
  public async syncWithFirebase(): Promise<boolean> {
    this.isSyncingSubject.next(true);
    try {
      const status = await Network.getStatus();

      if (!status.connected) {
        await this.ensureFallbackLoaded();
        return false;
      }

      // Append cache-busting query param so CDNs/proxies never serve stale JSON
      const separator = environment.firebaseConfigUrl.includes('?') ? '&' : '?';
      const url = `${environment.firebaseConfigUrl}${separator}t=${Date.now()}`;
      const headers = new HttpHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });

      const remoteConfig = await firstValueFrom(
        this.http.get<AppConfigPayload>(url, { headers })
      );

      if (remoteConfig && remoteConfig.app_identity) {
        const previousTimestamp = this.configSubject.value?.lastUpdatedIso;
        const isNewUpdate = previousTimestamp !== remoteConfig.lastUpdatedIso;

        // Save to Capacitor Preferences for offline access
        await Preferences.set({
          key: this.CACHE_KEY,
          value: JSON.stringify(remoteConfig)
        });

        this.applyAndPublishConfig(remoteConfig, isNewUpdate);
        return true;
      }

      await this.ensureFallbackLoaded();
      return false;
    } catch (error) {
      console.warn('[DataService] Remote fetch failed, using cached configuration:', error);
      await this.ensureFallbackLoaded();
      return false;
    } finally {
      this.isSyncingSubject.next(false);
    }
  }

  /**
   * Helper to localize any LocalizedStringMap object (Book title, Chapter transcript, etc.)
   * with automatic fallback to English ('en') or Hindi ('hi').
   */
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

  /**
   * Retrieves a specific Book and Chapter reactive stream for the Reader & Audio Player page.
   */
  public getChapterStream(bookId: string, chapterId: string): Observable<{ book: Book; chapter: Chapter } | null> {
    return this.visibleBooks$.pipe(
      map(books => {
        const book = books.find(b => b.id === bookId);
        const chapter = book?.chapters.find(c => c.id === chapterId);
        return book && chapter ? { book, chapter } : null;
      })
    );
  }

  private applyAndPublishConfig(config: AppConfigPayload, showUpdateBanner: boolean): void {
    // 1. Dynamically inject CSS variables for theme & watermark
    this.themeService.applyAppIdentityTheme(config.app_identity);

    // 2. Validate that the user's currently selected language is still enabled remotely
    const currentLang = this.storageService.getCurrentLanguageSnapshot();
    const enabledCodes = (config.supportedLanguages || [])
      .filter(l => l.isEnabled)
      .map(l => l.code);

    if (currentLang && enabledCodes.length > 0 && !enabledCodes.includes(currentLang)) {
      this.storageService.setLanguage(enabledCodes[0]);
    }

    // 3. Emit new state to all reactive UI subscribers
    this.configSubject.next(config);

    // 4. Update Dashboard notification banner if content changed
    const activeLang = this.storageService.getCurrentLanguageSnapshot() || 'hi';
    if (config.updateBannerMessage) {
      const bannerText = this.localizeField(config.updateBannerMessage, activeLang);
      this.updateBannerSubject.next(bannerText || null);
    } else if (showUpdateBanner) {
      this.updateBannerSubject.next(null);
    }

    // 5. Re-schedule local notifications based on latest JSON schedule & active language
    this.notificationService.rescheduleNotifications(
      config.notification_schedules || [],
      activeLang
    );
  }

  private async ensureFallbackLoaded(): Promise<void> {
    if (this.configSubject.value) return;

    const cached = await this.loadCachedConfig();
    if (cached) {
      this.applyAndPublishConfig(cached, false);
      return;
    }

    // Ultimate fallback: load bundled mock JSON if first launch is completely offline
    try {
      const bundled = await firstValueFrom(
        this.http.get<AppConfigPayload>(environment.fallbackMockPath)
      );
      if (bundled) {
        this.applyAndPublishConfig(bundled, false);
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
