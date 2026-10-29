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
  appName: Record<string, string>; // Localized app title or default string
  defaultAppName: string;
  logoUrl: string;
  watermarkUrl: string;
  theme: ThemeColors;
}

export interface SupportedLanguage {
  code: string;       // e.g., 'hi', 'gu', 'mr', 'en'
  name: string;       // e.g., 'हिन्दी', 'ગુજરાતી', 'मराठी', 'English'
  ttsLocale: string;  // e.g., 'hi-IN', 'gu-IN', 'mr-IN', 'en-IN'
  isEnabled: boolean; // Remote toggle to enable/disable language
}

export type LocalizedStringMap = Record<string, string>;

export interface UiTranslations {
  [uiKey: string]: LocalizedStringMap;
}

export interface AboutInfo {
  description: LocalizedStringMap;
  contactEmail?: string;
  websiteUrl?: string;
  feedback_links: LocalizedStringMap; // Maps language code ('hi', 'en') to Google Form URL
}

export interface Chapter {
  id: string;
  order: number;
  isVisible: boolean;
  title: LocalizedStringMap;
  transcript: LocalizedStringMap;
  audioUrl: LocalizedStringMap; // Empty string "" triggers native TTS fallback
  durationSeconds?: number;
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
  hour: number;       // 24-hour format (0-23)
  minute: number;     // (0-59)
  repeatsDaily: boolean;
  targetBookId?: string;
  targetChapterId?: string;
}

export interface AppConfigPayload {
  schemaVersion: number;
  lastUpdatedIso: string;
  updateBannerMessage?: LocalizedStringMap;
  app_identity: AppIdentity;
  supportedLanguages: SupportedLanguage[];
  ui_translations: UiTranslations;
  about_info: AboutInfo;
  books: Book[];
  notification_schedules: NotificationSchedule[];
}