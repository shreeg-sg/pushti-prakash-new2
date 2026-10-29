import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { BookmarkEntry, FontSizeScale } from '../models/app-config.model';
import { ThemeService } from './theme.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly PREFIX = `wl_${environment.clientKey}_`;
  private readonly LANG_KEY = `${this.PREFIX}selected_language`;
  private readonly FONT_KEY = `${this.PREFIX}selected_font_size`;
  private readonly BOOKMARKS_KEY = `${this.PREFIX}bookmarked_chapters`;
  private readonly ONBOARDED_KEY = `${this.PREFIX}has_completed_onboarding`;

  private selectedLanguageSubject = new BehaviorSubject<string>('hi');
  private selectedFontSizeSubject = new BehaviorSubject<FontSizeScale>('medium');
  private bookmarksSubject = new BehaviorSubject<BookmarkEntry[]>([]);
  private onboardingCompletedSubject = new BehaviorSubject<boolean>(false);

  // Reactive Streams
  public readonly selectedLanguage$: Observable<string> = this.selectedLanguageSubject.asObservable();
  public readonly selectedFontSize$: Observable<FontSizeScale> = this.selectedFontSizeSubject.asObservable();
  public readonly bookmarks$: Observable<BookmarkEntry[]> = this.bookmarksSubject.asObservable();
  public readonly hasCompletedOnboarding$: Observable<boolean> = this.onboardingCompletedSubject.asObservable();

  constructor(private themeService: ThemeService) {}

  /**
   * Call once during AppComponent startup before routing resolves.
   * Hydrates language, font scale, onboarding state, and bookmarks from Capacitor Preferences.
   */
  public async initialize(): Promise<void> {
    const [langRes, fontRes, bookmarksRes, onboardedRes] = await Promise.all([
      Preferences.get({ key: this.LANG_KEY }),
      Preferences.get({ key: this.FONT_KEY }),
      Preferences.get({ key: this.BOOKMARKS_KEY }),
      Preferences.get({ key: this.ONBOARDED_KEY })
    ]);

    if (langRes.value) {
      this.selectedLanguageSubject.next(langRes.value);
    }

    const fontScale = (fontRes.value as FontSizeScale) || 'medium';
    this.selectedFontSizeSubject.next(fontScale);
    this.themeService.applyFontSize(fontScale);

    if (bookmarksRes.value) {
      try {
        const parsed = JSON.parse(bookmarksRes.value) as BookmarkEntry[];
        this.bookmarksSubject.next(Array.isArray(parsed) ? parsed : []);
      } catch {
        this.bookmarksSubject.next([]);
      }
    }

    this.onboardingCompletedSubject.next(onboardedRes.value === 'true');
  }

  // --- Language Management ---

  public getCurrentLanguageSnapshot(): string {
    return this.selectedLanguageSubject.value;
  }

  public async setLanguage(langCode: string): Promise<void> {
    if (!langCode) return;
    this.selectedLanguageSubject.next(langCode);
    await Preferences.set({ key: this.LANG_KEY, value: langCode });
  }

  // --- Onboarding State ---

  public hasCompletedOnboardingSnapshot(): boolean {
    return this.onboardingCompletedSubject.value;
  }

  public async completeOnboarding(langCode: string): Promise<void> {
    await this.setLanguage(langCode);
    this.onboardingCompletedSubject.next(true);
    await Preferences.set({ key: this.ONBOARDED_KEY, value: 'true' });
  }

  // --- Font Size Scaling ---

  public getCurrentFontSizeSnapshot(): FontSizeScale {
    return this.selectedFontSizeSubject.value;
  }

  public async setFontSize(scale: FontSizeScale): Promise<void> {
    this.selectedFontSizeSubject.next(scale);
    this.themeService.applyFontSize(scale);
    await Preferences.set({ key: this.FONT_KEY, value: scale });
  }

  // --- Bookmarks Management ---

  public isChapterBookmarked$(bookId: string, chapterId: string): Observable<boolean> {
    return this.bookmarks$.pipe(
      map(list => list.some(item => item.bookId === bookId && item.chapterId === chapterId))
    );
  }

  /**
   * Toggles a chapter bookmark and returns `true` if added or `false` if removed.
   */
  public async toggleBookmark(bookId: string, chapterId: string): Promise<boolean> {
    const current = [...this.bookmarksSubject.value];
    const existingIndex = current.findIndex(
      item => item.bookId === bookId && item.chapterId === chapterId
    );

    let isAdded = false;
    if (existingIndex >= 0) {
      current.splice(existingIndex, 1);
      isAdded = false;
    } else {
      current.unshift({
        bookId,
        chapterId,
        savedAtIso: new Date().toISOString()
      });
      isAdded = true;
    }

    this.bookmarksSubject.next(current);
    await Preferences.set({
      key: this.BOOKMARKS_KEY,
      value: JSON.stringify(current)
    });

    return isAdded;
  }

  public async removeBookmark(bookId: string, chapterId: string): Promise<void> {
    const updated = this.bookmarksSubject.value.filter(
      item => !(item.bookId === bookId && item.chapterId === chapterId)
    );
    this.bookmarksSubject.next(updated);
    await Preferences.set({
      key: this.BOOKMARKS_KEY,
      value: JSON.stringify(updated)
    });
  }
}
