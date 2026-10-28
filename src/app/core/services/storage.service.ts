import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type FontSize = 'small' | 'medium' | 'large';

@Injectable({ providedIn: 'root' })
export class StorageService {
 async getLanguage(): Promise<string | null> {
 const result = await Preferences.get({ key: 'selectedLanguage' });
 return result.value;
 }

 async setLanguage(language: string): Promise<void> {
 await Preferences.set({
 key: 'selectedLanguage',
 value: language
 });
 }

 async getFontSize(): Promise<FontSize> {
 const result = await Preferences.get({ key: 'selectedFontSize' });

 if (
 result.value === 'small' ||
 result.value === 'large' ||
 result.value === 'medium'
 ) {
 return result.value;
 }

 return 'medium';
 }

 async setFontSize(fontSize: FontSize): Promise<void> {
 await Preferences.set({
 key: 'selectedFontSize',
 value: fontSize
 });
 }

 async getBookmarks(): Promise<string[]> {
 const result = await Preferences.get({ key: 'bookmarkedChapters' });

 if (!result.value) {
 return [];
 }

 try {
 const parsed = JSON.parse(result.value);
 return Array.isArray(parsed) ? parsed : [];
 } catch {
 return [];
 }
 }

 async setBookmarks(bookmarks: string[]): Promise<void> {
 await Preferences.set({
 key: 'bookmarkedChapters',
 value: JSON.stringify(bookmarks)
 });
 }

 async toggleBookmark(chapterId: string): Promise<string[]> {
 const bookmarks = await this.getBookmarks();
 const exists = bookmarks.includes(chapterId);

 const updated = exists
 ? bookmarks.filter(id => id !== chapterId)
 : [...bookmarks, chapterId];

 await this.setBookmarks(updated);
 return updated;
 }
}
