export interface ThemeConfig {
    primary: string;
    secondary: string;
    tertiary: string;
    background: string;
   }
   
   export interface AppIdentity {
    appName: string;
    logoUrl: string;
    watermarkUrl?: string;
    theme: ThemeConfig;
   }
   
   export interface SupportedLanguage {
    code: string;
    name: string;
    enabled: boolean;
   }
   
   export type TranslationMap = Record<string, Record<string, string>>;
   
   export interface AboutInfo {
    title: string;
    body: string;
    feedback_links: Record<string, string>;
   }
   
   export interface Chapter {
    id: string;
    title: Record<string, string>;
    transcript: Record<string, string>;
    audioPath?: string;
    isVisible: boolean;
   }
   
   export interface Book {
    id: string;
    title: Record<string, string>;
    coverImage: string;
    isVisible: boolean;
    chapters: Chapter[];
   }
   
   export interface NotificationSchedule {
    id: number;
    title: Record<string, string>;
    body: Record<string, string>;
    scheduleAt: string;
    repeats?: 'none' | 'day' | 'week' | 'month';
    hour?: number;
    minute?: number;
    enabled: boolean;
   }
   
   export interface AppConfig {
    app_identity: AppIdentity;
    supportedLanguages: SupportedLanguage[];
    ui_translations: TranslationMap;
    about_info: AboutInfo;
    books: Book[];
    notification_schedules: NotificationSchedule[];
    updatedAt: string;
   }
   