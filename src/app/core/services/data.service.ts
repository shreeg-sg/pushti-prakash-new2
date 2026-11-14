import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, combineLatest, firstValueFrom, of } from 'rxjs';
import { map, filter, catchError, distinctUntilChanged } from 'rxjs/operators';
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
import { SecurityUtil } from '../utils/security.util';

export interface ActiveBannerView {
  id: string;
  messageHtml: string;
  isNew: boolean;
  targetBookId?: string;
  targetChapterId?: string;
  actionLabel?: string;
}

export interface ChapterLoadedContent {
  transcript: Record<string, string>;
  images: string[];
}

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

  private chapterContentCache = new Map<string, ChapterLoadedContent>();
  private appStateListener?: PluginListenerHandle;
  private langNotifySub?: Subscription;

  public readonly identity$: Observable<AppIdentity> = this.config$.pipe(
    map((cfg: AppConfig) => cfg.app_identity)
  );

  public readonly activeBanners$: Observable<ActiveBannerView[]> = combineLatest([
    this.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, lang]: [AppConfig, string]) => {
      if (!cfg?.updateBannerMessage) return [];
      return this.resolveAllEligibleBanners(cfg.updateBannerMessage, lang);
    })
  );

  public readonly updateBanner$: Observable<string | null> = this.activeBanners$.pipe(
    map(banners => (banners.length > 0 ? banners[0].messageHtml : null))
  );

  public resolveAllEligibleBanners(bannerData: any, lang: string): ActiveBannerView[] {
    if (!bannerData) return [];

    const today = this.getLocalDateString();

    const rawEligibleItems: any[] = [];

    if (Array.isArray(bannerData)) {
      for (const item of bannerData) {
        if (!item || item.isEnabled === false) continue;

        if (item.date && item.date === today) {
          rawEligibleItems.push(item);
          continue;
        }

        if (item.startDate || item.endDate) {
          const start = item.startDate;
          const end = item.endDate;
          const isAfterStart = !start || today >= start;
          const isBeforeEnd = !end || today <= end;
          if (isAfterStart && isBeforeEnd) {
            rawEligibleItems.push(item);
            continue;
          }
        }

        if (item.isDefault || item.date === 'default') {
          rawEligibleItems.push(item);
        }
      }
    } else if (typeof bannerData === 'object') {
      if (bannerData[today]) {
        rawEligibleItems.push({ message: bannerData[today] });
      } else if (bannerData.default) {
        rawEligibleItems.push({ message: bannerData.default });
      } else {
        rawEligibleItems.push({ message: bannerData });
      }
    }

    const results: ActiveBannerView[] = [];
    let counter = 1;

    for (const item of rawEligibleItems) {
      const rawMsg = item.message ? this.localizeField(item.message, lang) : this.localizeField(item, lang);
      const safeMsgHtml = SecurityUtil.sanitizeSafeHtml(rawMsg);

      if (safeMsgHtml && safeMsgHtml.trim().length > 0) {
        results.push({
          id: item.id ? String(item.id) : `banner_${counter++}`,
          messageHtml: safeMsgHtml,
          isNew: item.isNew === true,
          targetBookId: typeof item.targetBookId === 'string' ? item.targetBookId.trim() : undefined,
          targetChapterId: typeof item.targetChapterId === 'string' ? item.targetChapterId.trim() : undefined,
          actionLabel: item.actionLabel ? this.localizeField(item.actionLabel, lang) : undefined
        });
      }
    }

    return results;
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
    } else {
      const bundledConfig = await this.loadBundledFallbackConfig();
      if (bundledConfig) {
        this.applyAndPublishConfig(bundledConfig);
      }
    }

    this.langNotifySub = this.storageService.selectedLanguage$
      .pipe(distinctUntilChanged())
      .subscribe(lang => {
        const schedules = this.configSubject.value?.notification_schedules;
        if (schedules) {
          this.notificationService.rescheduleNotifications(schedules, lang).catch(() => {});
        }
      });

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
    const today = this.getLocalDateString();
    const { value: lastSyncDate } = await Preferences.get({ key: this.LAST_DAILY_SYNC_KEY });
    const { value: cachedData } = await Preferences.get({ key: this.CACHE_KEY });

    if (!force && !!cachedData && lastSyncDate === today) {
      return { success: true, message: 'Already updated today', isUpdated: false };
    }

    const result = await this.syncWithRemote(force);
    if (result.success) {
      await Preferences.set({ key: this.LAST_DAILY_SYNC_KEY, value: today });
    }
    return result;
  }

  public async syncWithRemote(forceRefresh = false): Promise<{ success: boolean; message: string; isUpdated: boolean }> {
    try {
      const endpoint = environment.firebaseConfigUrl;
      if (!endpoint || endpoint.startsWith('__') || !endpoint.startsWith('https://')) {
        return { success: false, message: 'Secure remote URL not configured', isUpdated: false };
      }

      let baseDir = endpoint.trim();
      if (!baseDir.endsWith('/')) {
        baseDir = `${baseDir}/`;
      }

      const dailyKey = this.getLocalDateString();
      const cb = forceRefresh ? `_cb=${Date.now()}` : `_v=${dailyKey}`;

      const [identity, languages, ui, books, banner, about, schedules] = await Promise.all([
        firstValueFrom(this.http.get<AppIdentity>(`${baseDir}app_identity.json?${cb}`).pipe(catchError(() => of(null)))),
        firstValueFrom(this.http.get<SupportedLanguage[]>(`${baseDir}supportedLanguages.json?${cb}`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<UiTranslations>(`${baseDir}ui_translations.json?${cb}`).pipe(catchError(() => of({})))),
        firstValueFrom(this.http.get<Book[]>(`${baseDir}books.json?${cb}`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<any>(`${baseDir}updateBannerMessage.json?${cb}`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<AboutInfo>(`${baseDir}about_info.json?${cb}`).pipe(catchError(() => of({ description: {}, feedback_links: {} })))),
        firstValueFrom(this.http.get<NotificationSchedule[]>(`${baseDir}notification_schedules.json?${cb}`).pipe(catchError(() => of([]))))
      ]);

      if (!identity || typeof identity !== 'object' || !Array.isArray(books) || books.length === 0) {
        if (!this.configSubject.value) {
          const fallback = await this.loadBundledFallbackConfig();
          if (fallback) {
            this.applyAndPublishConfig(fallback);
          }
        }
        return { success: false, message: 'Invalid or empty remote manifest', isUpdated: false };
      }

      const constructedConfig: AppConfig = {
        schemaVersion: 1,
        lastUpdatedIso: new Date().toISOString(),
        app_identity: identity,
        supportedLanguages: Array.isArray(languages) ? languages : [],
        ui_translations: ui && typeof ui === 'object' && !Array.isArray(ui) ? (ui as UiTranslations) : {},
        books: books,
        updateBannerMessage: banner,
        about_info: about,
        notification_schedules: Array.isArray(schedules) ? schedules : []
      };

      const isUpdated = this.hasConfigChanged(this.configSubject.value, constructedConfig);

      if (isUpdated || !this.configSubject.value) {
        this.chapterContentCache.clear();
        await this.saveCachedConfig(constructedConfig);
        this.applyAndPublishConfig(constructedConfig);
        return { success: true, message: 'Updated from remote', isUpdated: true };
      }

      return { success: true, message: 'Already up to date', isUpdated: false };
    } catch (err: any) {
      console.warn('[DataService] Remote sync failed, using cached state:', err?.message || err);
      if (!this.configSubject.value) {
        const fallback = await this.loadBundledFallbackConfig();
        if (fallback) {
          this.applyAndPublishConfig(fallback);
        }
      }
      return { success: false, message: err?.message || 'Remote sync failed', isUpdated: false };
    }
  }

  private async loadBundledFallbackConfig(): Promise<AppConfig | null> {
    try {
      let baseDir = (environment.fallbackMockPath || 'assets/mock/').trim();
      if (!baseDir.endsWith('/')) {
        baseDir = `${baseDir}/`;
      }

      const [identity, languages, ui, books, banner, about, schedules] = await Promise.all([
        firstValueFrom(this.http.get<AppIdentity>(`${baseDir}app_identity.json`).pipe(catchError(() => of(null)))),
        firstValueFrom(this.http.get<SupportedLanguage[]>(`${baseDir}supportedLanguages.json`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<UiTranslations>(`${baseDir}ui_translations.json`).pipe(catchError(() => of({})))),
        firstValueFrom(this.http.get<Book[]>(`${baseDir}books.json`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<any>(`${baseDir}updateBannerMessage.json`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<AboutInfo>(`${baseDir}about_info.json`).pipe(catchError(() => of({ description: {}, feedback_links: {} })))),
        firstValueFrom(this.http.get<NotificationSchedule[]>(`${baseDir}notification_schedules.json`).pipe(catchError(() => of([]))))
      ]);

      if (!identity || typeof identity !== 'object' || !Array.isArray(books) || books.length === 0) {
        return null;
      }

      return {
        schemaVersion: 1,
        lastUpdatedIso: new Date().toISOString(),
        app_identity: identity,
        supportedLanguages: Array.isArray(languages) ? languages : [],
        ui_translations: ui && typeof ui === 'object' && !Array.isArray(ui) ? (ui as UiTranslations) : {},
        books: books,
        updateBannerMessage: banner,
        about_info: about,
        notification_schedules: Array.isArray(schedules) ? schedules : []
      };
    } catch {
      return null;
    }
  }

  public async loadChapterContent(bookId: string, chapter: Chapter): Promise<ChapterLoadedContent> {
    const cacheKey = `${this.CHAPTER_CACHE_PREFIX}${bookId}_${chapter.id}`;

    if (this.chapterContentCache.has(cacheKey)) {
      const cached = this.chapterContentCache.get(cacheKey)!;
      if (Object.keys(cached.transcript).length > 0) {
        return cached;
      }
    }

    try {
      const { value } = await Preferences.get({ key: cacheKey });
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed) {
          const transcript = parsed.transcript || (parsed.hi || parsed.gu || parsed.en ? parsed : {});
          if (Object.keys(transcript).length > 0) {
            const images = Array.isArray(parsed.images) ? parsed.images : (chapter.images || []);
            const result: ChapterLoadedContent = { transcript, images };
            this.chapterContentCache.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch {}

    let relativePath = chapter.contentUrl || `mock/chapters/${bookId}/${chapter.id}.json`;
    if (!relativePath.startsWith('mock/') && !relativePath.startsWith('http://') && !relativePath.startsWith('https://')) {
      relativePath = `mock/${relativePath}`;
    }

    const targetUrl = this.resolveMediaUrl(relativePath);
    if (!targetUrl) {
      return { transcript: {}, images: chapter.images || [] };
    }

    const dailyKey = this.getLocalDateString();

    try {
      const res = await firstValueFrom(this.http.get<any>(`${targetUrl}?_v=${dailyKey}`));
      const transcriptMap = res?.transcript || (res && (res.hi || res.gu || res.en) ? res : {});

      let imagesList: string[] = [];
      if (res?.images && Array.isArray(res.images)) {
        imagesList = res.images;
      } else if (res?.image) {
        imagesList = [res.image];
      } else if (chapter.images && Array.isArray(chapter.images)) {
        imagesList = chapter.images;
      }

      const contentPayload: ChapterLoadedContent = {
        transcript: transcriptMap,
        images: imagesList
      };

      if (Object.keys(transcriptMap).length > 0) {
        await Preferences.set({
          key: cacheKey,
          value: JSON.stringify(contentPayload)
        });
        this.chapterContentCache.set(cacheKey, contentPayload);
        return contentPayload;
      }
    } catch (err) {
      console.warn(`[DataService] Failed loading chapter from strict path: ${targetUrl}`, err);
    }

    return { transcript: {}, images: chapter.images || [] };
  }

  public async loadChapterTranscript(bookId: string, chapter: Chapter): Promise<Record<string, string>> {
    const content = await this.loadChapterContent(bookId, chapter);
    return content.transcript;
  }

  public resolveMediaUrl(urlOrPath: string | undefined): string {
    if (!urlOrPath) return '';
    const clean = urlOrPath.trim();

    if (clean.includes('..') || /^(javascript|vbscript|file):/i.test(clean)) {
      return '';
    }

    if (clean.startsWith('https://') || clean.startsWith('data:image/')) {
      return clean;
    }

    if (clean.startsWith('http://')) {
      return clean.replace(/^http:\/\//i, 'https://');
    }

    const baseUrl =
      this.configSubject.value?.app_identity?.mediaBaseUrl ||
      environment.defaultMediaBaseUrl ||
      environment.firebaseConfigUrl;

    if (!baseUrl) return clean;

    const base = baseUrl.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
    const path = clean.replace(/^\/+/, '');

    return `${base}/${path}`;
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

        const chapter = book.chapters.find((c: Chapter) => c.id === chapterId);
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

  private getLocalDateString(dateObj: Date = new Date()): string {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  ngOnDestroy(): void {
    this.appStateListener?.remove();
    this.langNotifySub?.unsubscribe();
  }
}
