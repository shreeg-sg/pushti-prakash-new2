import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, combineLatest, firstValueFrom, forkJoin, of } from 'rxjs';
import { map, filter, catchError } from 'rxjs/operators';
import { App, AppState } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { PluginListenerHandle } from '@capacitor/core';

import { environment } from '../../../environments/environment';
import {
  AppConfig,
  AppIdentity,
  SupportedLanguage,
  UiTranslations,
  Book,
  Chapter,
  AboutInfo,
  NotificationSchedule
} from '../models/app-config.model';
import { ThemeService } from './theme.service';
import { StorageService } from './storage.service';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class DataService implements OnDestroy {
  private http = inject(HttpClient);
  private themeService = inject(ThemeService);
  private storageService = inject(StorageService);
  private notificationService = inject(NotificationService);
  private ngZone = inject(NgZone);

  private readonly CACHE_KEY = `app_manifest_${environment.clientKey}`;
  private readonly LAST_DAILY_SYNC_KEY = `app_last_daily_sync_${environment.clientKey}`;
  private readonly CHAPTER_CACHE_PREFIX = `app_chapter_${environment.clientKey}_`;

  private configSubject = new BehaviorSubject<AppConfig | null>(null);
  public readonly config$: Observable<AppConfig> = this.configSubject.asObservable().pipe(
    filter((cfg): cfg is AppConfig => cfg !== null)
  );

  private chapterTranscriptCache = new Map<string, Record<string, string>>();
  private appStateListener?: PluginListenerHandle;

  public readonly identity$: Observable<AppIdentity> = this.config$.pipe(
    map((cfg: AppConfig) => cfg.app_identity)
  );

  public readonly updateBanner$: Observable<string | null> = combineLatest([
    this.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, lang]: [AppConfig, string]) => {
      if (!cfg?.updateBannerMessage) return null;
      return this.resolveDateAwareBanner(cfg.updateBannerMessage, lang);
    })
  );

  public resolveDateAwareBanner(bannerData: any, lang: string): string | null {
    if (!bannerData) return null;

    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    if (Array.isArray(bannerData)) {
      const exactMatch = bannerData.find((item: any) => item?.isEnabled !== false && item?.date === today);
      if (exactMatch) {
        return this.localizeField(exactMatch.message || exactMatch, lang) || null;
      }

      const rangeMatch = bannerData.find((item: any) => {
        if (item?.isEnabled === false) return false;
        const start = item?.startDate;
        const end = item?.endDate;
        if (start && end) return today >= start && today <= end;
        if (start && !end) return today >= start;
        if (!start && end) return today <= end;
        return false;
      });
      if (rangeMatch) {
        return this.localizeField(rangeMatch.message || rangeMatch, lang) || null;
      }

      const defaultItem = bannerData.find((item: any) => item?.isDefault || item?.date === 'default');
      if (defaultItem) {
        return this.localizeField(defaultItem.message || defaultItem, lang) || null;
      }

      return null;
    }

    if (typeof bannerData === 'object') {
      if (bannerData[today]) {
        return this.localizeField(bannerData[today], lang) || null;
      }
      if (bannerData.default) {
        return this.localizeField(bannerData.default, lang) || null;
      }
      const keys = Object.keys(bannerData);
      if (['hi', 'gu', 'en', 'mr'].some(k => keys.includes(k))) {
        return this.localizeField(bannerData, lang) || null;
      }
    }

    return null;
  }

  public readonly enabledLanguages$: Observable<SupportedLanguage[]> = this.config$.pipe(
    map((cfg: AppConfig) => (cfg.supportedLanguages || []).filter((lang: SupportedLanguage) => lang.isEnabled))
  );

  public readonly visibleBooks$: Observable<Book[]> = this.config$.pipe(
    map((cfg: AppConfig) =>
      (cfg.books || [])
        .filter((book: Book) => book.isVisible)
        .sort((a: Book, b: Book) => a.order - b.order)
        .map((book: Book) => ({
          ...book,
          chapters: (book.chapters || [])
            .filter((ch: Chapter) => ch.isVisible)
            .sort((a: Chapter, b: Chapter) => a.order - b.order)
        }))
    )
  );

  public readonly uiText$: Observable<Record<string, string>> = combineLatest([
    this.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, lang]: [AppConfig, string]) => {
      const result: Record<string, string> = {};
      const dict = cfg.ui_translations || {};
      for (const [key, localizedMap] of Object.entries(dict)) {
        result[key] = this.localizeField(localizedMap as Record<string, string>, lang);
      }
      return result;
    })
  );

  public readonly watermarkUrl$: Observable<string> = this.identity$.pipe(
    map((identity: AppIdentity) => {
      const raw = identity.watermarkUrl || identity.logoUrl;
      return this.resolveMediaUrl(raw);
    })
  );

  public async initialize(): Promise<void> {
    const cachedConfig = await this.loadCachedConfig();
    if (cachedConfig) {
      this.applyAndPublishConfig(cachedConfig);
    }

    await this.syncIfDueToday();

    this.appStateListener = await App.addListener('appStateChange', async (state: AppState) => {
      if (state.isActive) {
        this.ngZone.run(async () => {
          await this.syncIfDueToday();
        });
      }
    });
  }

  public async syncIfDueToday(force = false): Promise<{ success: boolean; message: string; isUpdated: boolean }> {
    const today = new Date().toISOString().split('T')[0];
    const { value: lastSyncDate } = await Preferences.get({ key: this.LAST_DAILY_SYNC_KEY });
    const { value: cachedData } = await Preferences.get({ key: this.CACHE_KEY });

    if (!force && !!cachedData && lastSyncDate === today) {
      return { success: true, message: 'Already updated today', isUpdated: false };
    }

    const result = await this.syncWithRemote();
    if (result.success) {
      await Preferences.set({ key: this.LAST_DAILY_SYNC_KEY, value: today });
    }
    return result;
  }

  public async syncWithRemote(): Promise<{ success: boolean; message: string; isUpdated: boolean }> {
    try {
      const endpoint = environment.firebaseConfigUrl;
      if (!endpoint || endpoint.startsWith('__')) {
        return { success: false, message: 'Remote URL not configured', isUpdated: false };
      }

      let baseDir = endpoint.trim();
      if (!baseDir.endsWith('/')) {
        baseDir = `${baseDir}/`;
      }

      const cb = `_cb=${Date.now()}`;

      const [identity, languages, ui, books, banner, about, schedules] = await Promise.all([
        firstValueFrom(this.http.get<AppIdentity>(`${baseDir}app_identity.json?${cb}`).pipe(catchError(() => of({} as AppIdentity)))),
        firstValueFrom(this.http.get<SupportedLanguage[]>(`${baseDir}supportedLanguages.json?${cb}`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<UiTranslations>(`${baseDir}ui_translations.json?${cb}`).pipe(catchError(() => of({})))),
        firstValueFrom(this.http.get<Book[]>(`${baseDir}books.json?${cb}`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<any>(`${baseDir}updateBannerMessage.json?${cb}`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<AboutInfo>(`${baseDir}about_info.json?${cb}`).pipe(catchError(() => of({ description: {}, feedback_links: {} })))),
        firstValueFrom(this.http.get<NotificationSchedule[]>(`${baseDir}notification_schedules.json?${cb}`).pipe(catchError(() => of([]))))
      ]);

      if (!identity || !books || books.length === 0) {
        return { success: false, message: 'Empty or invalid response from remote', isUpdated: false };
      }

      const constructedConfig: AppConfig = {
        schemaVersion: 1,
        lastUpdatedIso: new Date().toISOString(),
        app_identity: identity,
        supportedLanguages: languages,
        ui_translations: ui,
        books: books,
        updateBannerMessage: banner,
        about_info: about,
        notification_schedules: schedules
      };

      const isUpdated = this.hasConfigChanged(this.configSubject.value, constructedConfig);

      if (isUpdated || !this.configSubject.value) {
        await this.saveCachedConfig(constructedConfig);
        this.applyAndPublishConfig(constructedConfig);
        return { success: true, message: 'Updated from remote', isUpdated: true };
      }

      return { success: true, message: 'Already up to date', isUpdated: false };
    } catch (err: any) {
      console.warn('[DataService] Remote sync failed, using cached state:', err?.message || err);
      return { success: false, message: err?.message || 'Remote sync failed', isUpdated: false };
    }
  }

  public async loadChapterTranscript(bookId: string, chapter: Chapter): Promise<Record<string, string>> {
    if (chapter.transcript && Object.keys(chapter.transcript).length > 0) {
      return chapter.transcript;
    }

    const cacheKey = `${this.CHAPTER_CACHE_PREFIX}${bookId}_${chapter.id}`;

    if (this.chapterTranscriptCache.has(cacheKey)) {
      const mem = this.chapterTranscriptCache.get(cacheKey)!;
      if (mem && Object.keys(mem).length > 0) return mem;
    }

    try {
      const { value } = await Preferences.get({ key: cacheKey });
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          this.chapterTranscriptCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {}

    const relativePath = chapter.contentUrl || `mock/chapters/${bookId}/${chapter.id}.json`;
    const targetUrl = this.resolveMediaUrl(
      relativePath.startsWith('mock/') ? relativePath : `mock/${relativePath}`
    );

    try {
      const res = await firstValueFrom(this.http.get<any>(`${targetUrl}?_cb=${Date.now()}`));
      const transcriptMap = res?.transcript || (res && (res.hi || res.gu || res.en) ? res : null);

      if (transcriptMap && Object.keys(transcriptMap).length > 0) {
        await Preferences.set({
          key: cacheKey,
          value: JSON.stringify(transcriptMap)
        });
        this.chapterTranscriptCache.set(cacheKey, transcriptMap);
        return transcriptMap;
      }
    } catch (err) {
      console.warn(`[DataService] Failed loading chapter from: ${targetUrl}`, err);
    }

    return {};
  }

  public resolveMediaUrl(urlOrPath: string | undefined): string {
    if (!urlOrPath) return '';
    let clean = urlOrPath.trim();

    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
      return clean;
    }

    const baseUrl = this.configSubject.value?.app_identity?.mediaBaseUrl || environment.firebaseConfigUrl;
    if (!baseUrl) return clean;

    let base = baseUrl.replace(/\/+$/, '');
    if (base.endsWith('/mock')) {
      base = base.replace(/\/mock$/, '');
    }

    const sanitizedPath = clean.replace(/^\/+/, '');
    return `${base}/${sanitizedPath}`;
  }

  public localizeField(mapObj: Record<string, string> | undefined, lang: string): string {
    if (!mapObj || typeof mapObj !== 'object') return '';
    return mapObj[lang] || mapObj['hi'] || mapObj['gu'] || mapObj['en'] || Object.values(mapObj)[0] || '';
  }

  public getChapterStream(bookId: string, chapterId: string): Observable<{ book: Book; chapter: Chapter } | null> {
    return this.visibleBooks$.pipe(
      map((books: Book[]) => {
        const book = books.find((b: Book) => b.id === bookId);
        if (!book) return null;

        const targetClean = chapterId.replace(/_sg_/g, '_');
        const chapter = book.chapters.find((c: Chapter) =>
          c.id === chapterId || c.id.replace(/_sg_/g, '_') === targetClean
        );
        return chapter ? { book, chapter } : null;
      })
    );
  }

  private applyAndPublishConfig(config: AppConfig): void {
    this.configSubject.next(config);
    this.themeService.applyAppIdentityTheme(config.app_identity);

    const lang = this.storageService.getCurrentLanguageSnapshot();
    if (config.notification_schedules) {
      this.notificationService.rescheduleNotifications(config.notification_schedules, lang).catch(() => {});
    }
  }

  private async loadCachedConfig(): Promise<AppConfig | null> {
    try {
      const { value } = await Preferences.get({ key: this.CACHE_KEY });
      if (value) {
        return JSON.parse(value) as AppConfig;
      }
    } catch {}
    return null;
  }

  private async saveCachedConfig(config: AppConfig): Promise<void> {
    try {
      await Preferences.set({
        key: this.CACHE_KEY,
        value: JSON.stringify(config)
      });
    } catch {}
  }

  private hasConfigChanged(oldCfg: AppConfig | null, newCfg: AppConfig): boolean {
    if (!oldCfg) return true;
    return JSON.stringify(oldCfg) !== JSON.stringify(newCfg);
  }

  ngOnDestroy(): void {
    this.appStateListener?.remove();
  }
}