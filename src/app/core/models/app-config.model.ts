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
  date?: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  isEnabled?: boolean;
  isDefault?: boolean;
  isNew?: boolean; // NEW: Highlights banner with a pulsating "NEW" tag
  message: LocalizedStringMap;
  targetBookId?: string; // NEW: Routes directly to book or chapter
  targetChapterId?: string; // NEW: Direct chapter link
  actionLabel?: LocalizedStringMap; // NEW: Button text e.g. "Read Now" / "पढ़ें"
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
}

export type AppConfig = AppConfigPayload;