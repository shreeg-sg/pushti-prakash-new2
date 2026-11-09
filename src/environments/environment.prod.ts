export type StorageProvider = 'jsdelivr' | 'github_raw' | 'cloudflare' | 'firebase';

// Change here for manual production builds: 'jsdelivr' | 'github_raw' | 'cloudflare' | 'firebase'
const PROD_ACTIVE_PROVIDER: StorageProvider = 'github_raw';

const PROD_PROVIDER_CONFIGS: Record<StorageProvider, { configUrl: string; mediaBaseUrl: string }> = {
  jsdelivr: {
    configUrl: 'https://cdn.jsdelivr.net/gh/shreeg-sg/pushtiprakash-media@main/src/assets/mock/',
    mediaBaseUrl: 'https://cdn.jsdelivr.net/gh/shreeg-sg/pushtiprakash-media@main/src/assets'
  },
  github_raw: {
    configUrl: 'https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets/mock/',
    mediaBaseUrl: 'https://raw.githubusercontent.com/shreeg-sg/pushtiprakash-media/main/src/assets'
  },
  cloudflare: {
    configUrl: 'https://media.pushtiprakash.com/assets/mock/',
    mediaBaseUrl: 'https://media.pushtiprakash.com/assets'
  },
  firebase: {
    configUrl: 'https://firebasestorage.googleapis.com/v0/b/pushtiprakash-app.appspot.com/o/mock%2F',
    mediaBaseUrl: 'https://firebasestorage.googleapis.com/v0/b/pushtiprakash-app.appspot.com/o/'
  }
};

export const environment = {
  production: true,
  appVersion: '__BUILD_VERSION__',
  clientKey: '__CLIENT_KEY__',
  activeProvider: PROD_ACTIVE_PROVIDER,
  
  // Uses CI/CD injected URL if present, otherwise defaults to the selected provider
  firebaseConfigUrl: '__FIREBASE_CONFIG_URL__'.startsWith('__')
    ? PROD_PROVIDER_CONFIGS[PROD_ACTIVE_PROVIDER].configUrl
    : '__FIREBASE_CONFIG_URL__',
    
  defaultMediaBaseUrl: PROD_PROVIDER_CONFIGS[PROD_ACTIVE_PROVIDER].mediaBaseUrl,

  fallbackMockPath: 'assets/mock/',
  developerCredit: 'Developed by Sameer Purushottam Gujarathi'
};