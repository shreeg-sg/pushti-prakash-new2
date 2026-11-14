export type StorageProvider = 'jsdelivr' | 'github_raw' | 'cloudflare' | 'firebase';

// ============================================================================
// 1. ACTIVE PROVIDER: Set to 'jsdelivr' for production CDN edge delivery
// Options: 'jsdelivr' | 'github_raw' | 'cloudflare' | 'firebase'
// ============================================================================
const ACTIVE_PROVIDER: StorageProvider = 'jsdelivr';

// ============================================================================
// 2. ENDPOINT DIRECTORY FOR ALL 4 PROVIDERS
// ============================================================================
const PROVIDER_CONFIGS: Record<StorageProvider, { configUrl: string; mediaBaseUrl: string }> = {
  // Option A: jsDelivr CDN (Fast Indian edge nodes, no 60 req/hr rate limit, audio byte streaming)
  jsdelivr: {
    configUrl: 'https://cdn.jsdelivr.net/gh/shreeg-sg/pushtiprakash-media@main/src/assets/mock/',
    mediaBaseUrl: 'https://cdn.jsdelivr.net/gh/shreeg-sg/pushtiprakash-media@main/src/assets'
  },

  // Option B: GitHub Raw (Direct git commits testing)
  github_raw: {
    configUrl: 'https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets/mock/',
    mediaBaseUrl: 'https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets'
  },

  // Option C: Cloudflare R2 / Custom CDN
  cloudflare: {
    configUrl: 'https://media.pushtiprakash.com/assets/mock/',
    mediaBaseUrl: 'https://media.pushtiprakash.com/assets'
  },

  // Option D: Firebase Storage
  firebase: {
    configUrl: 'https://firebasestorage.googleapis.com/v0/b/pushtiprakash-app.appspot.com/o/mock%2F',
    mediaBaseUrl: 'https://firebasestorage.googleapis.com/v0/b/pushtiprakash-app.appspot.com/o/'
  }
};

export const environment = {
  production: false,
  appVersion: '1.0.0-dev',
  clientKey: 'pushtiprakash-dev',
  activeProvider: ACTIVE_PROVIDER,

  firebaseConfigUrl: PROVIDER_CONFIGS[ACTIVE_PROVIDER].configUrl,
  defaultMediaBaseUrl: PROVIDER_CONFIGS[ACTIVE_PROVIDER].mediaBaseUrl,

  fallbackMockPath: 'assets/mock/',
  developerCredit: 'Developed by ShreeG'
};