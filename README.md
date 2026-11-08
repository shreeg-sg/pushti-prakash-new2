# White-Label Scripture Reading & Audio Mobile Platform
### Professional Android & iOS Digital Publishing Solution

A turnkey, multi-tenant mobile reading and audio solution designed specifically for devotionals, scriptures, educational literature, and regional language publications. Architected with an accessible, high-contrast UI tailored for **senior citizens, children, and daily reciters**.

---

## 🌟 Key Platform Highlights

* **100% White-Label & Client-Agnostic:** Change the app name, launcher icon, splash screen, color palette, book catalog, and audio streams entirely through a remote configuration repository without writing new code.
* **Over-The-Air Hot Updates:** Publish new books, edit chapter transcripts, update festival banners, or swap audio tracks instantly without waiting for Google Play Store or Apple App Store reviews.
* **Dual-Engine Audio System:** Streams high-fidelity recorded MP3 audio tracks with native scrub-bar controls. If a recording is not yet available, the engine automatically and smoothly transitions to native multilingual Text-to-Speech (Hindi, Gujarati, Marathi, English) with chunk highlighting.
* **Senior & Devotee-Centric UX:** 
  * Generous touch targets (44px+ controls) for easy navigation.
  * Adaptive Devanagari and Gujarati typography preventing diacritic (*matra*) clipping.
  * One-tap dynamic font scaling (Small, Medium, Large).
  * Uninterrupted background audio playback while the screen is locked during morning prayer (*puja*).
* **Offline-First Resilience:** Automatically caches viewed books and chapters locally on the device in 0 ms, ensuring complete offline reading and native TTS speech during travel or temple visits.
* **Automated Cloud CI/CD Builds:** Generate ready-to-publish signed Android APKs/AABs and iOS packages directly through GitHub Actions with zero local SDK setup required.

---

## 🎨 White-Label Customization Matrix

Every tenant receives a fully customized build tailored to their organization's identity:

| Asset | Customization Scope | Effect in App |
| :--- | :--- | :--- |
| **App Name** | Client Brand Name | Changes launcher label, window title, and header banner. |
| **App Icon** | 1024x1024 PNG Emblem | Generates adaptive Android and iOS home screen icons. |
| **Brand Theme** | Primary, Secondary & Accent Hex Colors | Re-themes the entire UI, toolbars, buttons, and accents. |
| **Watermark** | Client Emblem / Crest | Centers a subtle watermark across reading pages. |
| **Languages** | Hindi, Gujarati, Marathi, English | Configures enabled languages and native TTS voices. |
| **Book Catalog** | Titles, Subtitles & Chapters | Populates the home dashboard and reading directory. |
| **Festival Banners**| Date-Aware Announcements | Sticky top banner for festival wishes or event notices. |

---

## 📁 Modular Remote Content Architecture

All app content, artwork, and audio are hosted on a secure, high-speed CDN (Content Delivery Network) with Indian edge caching:

```text
media-repository/
└── src/
    └── assets/
        ├── images/         # Logo, book covers, and emblem watermarks
        ├── audio/          # Studio MP3 recitation tracks
        └── mock/           # Remote configuration and book manifests
            ├── app_identity.json       # Client colors, name & media base URL
            ├── supportedLanguages.json # Enabled languages & TTS locales
            ├── ui_translations.json    # Localized interface strings
            ├── books.json              # Catalog manifest and chapter index
            ├── updateBannerMessage.json# Daily date-aware festival banners
            └── chapters/               # On-demand chapter text files