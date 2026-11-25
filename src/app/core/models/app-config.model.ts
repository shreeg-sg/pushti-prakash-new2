export type FontSizeScale = 'small' | 'medium' | 'large';

export interface BookmarkEntry {
  bookId: string;
  chapterId: string;
  savedAtIso: string;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  tertiary: string;
  background: string;
  surface?: string;
  textPrimary?: string;
  textSecondary?: string;
}

export interface AppIdentity {
  appName: Record<string, string>;
  defaultAppName: string;
  logoUrl: string;
  watermarkUrl: string;
  mediaBaseUrl?: string;
  theme: ThemeColors;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  ttsLocale: string;
  isEnabled: boolean;
}

export type LocalizedStringMap = Record<string, string>;

export interface UiTranslations {
  [uiKey: string]: LocalizedStringMap;
}

export interface AboutInfo {
  description: LocalizedStringMap;
  contactEmail?: string;
  websiteUrl?: string;
  feedback_links?: LocalizedStringMap;
}

export interface Chapter {
  id: string;
  order: number;
  isVisible: boolean;
  title: LocalizedStringMap;
  subtitle?: LocalizedStringMap;
  audioUrl?: LocalizedStringMap;
  durationSeconds?: number;
  transcript?: LocalizedStringMap;
  contentUrl?: string;
  images?: string[]; // Optional: Chapter header images (multiple, center aligned)
}

export interface ChapterContentPayload {
  id: string;
  bookId?: string;
  images?: string[]; // Optional: Images defined inside individual chapter JSON
  transcript: LocalizedStringMap;
}

export interface Book {
  id: string;
  order: number;
  isVisible: boolean;
  coverImageUrl: string;
  title: LocalizedStringMap;
  subtitle?: LocalizedStringMap;
  chapters: Chapter[];
}

export interface NotificationSchedule {
  id: number;
  isEnabled: boolean;
  title: LocalizedStringMap;
  body: LocalizedStringMap;
  date?: string;
  hour: number;
  minute: number;
  repeatsDaily?: boolean;
  targetBookId?: string;
  targetChapterId?: string;
}

export interface BannerItem {
  id?: string;
  order?: number; // Optional display priority (lower appears first)
  date?: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  fromDate?: string; // Alias for startDate (YYYY-MM-DD)
  toDate?: string; // Alias for endDate (YYYY-MM-DD)
  dateLabel?: LocalizedStringMap | string; // Optional custom date badge label
  isEnabled?: boolean;
  isDefault?: boolean;
  isNew?: boolean; // Highlights banner with a pulsating "NEW" badge
  message: LocalizedStringMap;
  targetBookId?: string; // Routes directly to book or chapter
  targetChapterId?: string; // Direct chapter link
  url?: string; // External https:// link OR internal app route (e.g. "/tippani")
  actionLabel?: LocalizedStringMap; // Button text e.g. "Read Now" / "पढ़ें"
}

export interface AdvertisementItem {
  id: string | number;
  uniqueName: string;
  order: number;
  isEnabled: boolean;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  url?: string;
  imagePath?: string; // e.g. "images/advertisement/<uniqueName>"
}

export interface CalendarEventItem {
  id?: string;
  title: LocalizedStringMap | string;
  description?: LocalizedStringMap | string;
  time?: string;
  targetBookId?: string;
  targetChapterId?: string;
}

export interface CalendarDayEntry {
  id: string; // e.g. "2026-11-01"
  day: number; // 1..31 (normal Gregorian day)
  hinduDay?: LocalizedStringMap | string; // e.g. "Ekadashi" / "एकादशी"
  hinduTithiShort?: LocalizedStringMap | string; // Optional short grid label e.g. "शु. 11"
  paksha?: 'shukla' | 'krishna' | string;
  isHighlighted?: boolean;
  highlight?: boolean; // Alias supported gracefully
  events?: Array<CalendarEventItem | string>;
}

export interface CalendarMonthPayload {
  year: number;
  month: number; // 1..12
  monthName?: string;
  hinduMonth?: LocalizedStringMap | string; // e.g. "Kartik / Paush"
  days: CalendarDayEntry[];
}

export interface AppConfigPayload {
  schemaVersion: number;
  lastUpdatedIso: string;
  updateBannerMessage?: LocalizedStringMap | BannerItem[] | any;
  app_identity: AppIdentity;
  supportedLanguages: SupportedLanguage[];
  ui_translations: UiTranslations;
  about_info?: AboutInfo;
  books: Book[];
  notification_schedules?: NotificationSchedule[];
  advertisements?: AdvertisementItem[] | any;
}

export type AppConfig = AppConfigPayload;