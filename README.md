# White-Label Digital Reading & Audio Platform
### Tenant Onboarding, Media Specifications & Content Guide

Welcome to your white-label mobile reading and audio platform for **Android** and **iOS**. Designed for scriptures, devotional literature, educational books, and multi-language publications, the platform lets you manage your brand identity, book catalog, audio recitations, and announcements entirely from your remote media repository—without needing to modify application code or wait for app store reviews for content updates.

---

## 1. Platform Capabilities at a Glance

* **Remote Brand & Theme Control:** Customize your app name, launcher icon, brand colors, watermark emblem, and About Us details from JSON configuration files.
* **Multi-Language Support:** Enable one or more languages (e.g., Hindi, Gujarati, Marathi, English) with localized book titles, chapter text, UI labels, and native voice locales.
* **Dual-Engine Audio & TTS:** Stream recorded MP3 audio tracks with offline caching and playback speed controls. Any chapter without an audio file automatically falls back to native device Text-to-Speech (TTS).
* **Date-Aware Announcements & Reminders:** Schedule default, single-day, or date-range dashboard banners and local mobile reading reminders.
* **Offline-First Reading:** Viewed books, chapters, and audio tracks are cached on the device for uninterrupted offline reading.

---

## 2. Media Repository Folder Structure

Host your content in a dedicated public repository or CDN bucket using the exact directory layout below:

```text
your-media-repository/
└── src/
    └── assets/
        ├── images/
        │   ├── logo.png                    # App icon, header emblem & watermark
        │   ├── book_one_cover.jpg          # Book cover artwork
        │   └── chapter_illustration.jpg    # Optional chapter header image(s)
        ├── audio/
        │   ├── chapter_1.mp3               # Recorded MP3 track (lowercase only)
        │   └── chapter_2.mp3
        └── mock/
            ├── app_identity.json           # App name, theme hex colors & mediaBaseUrl
            ├── supportedLanguages.json     # Enabled languages & TTS locales
            ├── ui_translations.json        # Interface labels per language
            ├── books.json                  # Book catalog & chapter index
            ├── updateBannerMessage.json    # Dashboard sticky announcement banners
            ├── about_info.json             # About Us description, email & feedback links
            ├── notification_schedules.json # Scheduled mobile reading reminders
            └── chapters/
                └── <book_id>/              # One folder per book ID
                    ├── <chapter_id>.json   # Chapter transcript & optional images
                    └── ...
```

---

## 3. Icon, Image & Audio Specifications

Following these asset specifications ensures crisp rendering across phones and tablets, fast startup times, and reliable audio playback on cellular networks.

| Asset Type | Repository Path | Format | Recommended Dimensions / Specs | Recommended Size | Max Size | Usage & Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **App Icon & Logo** | `src/assets/images/logo.png` | **PNG** (RGBA, transparent background) | `1024 × 1024 px` (1:1 square) | `100 KB – 250 KB` | **500 KB** | Used for Android/iOS launcher icons (centered with ~68% safe-zone scaling), onboarding screen, sidebar header, and watermark. Keep artwork centered with generous padding; avoid thin edge details so Android monochrome notification silhouettes render cleanly. |
| **Book Cover Artwork** | `src/assets/images/<book_name>.jpg` | **JPG** or **WEBP** | `1200 × 400 px` (3:1) or `800 × 400 px` (2:1) landscape | `50 KB – 250 KB` | **600 KB** | Displayed as a subtle background watermark on Dashboard book cards and the Chapters header banner. Use clean, high-contrast artwork without small embedded text. |
| **Chapter Header Images** | `src/assets/images/<image_name>.jpg` | **JPG**, **PNG**, or **WEBP** | `800 × 600 px` (4:3) or `900 × 1200 px` (3:4), max display `440 × 360 px` | `50 KB – 250 KB` | **500 KB** | Optional center-aligned illustrations displayed above the chapter text in the Reader view. Multiple images per chapter are supported. |
| **Recorded Audio** | `src/assets/audio/<track_name>.mp3` | **MP3** (MPEG-1 Layer 3) | `128 kbps` CBR, `44.1 kHz`, Joint Stereo | `2 MB – 6 MB` | **15 MB** | Streamed in the Reader audio dock and cached locally after first play. Leave `audioUrl` empty (`""`) to use automatic Text-to-Speech instead. |
| **Config JSONs** | `src/assets/mock/*.json` | **JSON** (UTF-8) | Valid JSON, no trailing commas | `2 KB – 15 KB` | **50 KB** | Controls branding, navigation labels, catalog, banners, and reminders. |
| **Chapter JSONs** | `src/assets/mock/chapters/<book_id>/<chapter_id>.json` | **JSON** (UTF-8) | Valid JSON with `transcript` map | `1 KB – 15 KB` | **100 KB** | Loaded on demand when a reader opens a chapter. |

---

## 4. Critical Rules for Smooth Operation

### A. Strict File Naming & Casing
Mobile platforms and web CDNs are **case-sensitive**. A single uppercase mismatch (`Chapter1.MP3` vs `chapter1.mp3`) causes `404` errors and forces audio into TTS fallback.
* **Use lowercase letters, numbers, underscores, or hyphens only:** e.g., `shodash_granth.jpg`, `ch_01_intro.json`, `morning_prayer.mp3`.
* **Never use spaces or special characters** (`&`, `%`, `+`, `?`, `#`, parentheses).
* **Use standard lowercase extensions:** `.png`, `.jpg`, `.mp3`, `.json` (avoid `.JPG`, `.jpeg`, `.MP3`).
* **Match IDs and filenames:** Chapter JSON files inside `chapters/<book_id>/` must match the exact `contentUrl` path configured in `books.json`.

### B. Cache-Busting When Updating Existing Media
Mobile browsers and CDNs cache images and audio files aggressively. If you replace an existing file using the same filename, users may continue seeing or hearing the older file unless you increment a version query parameter (`?v=2`, `?v=3`) in your JSON:

```json
// In app_identity.json
{
  "logoUrl": "images/logo.png?v=2",
  "watermarkUrl": "images/logo.png?v=2"
}
```

```json
// In books.json
{
  "coverImageUrl": "images/book_cover.jpg?v=2",
  "audioUrl": {
    "hi": "audio/chapter_1.mp3?v=2",
    "en": "audio/chapter_1.mp3?v=2"
  }
}
```

### C. Valid JSON Formatting
A syntax error (such as a missing comma or trailing comma) in any configuration JSON prevents that file from loading on devices:
* Always validate every `.json` file before pushing updates.
* Ensure every hex color in `app_identity.json` uses standard 6-digit hex format (e.g., `"#8B2635"`).
* Ensure at least one language in `supportedLanguages.json` has `"isEnabled": true`.

### D. Sync & Refresh Behavior
* **Automatic Daily Sync:** On the first launch of a new calendar day, the app automatically checks your remote repository for updated configurations and content.
* **Manual Refresh:** Users can pull down on the Dashboard to refresh immediately (rate-limited to once per hour to prevent excessive CDN bandwidth usage).
* **CDN Propagation:** If using a CDN (such as jsDelivr or Cloudflare), purge or wait for edge cache propagation after pushing JSON updates so devices receive changes promptly.

---

## 5. Tenant Configuration Overview

| File | Purpose | Key Fields to Customize |
| :--- | :--- | :--- |
| `app_identity.json` | Branding & theme | `defaultAppName`, `appName` (per language), `mediaBaseUrl`, `logoUrl`, `watermarkUrl`, `theme` (`primary`, `secondary`, `tertiary`, `background`, `surface`, `textPrimary`, `textSecondary`), `footerCredit` |
| `supportedLanguages.json` | Active languages | `code`, `name`, `ttsLocale` (e.g., `hi-IN`, `gu-IN`, `en-IN`), `isEnabled` |
| `ui_translations.json` | App UI labels | Localized strings for buttons, headings, empty states, and toasts |
| `books.json` | Library catalog | Book `id`, `order`, `isVisible`, `coverImageUrl`, localized `title`/`subtitle`, and `chapters` array |
| `updateBannerMessage.json` | Sticky announcements | Array of banners with `isEnabled`, `isDefault`, `date` (`YYYY-MM-DD`), or `startDate`/`endDate`, `isNew` badge, and optional `targetBookId`/`targetChapterId` deep links |
| `about_info.json` | Organization details | Localized `description`, `contactEmail`, `websiteUrl`, and language-specific `feedback_links` |
| `notification_schedules.json` | Reading reminders | `id`, `isEnabled`, `hour`, `minute`, `repeatsDaily` or specific `date` (`YYYY-MM-DD`), localized `title`/`body`, and optional deep link targets |

---

## 6. Pre-Launch Tenant Checklist

- [ ] **Media Host Ready:** Media repository or CDN bucket is publicly readable over `https://` with CORS enabled for `GET` and `HEAD` requests.
- [ ] **App Icon Prepared:** `src/assets/images/logo.png` is `1024 × 1024 px` transparent PNG under `500 KB`.
- [ ] **All Filenames Lowercase:** No spaces, uppercase letters, or special characters in `images/`, `audio/`, or `chapters/`.
- [ ] **JSON Validated:** All 7 root files in `src/assets/mock/` and all chapter files in `chapters/` pass JSON validation.
- [ ] **Audio Verified:** Every non-empty `audioUrl` points to an existing `.mp3` file; chapters without recordings use `""` for automatic TTS.
- [ ] **Branding Parameters Set:** Tenant slug (`client_key`), display name (`app_name`), bundle/package ID (`app_id`), remote config URL, and logo URL are ready for your Android and iOS build run.
