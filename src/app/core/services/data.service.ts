import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, combineLatest, firstValueFrom, of } from 'rxjs';
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

  public readonly identity$: Observable<AppIdentity> = this.config$.pipe(
    map((cfg: AppConfig) => cfg.app_identity)
  );

  // Emits ALL active & eligible banners for today
  public readonly activeBanners$: Observable<ActiveBannerView[]> = combineLatest([
    this.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([cfg, lang]: [AppConfig, string]) => {
      if (!cfg?.updateBannerMessage) return [];
      return this.resolveAllEligibleBanners(cfg.updateBannerMessage, lang);
    })
  );

  // Backward-compatible single banner observable
  public readonly updateBanner$: Observable<string | null> = this.activeBanners$.pipe(
    map(banners => (banners.length > 0 ? banners[0].messageHtml : null))
  );

  public resolveAllEligibleBanners(bannerData: any, lang: string): ActiveBannerView[] {
    if (!bannerData) return [];

    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    const rawEligibleItems: any[] = [];

    if (Array.isArray(bannerData)) {
      for (const item of bannerData) {
        if (!item || item.isEnabled === false) continue;

        // 1. Specific single-date match
        if (item.date && item.date === today) {
          rawEligibleItems.push(item);
          continue;
        }

        // 2. Active date range match
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

        // 3. Persistent default messages
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
      const msg = item.message ? this.localizeField(item.message, lang) : this.localizeField(item, lang);

      if (msg && msg.trim().length > 0) {
        results.push({
          id: item.id ? String(item.id) : `banner_${counter++}`,
          messageHtml: msg,
          isNew: item.isNew === true,
          targetBookId: item.targetBookId,
          targetChapterId: item.targetChapterId,
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
        return { success: false, message: 'Empty remote manifest', isUpdated: false };
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

  public async loadChapterContent(bookId: string, chapter: Chapter): Promise<ChapterLoadedContent> {
    const cacheKey = `${this.CHAPTER_CACHE_PREFIX}${bookId}_${chapter.id}`;

    if (this.chapterContentCache.has(cacheKey)) {
      return this.chapterContentCache.get(cacheKey)!;
    }

    // Check disk storage
    try {
      const { value } = await Preferences.get({ key: cacheKey });
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed) {
          const transcript = parsed.transcript || (parsed.hi || parsed.gu || parsed.en ? parsed : {});
          const images = Array.isArray(parsed.images) ? parsed.images : (chapter.images || []);
          if (Object.keys(transcript).length > 0) {
            const result: ChapterLoadedContent = { transcript, images };
            this.chapterContentCache.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch {}

    const relativePath = chapter.contentUrl || `mock/chapters/${bookId}/${chapter.id}.json`;
    const targetUrl = this.resolveMediaUrl(
      relativePath.startsWith('mock/') ? relativePath : `mock/${relativePath}`
    );

    try {
      const res = await firstValueFrom(this.http.get<any>(`${targetUrl}?_cb=${Date.now()}`));
      const transcriptMap = res?.transcript || (res && (res.hi || res.gu || res.en) ? res : {});

      // Parse images from chapter JSON, falling back to books.json chapter metadata
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
      console.warn(`[DataService] Failed loading chapter from: ${targetUrl}`, err);
    }

    return { transcript: {}, images: chapter.images || [] };
  }

  // Compatibility helper
  public async loadChapterTranscript(bookId: string, chapter: Chapter): Promise<Record<string, string>> {
    const content = await this.loadChapterContent(bookId, chapter);
    return content.transcript;
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