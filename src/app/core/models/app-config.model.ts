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
  audioUrl?: LocalizedStringMap;
  durationSeconds?: number;
  // Supports both embedded and modular on-demand transcript loading
  transcript?: LocalizedStringMap;
  contentUrl?: string; // Fixes: Property 'contentUrl' does not exist on type 'Chapter'
}

// Fixes: Module has no exported member 'ChapterContentPayload'
export interface ChapterContentPayload {
  id: string;
  bookId?: string;
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

export interface AppConfigPayload {
  schemaVersion: number;
  lastUpdatedIso: string;
  updateBannerMessage?: LocalizedStringMap;
  app_identity: AppIdentity;
  supportedLanguages: SupportedLanguage[];
  ui_translations: UiTranslations;
  about_info?: AboutInfo;
  books: Book[];
  notification_schedules?: NotificationSchedule[];
}