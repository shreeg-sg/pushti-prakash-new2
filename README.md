# White-Label Scripture Reading & Audio/TTS Application
### Comprehensive Client Onboarding, Multi-Tenant Customization & Deployment Guide

Welcome to the **White-Label Reading & Audio/Text-to-Speech Platform**. This solution is architected with a **100% client-agnostic Angular/Ionic UI** and a **Remote Hot-Update Engine**. 

As a platform owner selling this application to multiple tenants (temples, publishers, trusts, educational organizations), you can customize each client's branding, color palette, app launcher icon, languages, books, audio tracks, and daily notifications **without writing new code or submitting new builds to Google Play for content changes**.

---

## Table of Contents
1. [Core Features & Architecture](#1-core-features--architecture)
2. [Quick-Reference Customization Matrix](#2-quick-reference-customization-matrix)
3. [Client Branding & App Identity Customization](#3-client-branding--app-identity-customization)
   * 3.1 [App Name & Native Launcher Label](#31-app-name--native-launcher-label)
   * 3.2 [App Home Screen Launcher Icon](#32-app-home-screen-launcher-icon)
   * 3.3 [Application ID / Package Name](#33-application-id--package-name)
   * 3.4 [Theme Palette & Visual Styling](#34-theme-palette--visual-styling)
4. [Backend & Content Hosting Options](#4-backend--content-hosting-options)
   * 4.1 [Option A: GitHub Repository (Testing & Zero-Cost Hosting)](#41-option-a-github-repository-testing--zero-cost-hosting)
   * 4.2 [Option B: Cloudflare R2 / Custom CDN (High-Traffic Production)](#42-option-b-cloudflare-r2--custom-cdn-high-traffic-production)
   * 4.3 [Option C: Firebase Realtime Database & Cloud Storage](#43-option-c-firebase-realtime-database--cloud-storage)
5. [Modular Content Architecture (Split JSONs)](#5-modular-content-architecture-split-jsons)
6. [Mobile Engine & Operational Behaviors](#6-mobile-engine--operational-behaviors)
   * 6.1 [Once-Daily Sync on Launch & Cache-Clear Recovery](#61-once-daily-sync-on-launch--cache-clear-recovery)
   * 6.2 [Screen Keep-Awake During Audio Playback (Zero Dependencies)](#62-screen-keep-awake-during-audio-playback-zero-dependencies)
   * 6.3 [Anti-Copy & Scripture Protection](#63-anti-copy--scripture-protection)
7. [Automated Cloud APK Builds via GitHub Actions](#7-automated-cloud-apk-builds-via-github-actions)
8. [Local Development & Manual Build Guide](#8-local-development--manual-build-guide)

---

## 1. Core Features & Architecture

* **Client-Agnostic UI**: All labels, colors, stotras, audio links, and languages are fed through runtime JSON payloads. Zero hardcoded branding.
* **Offline-First Storage**: Bundled with local offline fallback in `src/assets/mock/` and persists all fetched books to local storage (`@capacitor/preferences`) in 0 ms.
* **Dual-Engine Audio**: Streams recorded MP3 studio audio when available. If absent, smoothly falls back to native multilingual Text-to-Speech (Hindi, Gujarati, Marathi, English) with active chunk karaoke highlighting.
* **Screen Keep-Awake**: Uses the native W3C Screen Wake Lock API (`navigator.wakeLock`) so the devotee's screen never dims or sleeps while prayers chant. Automatically releases lock and pauses when the user minimizes the app.
* **Scripture Content Protection**: Multi-layer anti-copy shield (CSS + HostListeners) blocking text selection, long-press copy bubbles, and clipboard extraction.
* **Dynamic Icon Stamping**: Automatically stamps the client's logo into all standard Android mipmap launcher densities (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) during build.

---

## 2. Quick-Reference Customization Matrix

| Tenant Asset | Location to Update | Effect / Purpose |
| :--- | :--- | :--- |
| **App Name** | `capacitor.config.json`<br>`strings.xml`<br>`app_identity.json` | Changes home screen launcher text, window title, and header title. |
| **App Icon** | `src/assets/images/logo.png`<br>OR `logo_url` input in GitHub Actions | Generates Android launcher icons (`ic_launcher`, round, and foreground). |
| **Package Name** | `capacitor.config.json` (`appId`) | Unique identifier on device and Google Play (e.g. `com.client.app`). |
| **Brand Colors** | `src/assets/mock/app_identity.json` | Dynamically themes primary, secondary, and background colors across the UI. |
| **Remote Content URL** | `src/environments/environment.prod.ts` | The base URL where the app checks for daily split JSON updates. |
| **Offline Fallback** | `src/assets/mock/` folder | Bundled files used on first install if user has no internet. |

---

## 3. Client Branding & App Identity Customization

### 3.1 App Name & Native Launcher Label

To customize the client app's name:

1. **In `capacitor.config.json`**:
   ```json
   {
     "appId": "com.clientname.reader",
     "appName": "Client App Name"
   }
   ```

2. **In `android/app/src/main/res/values/strings.xml`**:
   ```xml
   <resources>
       <string name="app_name">Client App Name</string>
       <string name="title_activity_main">Client App Name</string>
   </resources>
   ```

3. **In `src/assets/mock/app_identity.json`**:
   ```json
   {
     "defaultAppName": "Client App Name",
     "appName": {
       "en": "Client App Name",
       "hi": "क्लाइंट ऐप नाम",
       "gu": "ક્લાયન્ટ એપ નામ"
     }
   }
   ```

---

### 3.2 App Home Screen Launcher Icon

The build workflow automatically converts your single `logo.png` into all required Android launcher densities:

1. **Option 1 (Local Repo)**: Place the client's square transparent PNG logo at:
   `src/assets/images/logo.png` (Recommended: 512x512 px).
2. **Option 2 (Remote URL)**: Pass the direct image URL into the `logo_url` parameter in GitHub Actions (e.g. `https://raw.githubusercontent.com/.../logo.png`).

The build script will execute:
```bash
for res in "mdpi:48" "hdpi:72" "xhdpi:96" "xxhdpi:144" "xxxhdpi:192"; do
  folder=$(echo $res | cut -d: -f1)
  size=$(echo $res | cut -d: -f2)
  convert /tmp/logo.png -resize "${size}x${size}" "android/app/src/main/res/mipmap-${folder}/ic_launcher.png"
  convert /tmp/logo.png -resize "${size}x${size}" "android/app/src/main/res/mipmap-${folder}/ic_launcher_round.png"
  convert /tmp/logo.png -resize "${size}x${size}" "android/app/src/main/res/mipmap-${folder}/ic_launcher_foreground.png"
done
```

---

### 3.3 Application ID / Package Name

The Application ID (`appId`) must be unique for each client so they can publish independently to the Google Play Store:
* Format: `com.<client_slug>.<app_name>` (e.g., `com.pushtiprakash.app` or `com.sanatandharma.reader`).
* Update in `capacitor.config.json` or pass via `app_id` in GitHub Actions.

---

### 3.4 Theme Palette & Visual Styling

Themes are applied dynamically at runtime to the document root element. In `src/assets/mock/app_identity.json`:

```json
{
  "theme": {
    "primary": "#8B2635",       // Header background & major buttons
    "secondary": "#D4AF37",     // Badges, active tab indicator, accent borders
    "tertiary": "#2E5A44",      // TTS audio indicators
    "background": "#FFFDF9",    // App-wide page background
    "surface": "#FFF8EC",       // Cards, drawer menu, and floating dock
    "textPrimary": "#2C1810",   // Main stotra verse typography
    "textSecondary": "#6E4F42"  // Subtitles and audio counter text
  }
}
```

---

## 4. Backend & Content Hosting Options

The application supports three hosting backends. Choose the one that fits your deployment model:

```
+-------------------------------------------------------------------------+
|                         Content Backend Options                         |
+-------------------------+-----------------------+-----------------------+
| Option A: GitHub Repo   | Option B: Cloudflare  | Option C: Firebase    |
| (Testing / Zero Cost)   | (High Scale / Custom) | (Realtime Sync)       |
+-------------------------+-----------------------+-----------------------+
| • Zero setup overhead   | • Unlimited bandwidth | • Firebase console UI |
| • Free raw CDN hosting  | • Zero egress fees    | • Multi-tenant paths  |
| • Updates via git push  | • Custom domain CDN   | • Rules-based auth    |
+-------------------------+-----------------------+-----------------------+
```

---

### 4.1 Option A: GitHub Repository (Testing & Zero-Cost Hosting)

Best for rapid testing, staging, and zero-cost client launches.

1. **Create a Public Media Repository** (e.g. `github.com/<your-org>/<client>-media`).
2. **Organize Directory Structure**:
   ```text
   src/
   └── assets/
       ├── images/
       │   ├── logo.png
       │   └── book_cover.jpg
       ├── audio/
       │   └── stotra_track.mp3
       └── mock/
           ├── app_identity.json
           ├── supportedLanguages.json
           ├── ui_translations.json
           ├── updateBannerMessage.json
           ├── about_info.json
           ├── notification_schedules.json
           ├── books.json
           └── chapters/
               └── book_shodash_granth/
                   └── ch_yamunashtakam.json
   ```
3. **Configure Environment**:
   In `src/environments/environment.prod.ts` (and dev `environment.ts`):
   ```typescript
   export const environment = {
     production: true,
     appVersion: '1.0.0',
     clientKey: 'client-slug',
     // Point to the mock folder ending with a slash (/)
     firebaseConfigUrl: 'https://raw.githubusercontent.com/<org>/<client>-media/main/src/assets/mock/',
     fallbackMockPath: 'assets/mock/',
     developerCredit: 'Developed by Sameer Purushottam Gujarathi'
   };
   ```
4. **Configure `app_identity.json`**:
   ```json
   {
     "mediaBaseUrl": "https://raw.githubusercontent.com/<org>/<client>-media/main/src/assets"
   }
   ```

---

### 4.2 Option B: Cloudflare R2 / Custom CDN (High-Traffic Production)

Best for production apps with tens of thousands of users requiring custom domain branding and zero egress fees.

1. In Cloudflare Dashboard, navigate to **R2 Object Storage** and create a bucket (e.g., `client-media-bucket`).
2. Connect a custom domain (e.g., `https://media.clientbrand.org`).
3. Set bucket CORS to allow Simple GET requests:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```
4. Upload your `assets/` folder to the bucket root.
5. In `src/environments/environment.prod.ts`:
   ```typescript
   firebaseConfigUrl: 'https://media.clientbrand.org/assets/mock/'
   ```
6. In `app_identity.json`:
   ```json
   "mediaBaseUrl": "https://media.clientbrand.org/assets"
   ```

---

### 4.3 Option C: Firebase Realtime Database & Cloud Storage

Best if your client wants to manage content directly via the Firebase Web Console.

1. In [Firebase Console](https://console.firebase.google.com/), create a project.
2. In **Build > Realtime Database**, create a database and publish these security rules:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": "auth != null"
     }
   }
   ```
3. In **Build > Storage**, set public read rules:
   ```rules
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```
4. For multi-tenant hosting on one Firebase project, store each client under a tenant path:
   `https://<project-id>-default-rtdb.firebaseio.com/tenants/<client_key>/app_config.json`

---

## 5. Modular Content Architecture (Split JSONs)

Rather than forcing the mobile app to download one giant payload, content is partitioned into 7 modular files under `src/assets/mock/`:

```
src/assets/mock/
├── app_identity.json           -> Name, mediaBaseUrl, logoUrl, theme hex colors
├── supportedLanguages.json     -> Languages enabled (hi, gu, mr, en) & TTS locales
├── ui_translations.json        -> App UI strings across all supported languages
├── updateBannerMessage.json    -> Broadcast message shown at top of dashboard
├── about_info.json             -> Trust info, email, website & Google Form links
├── notification_schedules.json -> Daily and festival calendar notifications
├── books.json                  -> List of books and chapter TOCs (with contentUrl)
└── chapters/                   -> Individual chapter transcripts (loaded on-demand)
    └── <book_id>/
        └── <chapter_id>.json
```

### Chapter File Structure (`chapters/<book_id>/<chapter_id>.json`)
Each chapter file stores verses indexed by language code:
```json
{
  "id": "ch_yamunashtakam",
  "bookId": "book_shodash_granth",
  "transcript": {
    "hi": "नमामि यमुनामहं सकल सिद्धि हेतुं मुदा...\n\nमुरारि प्रेमविह्वलां...",
    "gu": "નમામિ યમુનામહં સકલ સિદ્ધિ હેતું મુદા...\n\nમુરારિ પ્રેમવિહ્વલાં...",
    "en": "I joyfully bow down to Shri Yamunaji, the source of all spiritual accomplishments..."
  }
}
```

---

## 6. Mobile Engine & Operational Behaviors

### 6.1 Once-Daily Sync on Launch & Cache-Clear Recovery
* **How It Works**:
  1. On launch, `DataService` checks local storage. It loads cached content instantly (0 ms).
  2. It compares today's date (`YYYY-MM-DD`) with `last_daily_sync_date`.
  3. If already updated today, it **skips all remote network requests**, preserving user battery and mobile data.
  4. If first open today: it downloads updates from the remote split files and updates `last_daily_sync_date`.
* **Cache-Clear Recovery**: If the user clears app storage in Android Settings, the app detects that `cachedData` is empty, automatically bypasses the daily check, and immediately downloads fresh data from the server.

### 6.2 Screen Keep-Awake During Audio Playback (Zero Dependencies)
* While audio or TTS is reciting, `TtsService` requests a screen wake lock via the native **W3C Screen Wake Lock API** (`navigator.wakeLock.request('screen')`).
* Devotees can read scriptures without the screen dimming or turning off.
* As soon as playback ends, pauses, or stops, the wake lock is released immediately.
* When the user minimizes the app or presses the Home button, playback **automatically pauses**—preventing unwanted background battery drain.

### 6.3 Anti-Copy & Scripture Protection
The Reader component implements a multi-layer protective shield:
* **CSS Shield**: `-webkit-user-select: none !important; -webkit-touch-callout: none !important;` disables touch highlighting, blue selection pins, and the mobile magnifying loupe.
* **Angular Event Blocker**: Intercepts `@HostListener('contextmenu')`, `copy`, `cut`, `paste`, and `selectstart` to suppress native copy/share popup bubbles.

---

## 7. Automated Cloud APK Builds via GitHub Actions

Each tenant's APK can be compiled in the cloud without installing Android Studio:

1. In your GitHub repository, open the **Actions** tab.
2. Select the **White-Label Android APK Build** workflow.
3. Click **Run workflow** and enter the client parameters:
   * **client_key**: `pushtiprakash`
   * **app_name**: `PushtiPrakash`
   * **app_id**: `com.sameergujarathi.pushtiprakash`
   * **firebase_config_url**: `https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets/mock/`
   * **logo_url**: `https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets/images/logo.png`
   * **build_version**: `1.0.0`
4. The workflow runs on an `ubuntu-latest` runner, downloads your logo, stamps all icon densities, injects client configurations, and compiles the Android APK.
5. Download the production-ready `.apk` directly from the workflow run's **Artifacts** section.

---

## 8. Local Development & Manual Build Guide

### Prerequisites
* **Node.js**: v20 LTS
* **Ionic CLI & Capacitor**: `npm install -g @ionic/cli`
* **Java Development Kit**: JDK 17
* **Android Studio**: Installed with Android SDK Platform 34

### Commands
```bash
# 1. Install project dependencies
npm install

# 2. Run local web development server
npm start
# or
ionic serve

# 3. Build Angular production web bundle
npm run build -- --configuration=production

# 4. Sync native Android directory
npx cap sync android

# 5. Open in Android Studio to test or sign release APK
npx cap open android

# 6. Or compile debug APK via command line
cd android
./gradlew assembleDebug
```
The compiled APK will be located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## Author & Support
* **Platform Lead Developer**: Sameer Purushottam Gujarathi
* **Architecture**: White-Label Multi-Tenant Mobile Foundation (Angular 18, Ionic Standalone, Capacitor 6)
