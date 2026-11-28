# White-Label Digital Reading & Audio Platform
### Tenant Setup, Architecture, Login & Deployment Guide

Welcome to your white-label mobile and web reading platform for **Android**, **iOS**, and **Web**. Designed for scriptures, devotional literature, educational institutions, and multi-language publications, the platform lets you manage branding, catalogs, audio recitations, announcements, advertisements, calendars, and user login externally—without modifying application code for each tenant.

---

## 1. Platform Capabilities at a Glance

* **Zero-Code Multi-Tenant Branding:** Customize app name, launcher icon, theme colors, watermark, developer credit, and About Us details via `app_identity.json` and `about_info.json`.
* **Multi-Language Support:** Enable any set of languages (e.g., `hi`, `gu`, `mr`, `en`) with localized titles, transcripts, UI labels, and native TTS locales.
* **Dual-Engine Audio & Offline Reading:** Stream MP3 tracks with local caching and speed controls, or automatically fall back to device Text-to-Speech (TTS).
* **Tippani Hindu Calendar & Sticky Ads:** Monthly Gregorian + Hindu Tithi calendar (`calendar/<year>/<month>.json`) and date-windowed sticky bottom ad carousel (`advertisement.json`).
* **Optional Login, Active-User Tracking & 30-Day Audit (Supabase Free Tier):**
  * **Flow:** Language Selection -> Login -> Dashboard (only on first install or after clearing cache/data).
  * **Fields:** Full Name, Valid Email, Mobile Number, State, and optional **Unique ID / Roll Number** (for educational or membership tenants).
  * **Single-Device Session Control:** Prompts *"Your login session will terminate on other devices"* with **OK / Cancel** and removes the previous active session on **OK**.
  * **Automatic 30-Day Inactivity Expiry & Audit:** Tracks `last_opened_at` (synced once per day), automatically removes users inactive for >30 days via nightly `pg_cron`, and logs every `LOGIN`, `RE_LOGIN`, `SESSION_REPLACED`, and `EXPIRED_30D` event in an append-only `login_audit` table.

---

## 2. Tenant Setup Process (Step-by-Step)

### Step 1: Prepare the Tenant Media Repository
1. Create or clone the tenant's public media repository (or CDN bucket) following the Media Repository `README.md`.
2. Update `src/assets/mock/app_identity.json` with the tenant's `defaultAppName`, `appName`, `mediaBaseUrl`, `developerCredit`, `logoUrl`, and `theme` colors.
3. Add content files (`books.json`, `chapters/`, `audio/`, `images/`, `advertisement.json`, `calendar/`).

### Step 2: Set Up Supabase Login & Audit (Optional per Tenant)
If the tenant wants login and active-user tracking (`enabled: true`):
1. Create a free project at [supabase.com](https://supabase.com) (no credit card required).
2. Open **SQL Editor** in the Supabase Dashboard, paste the contents of `docs/supabase_setup.sql` (stored in this repo for reference and **never** bundled into app builds), and click **Run**.
3. In Supabase **Authentication -> Providers**, ensure **Anonymous Sign-Ins** are enabled (used silently in the background to issue unforgeable Row-Level-Security tokens).
4. Copy the project's **Project URL** and **Anon Public Key** (*never* use or expose the `service_role` key).
5. Update `src/assets/mock/auth_config.json` in the tenant's media repo:
   ```json
   {
     "enabled": true,
     "tenantId": "<tenant_slug>",
     "supabaseUrl": "https://<project_ref>.supabase.co",
     "supabaseAnonKey": "<anon_public_key>",
     "inactivityExpiryDays": 30,
     "requireUniqueId": false,
     "uniqueIdSource": "supabase",
     "uniqueIdJsonPath": "assets/<tenant_slug>/uniqueId.json"
   }
   ```
   * **Educational / Organization Unique ID Toggle:** Set `"requireUniqueId": true`.
     * Set `"uniqueIdSource": "supabase"` to verify against the private `allowed_unique_ids` table in Supabase (recommended for large/private lists; bulk-import CSV directly in Supabase Table Editor).
     * Set `"uniqueIdSource": "json"` to verify against `src/assets/<tenant_slug>/uniqueId.json` in the media repo.
   * To disable login for a tenant, simply set `"enabled": false` (or omit `auth_config.json`) — the app routes directly from Language selection to Dashboard.

### Step 3: Build White-Label Android / iOS Apps via GitHub Actions
1. Go to **Actions -> White-Label Android Build** (`.github/workflows/android-build.yml`) or **iOS Build** (`.github/workflows/ios-build.yml`) and click **Run workflow**.
2. Provide the tenant inputs:
   * `client_key`: Unique slug (e.g., `pushtiprakash`, `vidyamandir`)
   * `app_name`: Display name on device home screen
   * `app_id`: Reverse-domain package/bundle ID (e.g., `com.tenant.reader`)
   * `firebase_config_url`: Remote `mock/` directory URL (e.g., `https://cdn.jsdelivr.net/gh/<org>/<media-repo>@main/src/assets/mock/`)
   * `logo_url`: Direct URL to `1024 x 1024 px` PNG logo
   * `build_version` & `version_code`
3. Download the generated `.apk` / `.aab` (Android) or `.ipa` (iOS) artifact.

---

## 3. Security & Build Architecture Notes

* **Reference SQL Exclusion:** `docs/supabase_setup.sql` sits outside `src/` and is excluded from `angular.json` assets, so it is never packaged into web, Android, or iOS builds.
* **Row Level Security (RLS):** `login_audit` is append-only (`SECURITY DEFINER` RPCs only), `allowed_unique_ids` has zero direct client read access, and `active_users` cannot be bulk-read or deleted from the client app.
* **Content Security Policy (CSP):** `src/index.html` permits HTTPS connections to `raw.githubusercontent.com`, `cdn.jsdelivr.net`, `firebasestorage.googleapis.com`, and `*.supabase.co`.

---

## 4. Local Development Commands

```bash
npm install
npm start                # Run local web dev server
npm run build            # Production Angular build
npx cap sync             # Sync web build to Android / iOS native projects
```
