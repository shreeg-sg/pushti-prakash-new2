export type StorageProvider = 'jsdelivr' | 'github_raw' | 'cloudflare' | 'firebase';

// ============================================================================
// 1. CHOOSE YOUR ACTIVE PROVIDER HERE:
// Options: 'jsdelivr' | 'github_raw' | 'cloudflare' | 'firebase'
// ============================================================================
const ACTIVE_PROVIDER: StorageProvider = 'github_raw';

// ============================================================================
// 2. ENDPOINT DIRECTORY FOR ALL 4 PROVIDERS
// ============================================================================
const PROVIDER_CONFIGS: Record<StorageProvider, { configUrl: string; mediaBaseUrl: string }> = {
  // Option A: jsDelivr CDN (RECOMMENDED for production: fast Indian edge caching, no rate limits, audio byte-streaming)
  jsdelivr: {
    configUrl: 'https://cdn.jsdelivr.net/gh/shreeg-sg/pushtiprakash-media@main/src/assets/mock/',
    mediaBaseUrl: 'https://cdn.jsdelivr.net/gh/shreeg-sg/pushtiprakash-media@main/src/assets'
  },

  // Option B: GitHub Raw (Direct git testing: instant commits without CDN propagation delay, but subject to 60 req/hr IP limit)
  github_raw: {
    configUrl: 'https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets/mock/',
    mediaBaseUrl: 'https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets'
  },

  // Option C: Cloudflare R2 / Custom CDN (High traffic enterprise: custom domain e.g. media.yourdomain.com with zero egress fees)
  cloudflare: {
    configUrl: 'https://media.pushtiprakash.com/assets/mock/', // Replace with your Cloudflare R2 domain or worker URL
    mediaBaseUrl: 'https://media.pushtiprakash.com/assets'
  },

  // Option D: Firebase Storage / Google Cloud (Secured corporate hosting with tokenized access rules)
  firebase: {
    configUrl: 'https://firebasestorage.googleapis.com/v0/b/pushtiprakash-app.appspot.com/o/mock%2F', // Replace with your Firebase storage bucket URL
    mediaBaseUrl: 'https://firebasestorage.googleapis.com/v0/b/pushtiprakash-app.appspot.com/o/'
  }
};

// ============================================================================
// 3. EXPORTED RUNTIME ENVIRONMENT
// ============================================================================
export const environment = {
  production: false,
  appVersion: '1.0.0-dev',
  clientKey: 'pushtiprakash-dev',
  activeProvider: ACTIVE_PROVIDER,
  
  // Dynamically points to the selected provider
  firebaseConfigUrl: PROVIDER_CONFIGS[ACTIVE_PROVIDER].configUrl,
  defaultMediaBaseUrl: PROVIDER_CONFIGS[ACTIVE_PROVIDER].mediaBaseUrl,

  fallbackMockPath: 'assets/mock/',
  developerCredit: 'Developed by Sameer Purushottam Gujarathi'
};