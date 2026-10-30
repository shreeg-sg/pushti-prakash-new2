# White-Label Reading & Audio/TTS Application — Client Configuration & Deployment Guide

Welcome to your White-Label Reading & Audio/Text-to-Speech Application package. This solution is architected with a **100% client-agnostic UI** and a **Hot-Update Engine**, allowing you to customize your app's branding, color theme, languages, books, audio tracks, and daily notifications remotely via Firebase—without touching the Angular/Ionic UI source code or submitting new builds to the Google Play Store for content changes.

---

## 1. Quick-Reference: Files You Need to Configure

To rebrand and connect this application to your own backend infrastructure, you only need to update the following files:

| File Path | Purpose | What You Need to Update |
| :--- | :--- | :--- |
| `src/environments/environment.ts` | Local development config | Set `clientKey`, `appVersion`, and your dev `firebaseConfigUrl`. |
| `src/environments/environment.prod.ts` | Production build config | Set your production `firebaseConfigUrl` (or leave placeholders if building via GitHub Actions). |
| `capacitor.config.json` (or `.ts`) | Native Android wrapper | Set `appId` (e.g., `com.yourbrand.reader`) and `appName` (e.g., `Your Brand Name`). |
| `android/app/src/main/res/values/strings.xml` | Android native launcher label | Update `app_name` and `title_activity_main` to match your brand name. |
| `src/assets/mock/data.json` | Master JSON & offline fallback | Customize your `app_identity`, `theme` hex colors, `supportedLanguages`, `books`, and `notification_schedules`. |
| `database.rules.json` | Firebase Realtime DB security | Deploy to your Firebase project to allow public app reads and admin-only writes. |
| `storage.rules` & `cors.json` | Firebase Cloud Storage security | Deploy to your Firebase Storage bucket so logos, book covers, and MP3s stream smoothly. |
| `serviceAccountKey.json` | Admin uploader credentials | Place in the project root (keep out of Git) to run `scripts/upload-config.js`. |
| `.github/workflows/android-build.yml` | Automated cloud APK builder | Run directly from the GitHub Actions tab by entering your client parameters. |

---

## 2. Prerequisites & Initial Setup

Ensure the following tools are installed on your workstation before building locally:

* **Node.js**: v20 LTS or newer
* **Ionic CLI & Capacitor**: `npm install -g @ionic/cli`
* **Java Development Kit (JDK)**: JDK 17 (required for Android Gradle builds)
* **Android Studio**: Required only if building or debugging APKs locally (optional if using the included GitHub Actions workflow)

Install project dependencies:

```bash
npm install
```

---

## 3. Setting Up External Interfaces (Firebase & Google Forms)

Your application relies on three external interfaces: **Firebase Realtime Database** (for the live `data.json` configuration), **Firebase Cloud Storage** (for logos, book covers, and chapter MP3 files), and **Google Forms** (for language-specific user feedback).

### 3.1 Firebase Project & Realtime Database Setup

1. Go to the [Firebase Console](https://www.google.com/search?q=https://console.firebase.google.com/) and click **Create a project**.
2. In the left sidebar, navigate to **Build > Realtime Database** and click **Create Database**.
3. Choose the region closest to your audience (e.g., `asia-southeast1` or `us-central1`) and start in **Locked mode**.
4. Open the **Rules** tab in Realtime Database and paste the contents of `database.rules.json` from this repository, then click **Publish**.
5. Copy your database root URL (e.g., `https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app`).
   * **Single-Tenant Endpoint URL**: Append `/app_config.json` to your database URL:
     `https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app/app_config.json`
   * **Multi-Tenant Endpoint URL** (if hosting multiple apps on one Firebase project):
     `https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app/tenants/<your-client-slug>/app_config.json`

### 3.2 Firebase Cloud Storage Setup (Logos, Covers & MP3 Audio)

1. In the Firebase Console, navigate to **Build > Storage** and click **Get Started**.
2. Open the **Rules** tab, paste the contents of `storage.rules` from this repository, and click **Publish**.
3. Upload your media assets into organized folders:
   * `branding/logo.png` (Square PNG recommended, e.g., `512x512px`)
   * `branding/watermark.png` (Transparent PNG emblem for reader background)
   * `covers/<book_id>.jpg` (Book cover artwork)
   * `audio/<lang_code>/<chapter_id>.mp3` (Recorded chapter audio tracks)
4. Click any uploaded file in the Firebase Console, expand **File location**, and copy the **Download URL** (which ends with `?alt=media&token=...`) to paste into your `data.json` file.
5. **Apply CORS Policy**: To ensure smooth audio streaming and image loading across all Android WebViews, apply the included `cors.json` file using Google Cloud CLI:

```bash
gsutil cors set cors.json gs://<your-project-id>.appspot.com
```

### 3.3 Generating Your Firebase Service Account Key (For One-Click JSON Uploads)

To push updates from your computer to Firebase using our included validation script (`scripts/upload-config.js`):

1. In the Firebase Console, click the **Gear Icon (Project Settings) > Service accounts**.
2. Click **Generate new private key** and download the JSON file.
3. Rename the downloaded file to `serviceAccountKey.json` and place it in the root folder of this project.
4. Verify that `serviceAccountKey.json` is listed in `.gitignore` so your private credentials are never committed to Git.

### 3.4 Configuring Google Forms for User Feedback

The **About Us** page includes a **Submit Feedback** button that automatically opens a Google Form matching the user's selected language:

1. Create your feedback form(s) at [Google Forms](https://www.google.com/search?q=https://docs.google.com/forms/).
2. Click **Send**, copy the responder link, and paste it under `about_info.feedback_links` in `src/assets/mock/data.json` mapped by language code (`hi`, `gu`, `mr`, `en`).

---

## 4. Connecting the App Codebase to Your Firebase Endpoint

### 4.1 Update `src/environments/environment.ts` (Local Testing)

Open `src/environments/environment.ts` and replace `clientKey` and `firebaseConfigUrl` with your details:

```typescript
export const environment = {
  production: false,
  appVersion: '1.0.0',
  clientKey: 'your-brand-slug',
  firebaseConfigUrl: 'https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app/app_config.json',
  fallbackMockPath: 'assets/mock/data.json',
  developerCredit: 'Developed by Sameer Purushottam Gujarathi'
};
```

### 4.2 Update `src/environments/environment.prod.ts` (Production Builds)

* **If building via GitHub Actions**: Leave the `__CLIENT_KEY__`, `__FIREBASE_CONFIG_URL__`, and `__BUILD_VERSION__` placeholders untouched—the CI/CD workflow injects them automatically.
* **If building manually on your machine**: Replace the placeholders with your production values before running `ionic build --prod`.

### 4.3 Update Native App Identity (`capacitor.config.json` & `strings.xml`)

For manual local Android builds, update your package ID and launcher name in two places:

1. **`capacitor.config.json`**:
   ```json
   {
     "appId": "com.yourbrand.reader",
     "appName": "Your Brand Name",
     "webDir": "www"
   }
   ```
2. **`android/app/src/main/res/values/strings.xml`**:
   ```xml
   <resources>
       <string name="app_name">Your Brand Name</string>
       <string name="title_activity_main">Your Brand Name</string>
       <string name="package_name">com.yourbrand.reader</string>
       <string name="custom_url_scheme">com.yourbrand.reader</string>
   </resources>
   ```

---

## 5. Customizing Your App Content & Branding (`data.json`)

Edit `src/assets/mock/data.json` to configure your brand's look, feel, and library. This file serves two purposes:
1. It is bundled inside the APK as the **ultimate offline fallback** if a user opens the app for the very first time without internet access.
2. It is the source file you upload to Firebase using `scripts/upload-config.js`.

### Key Sections in `data.json`

| JSON Key | Description & Customization Rules |
| :--- | :--- |
| `app_identity.theme` | Hex colors (`primary`, `secondary`, `tertiary`, `background`, `surface`, `textPrimary`). Automatically converts to Ionic CSS variables and calculates light/dark contrast text on launch. |
| `app_identity.logoUrl` | Direct URL to your brand logo (displayed on the Onboarding Welcome card, Sidebar header, and About Us page). |
| `app_identity.watermarkUrl` | Direct URL to a subtle background emblem displayed behind chapter transcripts at 5% opacity. |
| `supportedLanguages` | Array of language objects (`code`, `name`, `ttsLocale`, `isEnabled`). Set `"isEnabled": false` at any time to hide a language remotely. |
| `ui_translations` | Dictionary of UI labels mapped by language code. Automatically falls back to English (`en`) or Hindi (`hi`) if a translation is omitted. |
| `books` & `chapters` | Array of books and nested chapters. Set `"isVisible": false` to unpublish a book or chapter instantly. |
| `chapters[].audioUrl` | Provide a Firebase Storage MP3 URL per language for recorded audio playback, **or leave as `""` (empty string)** to automatically trigger native **Text-to-Speech (TTS)** in that language. |
| `notification_schedules` | Array of daily local notifications (`hour` in 0–23 format, `minute` in 0–59 format). Include optional `targetBookId` and `targetChapterId` to deep-link users directly to a chapter when tapped. |

---

## 6. Validating & Publishing Live Updates to Firebase

Whenever you edit `src/assets/mock/data.json` (to change theme colors, add a new book/chapter, or update notification times), use the included Node.js admin utility to validate and publish your changes:

### Step 1: Validate Your JSON Locally (Dry Run)
Checks that all hex codes, language maps, unique book/chapter IDs, and notification times are valid without connecting to Firebase:

```bash
npm run config:validate
# or: node scripts/upload-config.js --file=src/assets/mock/data.json --dry-run
```

### Step 2: Publish to Firebase (Hot-Update)
Automatically stamps `lastUpdatedIso` with the current UTC timestamp and uploads your JSON to Firebase Realtime Database and Cloud Storage:

```bash
# For a Single-Tenant Firebase project (/app_config):
node scripts/upload-config.js \
  --service-account=./serviceAccountKey.json \
  --file=src/assets/mock/data.json \
  --target=both

# For a Multi-Tenant Firebase project (/tenants/<client-slug>/app_config):
node scripts/upload-config.js \
  --service-account=./serviceAccountKey.json \
  --tenant=your-brand-slug \
  --file=src/assets/mock/data.json \
  --target=both
```

Once uploaded, every user device with an internet connection will silently fetch the new configuration the next time the app is opened or resumed from the background.

---

## 7. Building the Android APK

You can generate your client-specific Android APK either in the cloud via GitHub Actions (zero local Android setup required) or locally via Android Studio.

### Option A: One-Click Cloud Build via GitHub Actions (Recommended)

1. Push this repository to your GitHub account.
2. Open your repository on GitHub and click the **Actions** tab.
3. Select **White-Label Android APK Build** (`.github/workflows/android-build.yml`) on the left.
4. Click **Run workflow** and fill in your client parameters:
   * **`client_key`**: Unique slug (e.g., `pushtiprakash`)
   * **`app_name`**: Native Android display name (e.g., `PushtiPrakash`)
   * **`app_id`**: Android package identifier (e.g., `com.sameergujarathi.pushtiprakash`)
   * **`firebase_config_url`**: Your Firebase `.json` endpoint URL
   * **`build_version`**: Semantic version (e.g., `1.0.0`)
5. Once the workflow completes, download your ready-to-install APK (`<client_key>-v<build_version>-apk`) from the **Artifacts** section at the bottom of the workflow summary page.

### Option B: Local Build via Ionic & Capacitor CLI

```bash
# 1. Build the production Angular web bundle
npm run build -- --configuration=production

# 2. Copy web assets and sync native plugins to Android
npx cap sync android

# 3. Open in Android Studio to sign and export APK/AAB, or build via Gradle CLI:
cd android && ./gradlew assembleDebug
```

The generated APK will be located at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 8. Troubleshooting Common Setup Issues

* **Theme colors or new chapters aren't updating on the device**:
  * Verify that `lastUpdatedIso` in your remote Firebase JSON changed (using `scripts/upload-config.js` updates this automatically).
  * Pull down on the **Dashboard** screen to trigger a manual refresh, or background and resume the app with an active internet connection.
* **Audio player switches to Text-to-Speech (TTS) instead of playing MP3**:
  * Check that `chapter.audioUrl[<lang_code>]` contains a valid `https://` URL and that you have applied `cors.json` to your Firebase Storage bucket.
* **Native TTS voice sounds robotic or doesn't speak Indic scripts (`hi-IN`, `gu-IN`, `mr-IN`)**:
  * Ensure **Speech Recognition & Synthesis from Google** is installed and enabled under **Android Settings > System > Languages & input > Text-to-speech output** on the test device.

---

**Architecture & Core Engineering**: Developed by Sameer Purushottam Gujarathi
