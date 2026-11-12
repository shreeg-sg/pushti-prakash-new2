export type StorageProvider = 'jsdelivr' | 'github_raw' | 'cloudflare' | 'firebase';

// Production default set to 'jsdelivr' to avoid GitHub 60 req/hr IP blocks
const PROD_ACTIVE_PROVIDER: StorageProvider = 'jsdelivr';

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
    configUrl: '',
    mediaBaseUrl: ''
  },
  firebase: {
    configUrl: '',
    mediaBaseUrl: ''
  }
};

export const environment = {
  production: true,
  appVersion: '__BUILD_VERSION__',
  clientKey: '__CLIENT_KEY__',
  activeProvider: PROD_ACTIVE_PROVIDER,

  firebaseConfigUrl: '__FIREBASE_CONFIG_URL__'.startsWith('__')
    ? PROD_PROVIDER_CONFIGS[PROD_ACTIVE_PROVIDER].configUrl
    : '__FIREBASE_CONFIG_URL__',

  defaultMediaBaseUrl: PROD_PROVIDER_CONFIGS[PROD_ACTIVE_PROVIDER].mediaBaseUrl,

  fallbackMockPath: 'assets/mock/',
  developerCredit: ''
};