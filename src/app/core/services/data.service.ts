import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
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
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);
  private themeService = inject(ThemeService);
  private storageService = inject(StorageService);
  private notificationService = inject(NotificationService);

  private readonly CACHE_KEY = `app_config_cache_${environment.clientKey}`;

  private configSubject = new BehaviorSubject<AppConfigPayload | null>(null);
  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  private appStateListener?: PluginListenerHandle;

  public readonly config$: Observable<AppConfigPayload> = this.configSubject.asObservable().pipe(
    filter((cfg): cfg is AppConfigPayload => cfg !== null)
  );
  public readonly isSyncing$: Observable<boolean> = this.isSyncingSubject.asObservable();

  public readonly identity$: Observable<AppIdentity> = this.config$.pipe(
    map(cfg => cfg.app_identity)
  );

  /**
   * Direct reactive watermark URL stream. Resolves relative paths against mediaBaseUrl
   * and automatically falls back to logoUrl.
   */
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

  public async initialize(): Promise<void> {
    const cachedConfig = await this.loadCachedConfig();
    if (cachedConfig) {
      this.applyAndPublishConfig(cachedConfig);
    }

    await this.syncWithRemote();

    this.appStateListener = await App.addListener('appStateChange', (state: AppState) => {
      if (state.isActive) {
        this.ngZone.run(() => {
          this.syncWithRemote();
        });
      }
    });
  }

  /**
   * Hot-Update Synchronizer:
   * Works seamlessly with GitHub Raw URLs, jsDelivr CDN URLs, or Firebase RTDB URLs.
   * Uses cache-busting timestamp `?t=${Date.now()}` so commits on GitHub update immediately.
   */
  public async syncWithRemote(): Promise<boolean> {
    this.isSyncingSubject.next(true);
    try {
      const status = await Network.getStatus();

      if (!status.connected) {
        await this.ensureFallbackLoaded();
        return false;
      }

      const endpoint = environment.firebaseConfigUrl;
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `${endpoint}${separator}t=${Date.now()}`;
      const headers = new HttpHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });

      const remoteConfig = await firstValueFrom(
        this.http.get<AppConfigPayload>(url, { headers })
      );

      if (remoteConfig && remoteConfig.app_identity) {
        await Preferences.set({
          key: this.CACHE_KEY,
          value: JSON.stringify(remoteConfig)
        });

        this.applyAndPublishConfig(remoteConfig);
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

  public async syncWithFirebase(): Promise<boolean> {
    return this.syncWithRemote();
  }

  public resolveMediaUrl(urlOrPath: string | undefined): string {
    if (!urlOrPath) return '';
    let clean = urlOrPath.trim();

    if (clean.includes('github.com/') && clean.includes('/blob/')) {
      clean = clean
        .replace(/^https?:\/\/github\.com\//, 'https://cdn.jsdelivr.net/gh/')
        .replace('/blob/', '@');
      return clean;
    }

    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
      return clean;
    }

    const baseUrl = this.configSubject.value?.app_identity?.mediaBaseUrl;
    if (!baseUrl) return clean;

    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const sanitizedPath = clean.replace(/^\/+/, '');
    return `${sanitizedBase}/${sanitizedPath}`;
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

    const cached = await this.loadCachedConfig();
    if (cached) {
      this.applyAndPublishConfig(cached);
      return;
    }

    try {
      const bundled = await firstValueFrom(
        this.http.get<AppConfigPayload>(environment.fallbackMockPath)
      );
      if (bundled) {
        this.applyAndPublishConfig(bundled);
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