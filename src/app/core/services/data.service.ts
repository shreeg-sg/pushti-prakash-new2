import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, combineLatest, firstValueFrom, of } from 'rxjs';
import { map, filter, catchError, distinctUntilChanged, timeout } from 'rxjs/operators';
import { App, AppState } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';

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

export interface ActiveAdView {
  id: string;
  name: string;
  url: string;
  imageUrl: string;
  intervalMs: number;
}

export interface ChapterLoadedContent {
  transcript: Record<string, string>;
  images: string[];
  cachedDate?: string;
  cachedVersion?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  isUpdated: boolean;
  isThrottled?: boolean;
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
  private readonly LAST_HOURLY_REFRESH_KEY = `app_last_hourly_refresh_${environment.clientKey}`;
  private readonly ASSET_VERSION_KEY = `app_asset_version_${environment.clientKey}`;
  private readonly CHAPTER_CACHE_PREFIX = `app_chapter_${environment.clientKey}_`;

  // 1 hour cooldown (in milliseconds) for manual swipe-down hard refresh based on system clock
  private readonly HOURLY_COOLDOWN_MS = 60 * 60 * 1000;
  private readonly SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

  // Tracks the latest hard-refresh version across the entire src/assets/ folder (mock, chapters, images, audio)
  private assetVersion: string = this.getLocalDateString();

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

  public readonly activeAds$: Observable<ActiveAdView[]> = this.config$.pipe(
    map((cfg: AppConfig) => this.resolveAllEligibleAds(cfg?.advertisements))
  );

  public readonly updateBanner$: Observable<string | null> = this.activeBanners$.pipe(
    map(banners => (banners.length > 0 ? banners[0].messageHtml : null))
  );

  public resolveAllEligibleAds(adData: any): ActiveAdView[] {
    if (!adData) return [];

    const today = this.getLocalDateString();
    const rawList: any[] = Array.isArray(adData)
      ? adData
      : (typeof adData === 'object' ? [adData] : []);

    const sorted = [...rawList].sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
    const results: ActiveAdView[] = [];
    let counter = 1;

    for (const item of sorted) {
      if (!item || typeof item !== 'object' || item.isEnabled !== true) continue;

      const from = (item.fromDate || item.from_date || item.startDate || '').toString().trim();
      const to = (item.toDate || item.to_date || item.endDate || '').toString().trim();
      if (from && today < from) continue;
      if (to && today > to) continue;

      const rawImg = typeof item.image === 'string' ? item.image.trim() : '';
      if (!rawImg) continue;

      let adImgPath = rawImg;
      if (
        !rawImg.startsWith('http://') &&
        !rawImg.startsWith('https://') &&
        !rawImg.startsWith('data:image/')
      ) {
        adImgPath = rawImg.replace(/^\/+/, '').replace(/^src\/assets\//i, '');
        if (!adImgPath.startsWith('image/advertisement/') && !adImgPath.startsWith('images/advertisement/')) {
          adImgPath = `image/advertisement/${adImgPath}`;
        }
      }

      const resolvedImgUrl = this.resolveMediaUrl(adImgPath);
      if (!resolvedImgUrl) continue;

      const safeTargetUrl = SecurityUtil.sanitizeExternalUrl(item.url);
      const sec = Number(item.intervalSeconds);
      const clampedSec = !isNaN(sec) && sec > 0 ? Math.min(10, Math.max(5, sec)) : 7;

      results.push({
        id: item.id ? String(item.id) : `ad_${counter++}`,
        name: typeof item.name === 'string' ? item.name.trim() : 'Advertisement',
        url: safeTargetUrl,
        imageUrl: resolvedImgUrl,
        intervalMs: clampedSec * 1000
      });
    }

    return results;
  }

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
        const cleanBookId = typeof item.targetBookId === 'string' && this.SAFE_ID_REGEX.test(item.targetBookId.trim())
          ? item.targetBookId.trim()
          : undefined;
        const cleanChapterId = typeof item.targetChapterId === 'string' && this.SAFE_ID_REGEX.test(item.targetChapterId.trim())
          ? item.targetChapterId.trim()
          : undefined;

        results.push({
          id: item.id ? String(item.id) : `banner_${counter++}`,
          messageHtml: safeMsgHtml,
          isNew: item.isNew === true,
          targetBookId: cleanBookId,
          targetChapterId: cleanChapterId,
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
    const { value: savedAssetVer } = await Preferences.get({ key: this.ASSET_VERSION_KEY });
    if (savedAssetVer) {
      this.assetVersion = savedAssetVer;
    }

    const cachedConfig = await this.loadCachedConfig();
    if (cachedConfig) {
      this.applyAndPublishConfig(cachedConfig);
    } else {
      const bundledConfig = await this.loadBundledFallbackConfig();
      if (bundledConfig) {
        this.applyAndPublishConfig(bundledConfig);
      }
    }

    this.langNotifySub = combineLatest([
      this.storageService.selectedLanguage$.pipe(distinctUntilChanged()),
      this.storageService.hasCompletedOnboarding$.pipe(distinctUntilChanged())
    ]).subscribe(([lang, _onboarded]) => {
      const cfg = this.configSubject.value;
      if (cfg?.notification_schedules) {
        const primaryColor = cfg.app_identity?.theme?.primary || '#8B2635';
        this.notificationService.rescheduleNotifications(cfg.notification_schedules, lang, primaryColor).catch(() => {});
      }
    });

    // Hard refresh automatically on 1st launch of a new calendar date
    await this.syncIfDueToday(false);

    this.appStateListener = await App.addListener('appStateChange', async (state: AppState) => {
      if (state.isActive) {
        this.ngZone.run(async () => {
          await this.syncIfDueToday(false);
        });
      }
    });
  }

  /**
   * - When force === false (app start / resume):
   *   Performs a full hard refresh of the complete assets folder ONLY once per day
   *   on the 1st start when the system calendar date changes.
   * - When force === true (user swipes down on Dashboard):
   *   Performs a full hard refresh of the complete assets folder at most ONCE per hour
   *   based on normal system time (Date.now()).
   */
  public async syncIfDueToday(force = false): Promise<SyncResult> {
    const today = this.getLocalDateString();
    const now = Date.now();
    const { value: lastSyncDate } = await Preferences.get({ key: this.LAST_DAILY_SYNC_KEY });
    const { value: cachedData } = await Preferences.get({ key: this.CACHE_KEY });

    if (!force) {
      if (!!cachedData && lastSyncDate === today) {
        return { success: true, message: 'Already updated today', isUpdated: false, isThrottled: false };
      }

      // First launch on a new calendar date -> execute full hard refresh of all assets
      const dailyResult = await this.syncWithRemote(true);
      if (dailyResult.success) {
        await Preferences.set({ key: this.LAST_DAILY_SYNC_KEY, value: today });
      } else if (this.configSubject.value) {
        // Re-evaluate date-based notification banners against the new calendar date even if offline
        this.configSubject.next({ ...this.configSubject.value });
      }
      return dailyResult;
    }

    // Manual swipe-down refresh (force === true): enforce 1-hour cooldown on normal system time
    const { value: lastHourlyStr } = await Preferences.get({ key: this.LAST_HOURLY_REFRESH_KEY });
    const lastHourlyTs = lastHourlyStr ? Number(lastHourlyStr) : 0;

    // Guard `now >= lastHourlyTs` ensures that if system clock was moved forward during testing
    // and then restored to normal time, the cooldown does not lock out refresh for hours.
    if (
      !!cachedData &&
      lastHourlyTs > 0 &&
      now >= lastHourlyTs &&
      now - lastHourlyTs < this.HOURLY_COOLDOWN_MS
    ) {
      return {
        success: true,
        message: 'Already up to date',
        isUpdated: false,
        isThrottled: true
      };
    }

    const manualResult = await this.syncWithRemote(true);
    if (manualResult.success) {
      await Preferences.set({ key: this.LAST_DAILY_SYNC_KEY, value: today });
      await Preferences.set({ key: this.LAST_HOURLY_REFRESH_KEY, value: String(now) });
    }
    return manualResult;
  }

  /**
   * Synchronizes the complete remote `src/assets/` folder:
   * - All config manifests in `src/assets/mock/` (including `advertisement.json`)
   * - All chapter transcripts & chapter images in `src/assets/mock/chapters/`
   * - All brand logos, watermarks, book covers & ad images in `src/assets/images/` & `src/assets/image/advertisement/`
   * - All recorded MP3 audio tracks in `src/assets/audio/`
   */
  public async syncWithRemote(forceRefresh = false): Promise<SyncResult> {
    try {
      const endpoint = environment.firebaseConfigUrl;
      if (!endpoint || endpoint.startsWith('__') || !endpoint.startsWith('https://')) {
        return { success: false, message: 'Secure remote URL not configured', isUpdated: false };
      }

      let baseDir = endpoint.trim();
      if (!baseDir.endsWith('/') && !baseDir.endsWith('%2F')) {
        baseDir = `${baseDir}/`;
      }

      const refreshStamp = String(Date.now());
      const dailyKey = this.getLocalDateString();
      const cb = forceRefresh ? `_cb=${refreshStamp}` : `_v=${dailyKey}`;

      if (forceRefresh) {
        this.purgeJsDelivrAssetsCache(baseDir).catch(() => {});
      }

      // Preserve existing cached/bundled sections if any individual secondary JSON fails to load
      const existing = this.configSubject.value || (await this.loadBundledFallbackConfig());

      const [identity, languages, ui, books, banner, about, schedules, advertisements] = await Promise.all([
        this.fetchRemoteJson<AppIdentity | null>(this.buildProviderFileUrl(baseDir, 'app_identity.json'), cb, forceRefresh, null),
        this.fetchRemoteJson<SupportedLanguage[]>(
          this.buildProviderFileUrl(baseDir, 'supportedLanguages.json'),
          cb,
          forceRefresh,
          existing?.supportedLanguages || []
        ),
        this.fetchRemoteJson<UiTranslations>(
          this.buildProviderFileUrl(baseDir, 'ui_translations.json'),
          cb,
          forceRefresh,
          existing?.ui_translations || {}
        ),
        this.fetchRemoteJson<Book[]>(this.buildProviderFileUrl(baseDir, 'books.json'), cb, forceRefresh, []),
        this.fetchRemoteJson<any>(
          this.buildProviderFileUrl(baseDir, 'updateBannerMessage.json'),
          cb,
          forceRefresh,
          existing?.updateBannerMessage || []
        ),
        this.fetchRemoteJson<AboutInfo>(
          this.buildProviderFileUrl(baseDir, 'about_info.json'),
          cb,
          forceRefresh,
          existing?.about_info || { description: {}, feedback_links: {} }
        ),
        this.fetchRemoteJson<NotificationSchedule[]>(
          this.buildProviderFileUrl(baseDir, 'notification_schedules.json'),
          cb,
          forceRefresh,
          existing?.notification_schedules || []
        ),
        this.fetchRemoteJson<any>(
          this.buildProviderFileUrl(baseDir, 'advertisement.json'),
          cb,
          forceRefresh,
          []
        )
      ]);

      if (!identity || typeof identity !== 'object' || !Array.isArray(books) || books.length === 0) {
        if (!this.configSubject.value && existing) {
          this.applyAndPublishConfig(existing);
        }
        return { success: false, message: 'Invalid or empty remote manifest', isUpdated: false };
      }

      const constructedConfig: AppConfig = {
        schemaVersion: 1,
        lastUpdatedIso: refreshStamp,
        app_identity: identity,
        supportedLanguages: Array.isArray(languages) && languages.length > 0 ? languages : (existing?.supportedLanguages || []),
        ui_translations: ui && typeof ui === 'object' && !Array.isArray(ui) && Object.keys(ui).length > 0
          ? (ui as UiTranslations)
          : (existing?.ui_translations || {}),
        books: books,
        updateBannerMessage: banner,
        advertisements: advertisements,
        about_info: about,
        notification_schedules: Array.isArray(schedules) && schedules.length > 0
          ? schedules
          : (existing?.notification_schedules || [])
      };

      const isUpdated = this.hasConfigChanged(this.configSubject.value, constructedConfig);

      if (forceRefresh || isUpdated || !this.configSubject.value) {
        // Bump asset version so the entire src/assets/ folder (chapters, images, audio, ads) refreshes
        this.assetVersion = refreshStamp;
        await Preferences.set({ key: this.ASSET_VERSION_KEY, value: this.assetVersion });

        this.chapterContentCache.clear();
        await this.clearDiskChapterCache();
        await this.clearDiskAudioCache();

        await this.saveCachedConfig(constructedConfig);
        this.applyAndPublishConfig(constructedConfig);
        return {
          success: true,
          message: 'Updated from remote',
          isUpdated: true,
          isThrottled: false
        };
      }

      return { success: true, message: 'Already up to date', isUpdated: false, isThrottled: false };
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

  /**
   * Standard CORS Simple GET request (no custom headers that trigger OPTIONS preflight failures).
   * When forceRefresh is true, checks raw.githubusercontent.com first (with a 6s timeout) for
   * immediate Git commit freshness across all assets and falls back to cdn.jsdelivr.net.
   */
  private fetchRemoteJson<T>(url: string, cb: string, forceRefresh: boolean, fallbackValue: T): Promise<T> {
    const sep = url.includes('?') ? '&' : '?';
    const primaryUrl = `${url}${sep}${cb}`;
    if (forceRefresh) {
      const rawUrl = this.toGithubRawUrl(url);
      if (rawUrl) {
        const rawSep = rawUrl.includes('?') ? '&' : '?';
        return firstValueFrom(
          this.http.get<T>(`${rawUrl}${rawSep}${cb}`).pipe(
            timeout(6000),
            catchError(() =>
              this.http.get<T>(primaryUrl).pipe(
                timeout(6000),
                catchError(() => of(fallbackValue))
              )
            )
          )
        );
      }
    }
    return firstValueFrom(
      this.http.get<T>(primaryUrl).pipe(
        timeout(6000),
        catchError(() => of(fallbackValue))
      )
    );
  }

  private async purgeJsDelivrAssetsCache(baseDir: string): Promise<void> {
    if (!baseDir.startsWith('https://cdn.jsdelivr.net/gh/')) return;
    const purgeBase = baseDir.replace('https://cdn.jsdelivr.net/gh/', 'https://purge.jsdelivr.net/gh/');
    const files = [
      'app_identity.json',
      'supportedLanguages.json',
      'ui_translations.json',
      'books.json',
      'updateBannerMessage.json',
      'about_info.json',
      'notification_schedules.json',
      'advertisement.json'
    ];
    await Promise.all(
      files.map(f =>
        firstValueFrom(this.http.get(`${purgeBase}${f}`).pipe(timeout(3000), catchError(() => of(null))))
      )
    );
  }

  private buildProviderFileUrl(baseDir: string, relativeFile: string): string {
    const cleanRel = relativeFile.replace(/^\/+/, '');
    if (baseDir.includes('firebasestorage.googleapis.com/v0/b/')) {
      const encodedRel = cleanRel.split('/').map(encodeURIComponent).join('%2F');
      const sep = baseDir.endsWith('/') || baseDir.endsWith('%2F') ? '' : '%2F';
      const full = `${baseDir}${sep}${encodedRel}`;
      return full.includes('alt=media') ? full : `${full}${full.includes('?') ? '&' : '?'}alt=media`;
    }
    return `${baseDir.replace(/\/+$/, '')}/${cleanRel}`;
  }

  private toGithubRawUrl(url: string): string | null {
    if (url.startsWith('https://cdn.jsdelivr.net/gh/')) {
      const rest = url.replace('https://cdn.jsdelivr.net/gh/', '');
      const atIdx = rest.indexOf('@');
      if (atIdx > 0) {
        const repoPart = rest.substring(0, atIdx);
        const branchAndPath = rest.substring(atIdx + 1);
        return `https://raw.githubusercontent.com/${repoPart}/${branchAndPath}`;
      }
    }
    return null;
  }

  private async clearDiskChapterCache(): Promise<void> {
    try {
      const { keys } = await Preferences.keys();
      const chapterKeys = (keys || []).filter(k => k.startsWith(this.CHAPTER_CACHE_PREFIX));
      await Promise.all(chapterKeys.map(key => Preferences.remove({ key })));
    } catch {}
  }

  private async clearDiskAudioCache(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const dir = await Filesystem.readdir({ path: 'audio_cache', directory: Directory.Data });
      for (const file of dir.files) {
        const name = typeof file === 'string' ? file : file.name;
        await Filesystem.deleteFile({ path: `audio_cache/${name}`, directory: Directory.Data }).catch(() => {});
      }
    } catch {}
  }

  private async loadBundledFallbackConfig(): Promise<AppConfig | null> {
    try {
      let baseDir = (environment.fallbackMockPath || 'assets/mock/').trim();
      if (!baseDir.endsWith('/')) {
        baseDir = `${baseDir}/`;
      }

      const [identity, languages, ui, books, banner, about, schedules, advertisements] = await Promise.all([
        firstValueFrom(this.http.get<AppIdentity>(`${baseDir}app_identity.json`).pipe(catchError(() => of(null)))),
        firstValueFrom(this.http.get<SupportedLanguage[]>(`${baseDir}supportedLanguages.json`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<UiTranslations>(`${baseDir}ui_translations.json`).pipe(catchError(() => of({})))),
        firstValueFrom(this.http.get<Book[]>(`${baseDir}books.json`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<any>(`${baseDir}updateBannerMessage.json`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<AboutInfo>(`${baseDir}about_info.json`).pipe(catchError(() => of({ description: {}, feedback_links: {} })))),
        firstValueFrom(this.http.get<NotificationSchedule[]>(`${baseDir}notification_schedules.json`).pipe(catchError(() => of([])))),
        firstValueFrom(this.http.get<any>(`${baseDir}advertisement.json`).pipe(catchError(() => of([]))))
      ]);

      if (!identity || typeof identity !== 'object' || !Array.isArray(books) || books.length === 0) {
        return null;
      }

      return {
        schemaVersion: 1,
        lastUpdatedIso: this.getLocalDateString(),
        app_identity: identity,
        supportedLanguages: Array.isArray(languages) ? languages : [],
        ui_translations: ui && typeof ui === 'object' && !Array.isArray(ui) ? (ui as UiTranslations) : {},
        books: books,
        updateBannerMessage: banner,
        advertisements: advertisements,
        about_info: about,
        notification_schedules: Array.isArray(schedules) ? schedules : []
      };
    } catch {
      return null;
    }
  }

  public async loadChapterContent(bookId: string, chapter: Chapter, forceRefresh = false): Promise<ChapterLoadedContent> {
    const cacheKey = `${this.CHAPTER_CACHE_PREFIX}${bookId}_${chapter.id}`;
    const dailyKey = this.getLocalDateString();

    if (!forceRefresh && this.chapterContentCache.has(cacheKey)) {
      const cached = this.chapterContentCache.get(cacheKey)!;
      if (
        Object.keys(cached.transcript).length > 0 &&
        cached.cachedDate === dailyKey &&
        cached.cachedVersion === this.assetVersion
      ) {
        return cached;
      }
    }

    let diskFallback: ChapterLoadedContent | null = null;
    try {
      const { value } = await Preferences.get({ key: cacheKey });
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed) {
          const transcript = parsed.transcript || (parsed.hi || parsed.gu || parsed.en ? parsed : {});
          if (Object.keys(transcript).length > 0) {
            const images = Array.isArray(parsed.images) ? parsed.images : (chapter.images || []);
            diskFallback = {
              transcript,
              images,
              cachedDate: parsed.cachedDate,
              cachedVersion: parsed.cachedVersion
            };
            if (
              !forceRefresh &&
              parsed.cachedDate === dailyKey &&
              parsed.cachedVersion === this.assetVersion
            ) {
              this.chapterContentCache.set(cacheKey, diskFallback);
              return diskFallback;
            }
          }
        }
      }
    } catch {}

    let relativePath = chapter.contentUrl || `mock/chapters/${bookId}/${chapter.id}.json`;
    if (!relativePath.startsWith('mock/') && !relativePath.startsWith('http://') && !relativePath.startsWith('https://')) {
      relativePath = `mock/${relativePath}`;
    }

    const targetUrl = this.resolveMediaUrl(relativePath, false);
    if (!targetUrl) {
      return diskFallback || { transcript: {}, images: chapter.images || [] };
    }

    // Whenever disk cache was cleared by a hard refresh (1st daily launch or hourly pull-to-refresh),
    // fetch fresh from raw.githubusercontent.com first so stale CDN edge cache is bypassed.
    const shouldBustCdn = forceRefresh || !diskFallback || diskFallback.cachedVersion !== this.assetVersion;

    try {
      const cb = `_cb=${forceRefresh ? Date.now() : this.assetVersion}`;
      const res = await this.fetchRemoteJson<any>(targetUrl, cb, shouldBustCdn, null);
      if (!res) {
        throw new Error('Empty chapter response');
      }

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
        images: imagesList,
        cachedDate: dailyKey,
        cachedVersion: this.assetVersion
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
      console.warn(`[DataService] Failed loading chapter from remote (${targetUrl}), using offline cache if available.`);
      if (diskFallback) {
        this.chapterContentCache.set(cacheKey, diskFallback);
        return diskFallback;
      }
    }

    return diskFallback || { transcript: {}, images: chapter.images || [] };
  }

  public async loadChapterTranscript(bookId: string, chapter: Chapter): Promise<Record<string, string>> {
    const content = await this.loadChapterContent(bookId, chapter);
    return content.transcript;
  }

  public resolveMediaUrl(urlOrPath: string | undefined, appendAssetVersion = true): string {
    if (!urlOrPath) return '';
    const clean = urlOrPath.trim();

    if (clean.includes('..') || /^(javascript|vbscript|file):/i.test(clean)) {
      return '';
    }

    if (clean.startsWith('data:image/')) {
      return clean;
    }

    if (clean.startsWith('https://') || clean.startsWith('http://')) {
      const httpsUrl = clean.replace(/^http:\/\//i, 'https://');
      return SecurityUtil.sanitizeCssUrl(this.normalizeToActiveCdn(httpsUrl));
    }

    const rawBaseUrl =
      this.configSubject.value?.app_identity?.mediaBaseUrl ||
      environment.defaultMediaBaseUrl ||
      environment.firebaseConfigUrl;

    if (!rawBaseUrl) return SecurityUtil.sanitizeCssUrl(clean);

    const base = this.normalizeToActiveCdn(
      rawBaseUrl.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://')
    );
    const path = clean.replace(/^\/+/, '');

    if (base.includes('firebasestorage.googleapis.com/v0/b/')) {
      const [pathPart, queryPart] = path.split('?');
      const encodedPath = pathPart.split('/').map(encodeURIComponent).join('%2F');
      const sep = base.endsWith('%2F') ? '' : '%2F';
      const baseQuery = queryPart ? `alt=media&${queryPart}` : 'alt=media';
      const versionedQuery = appendAssetVersion && this.assetVersion
        ? `${baseQuery}&v=${this.assetVersion}`
        : baseQuery;
      return SecurityUtil.sanitizeCssUrl(`${base}${sep}${encodedPath}?${versionedQuery}`);
    }

    const fullUrl = `${base}/${path}`;
    if (!appendAssetVersion || !this.assetVersion) {
      return SecurityUtil.sanitizeCssUrl(fullUrl);
    }

    const sep = fullUrl.includes('?') ? '&' : '?';
    return SecurityUtil.sanitizeCssUrl(`${fullUrl}${sep}v=${this.assetVersion}`);
  }

  private normalizeToActiveCdn(url: string): string {
    if (environment.activeProvider === 'jsdelivr' && url.startsWith('https://raw.githubusercontent.com/')) {
      const parts = url.replace('https://raw.githubusercontent.com/', '').split('/');
      if (parts.length >= 3) {
        const user = parts[0];
        const repo = parts[1];
        const branch = parts[2];
        const rest = parts.slice(3).join('/');
        return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}${rest ? '/' + rest : ''}`;
      }
    }
    return url;
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
    // Ensure active language is still enabled in remote supportedLanguages
    const enabledLangs = (config.supportedLanguages || []).filter(l => l.isEnabled);
    let lang = this.storageService.getCurrentLanguageSnapshot();
    if (enabledLangs.length > 0 && !enabledLangs.some(l => l.code === lang)) {
      lang = enabledLangs[0].code;
      this.storageService.setLanguage(lang).catch(() => {});
    }

    this.configSubject.next(config);
    this.themeService.applyAppIdentityTheme(config.app_identity);

    if (config.notification_schedules) {
      const primaryColor = config.app_identity?.theme?.primary || '#8B2635';
      this.notificationService
        .rescheduleNotifications(config.notification_schedules, lang, primaryColor)
        .catch(() => {});
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
    const stripIso = (c: AppConfig) => ({ ...c, lastUpdatedIso: '' });
    return JSON.stringify(stripIso(oldCfg)) !== JSON.stringify(stripIso(newCfg));
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