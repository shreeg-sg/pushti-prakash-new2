#!/usr/bin/env node

/**
 * White-Label Reader & Audio App - Firebase Admin Config Uploader & Validator
 *
 * Usage:
 *   node scripts/upload-config.js [options]
 *
 * Options:
 *   --file, -f            Path to local data.json (default: src/assets/mock/data.json)
 *   --tenant, -t          Tenant identifier slug (e.g. pushtiprakash, another-reader).
 *                         If omitted, uploads to root `/app_config`.
 *   --target              Deployment target: 'rtdb', 'storage', or 'both' (default: 'both')
 *   --dry-run, -d         Validate schema locally without uploading to Firebase
 *   --service-account, -s Path to Firebase Service Account JSON
 *                         (defaults to GOOGLE_APPLICATION_CREDENTIALS or ./serviceAccountKey.json)
 *   --no-timestamp        Do not auto-update lastUpdatedIso to current UTC time
 *   --help, -h            Show help
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// ANSI Terminal Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// --- 1. CLI Arguments Parsing ---
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    file: 'src/assets/mock/data.json',
    tenant: null,
    target: 'both',
    dryRun: false,
    serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json',
    autoTimestamp: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      config.file = args[++i];
    } else if (arg.startsWith('--file=')) {
      config.file = arg.split('=')[1];
    } else if (arg === '--tenant' || arg === '-t') {
      config.tenant = args[++i];
    } else if (arg.startsWith('--tenant=')) {
      config.tenant = arg.split('=')[1];
    } else if (arg === '--target') {
      config.target = args[++i].toLowerCase();
    } else if (arg.startsWith('--target=')) {
      config.target = arg.split('=')[1].toLowerCase();
    } else if (arg === '--service-account' || arg === '-s') {
      config.serviceAccount = args[++i];
    } else if (arg.startsWith('--service-account=')) {
      config.serviceAccount = arg.split('=')[1];
    } else if (arg === '--dry-run' || arg === '-d') {
      config.dryRun = true;
    } else if (arg === '--no-timestamp') {
      config.autoTimestamp = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`
${colors.bold}White-Label Reader Firebase Config Validator & Uploader${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node scripts/upload-config.js [options]

${colors.cyan}Options:${colors.reset}
  -f, --file <path>              Path to JSON file (default: src/assets/mock/data.json)
  -t, --tenant <slug>            Tenant key (e.g. pushtiprakash). If omitted, uploads to root /app_config
      --target <rtdb|storage|both> Firebase destination (default: both)
  -d, --dry-run                  Perform local validation only; do not upload to Firebase
  -s, --service-account <path>   Path to serviceAccountKey.json
      --no-timestamp             Keep original lastUpdatedIso without bumping to now
  -h, --help                     Show this help message
`);
}

// --- 2. Schema Validation Engine ---
function validateSchema(payload) {
  const errors = [];
  const warnings = [];

  // 1. Root structure
  if (!payload || typeof payload !== 'object') {
    return { errors: ['Payload must be a valid JSON object.'], warnings: [] };
  }

  const requiredRootKeys = [
    'schemaVersion',
    'lastUpdatedIso',
    'app_identity',
    'supportedLanguages',
    'ui_translations',
    'books',
    'notification_schedules'
  ];

  for (const key of requiredRootKeys) {
    if (payload[key] === undefined || payload[key] === null) {
      errors.push(`Missing required root property: "${key}"`);
    }
  }

  if (typeof payload.schemaVersion !== 'number') {
    errors.push(`"schemaVersion" must be a number (e.g. 1).`);
  }

  // 2. App Identity & Theme
  if (payload.app_identity) {
    const identity = payload.app_identity;
    if (!identity.defaultAppName || typeof identity.defaultAppName !== 'string') {
      errors.push(`"app_identity.defaultAppName" is required and must be a string.`);
    }

    if (!identity.theme || typeof identity.theme !== 'object') {
      errors.push(`"app_identity.theme" object is required.`);
    } else {
      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      const requiredColors = ['primary', 'secondary', 'tertiary', 'background'];

      for (const c of requiredColors) {
        const val = identity.theme[c];
        if (!val || typeof val !== 'string') {
          errors.push(`"app_identity.theme.${c}" color is required.`);
        } else if (!hexColorRegex.test(val.trim())) {
          errors.push(`"app_identity.theme.${c}" ("${val}") must be a valid hex color code (e.g. #8B2635).`);
        }
      }
    }
  }

  // 3. Supported Languages
  if (!Array.isArray(payload.supportedLanguages) || payload.supportedLanguages.length === 0) {
    errors.push(`"supportedLanguages" must be a non-empty array of language objects.`);
  } else {
    const hasEnabled = payload.supportedLanguages.some(l => l.isEnabled === true);
    if (!hasEnabled) {
      errors.push(`At least one language in "supportedLanguages" must have "isEnabled: true".`);
    }

    payload.supportedLanguages.forEach((lang, idx) => {
      if (!lang.code || typeof lang.code !== 'string') {
        errors.push(`supportedLanguages[${idx}]: missing string property "code" (e.g. "hi").`);
      }
      if (!lang.name || typeof lang.name !== 'string') {
        errors.push(`supportedLanguages[${idx}]: missing string property "name" (e.g. "हिन्दी").`);
      }
      if (!lang.ttsLocale || typeof lang.ttsLocale !== 'string') {
        errors.push(`supportedLanguages[${idx}]: missing string property "ttsLocale" (e.g. "hi-IN").`);
      }
    });
  }

  // 4. Books & Chapters Integrity
  if (!Array.isArray(payload.books)) {
    errors.push(`"books" must be an array.`);
  } else {
    const bookIds = new Set();
    const chapterIds = new Set();

    payload.books.forEach((book, bIdx) => {
      if (!book.id || typeof book.id !== 'string') {
        errors.push(`books[${bIdx}]: missing unique string "id".`);
      } else if (bookIds.has(book.id)) {
        errors.push(`Duplicate book ID detected: "${book.id}".`);
      } else {
        bookIds.add(book.id);
      }

      if (!book.title || typeof book.title !== 'object') {
        errors.push(`books[${bIdx}] (${book.id || 'unknown'}): missing localized "title" map.`);
      }

      if (!Array.isArray(book.chapters)) {
        errors.push(`books[${bIdx}] (${book.id || 'unknown'}): "chapters" must be an array.`);
      } else {
        book.chapters.forEach((chapter, cIdx) => {
          if (!chapter.id || typeof chapter.id !== 'string') {
            errors.push(`books[${book.id}].chapters[${cIdx}]: missing unique string "id".`);
          } else if (chapterIds.has(chapter.id)) {
            errors.push(`Duplicate chapter ID detected across books: "${chapter.id}".`);
          } else {
            chapterIds.add(chapter.id);
          }

          if (!chapter.title || typeof chapter.title !== 'object') {
            errors.push(`chapter "${chapter.id}": missing localized "title" map.`);
          }

          if (!chapter.transcript || typeof chapter.transcript !== 'object') {
            errors.push(`chapter "${chapter.id}": missing localized "transcript" map.`);
          }

          // Check audioUrl fallback note
          if (chapter.audioUrl && typeof chapter.audioUrl === 'object') {
            const hasAudio = Object.values(chapter.audioUrl).some(url => url && url.trim().length > 0);
            if (!hasAudio) {
              warnings.push(`Chapter "${chapter.id}" has empty audioUrl; will automatically use native Text-to-Speech (TTS).`);
            }
          }
        });
      }
    });
  }

  // 5. Notification Schedules
  if (payload.notification_schedules && Array.isArray(payload.notification_schedules)) {
    payload.notification_schedules.forEach((item, idx) => {
      if (typeof item.id !== 'number') {
        errors.push(`notification_schedules[${idx}]: "id" must be an integer.`);
      }
      if (typeof item.hour !== 'number' || item.hour < 0 || item.hour > 23) {
        errors.push(`notification_schedules[${idx}] (id: ${item.id}): "hour" must be between 0 and 23.`);
      }
      if (typeof item.minute !== 'number' || item.minute < 0 || item.minute > 59) {
        errors.push(`notification_schedules[${idx}] (id: ${item.id}): "minute" must be between 0 and 59.`);
      }
    });
  }

  return { errors, warnings };
}

// --- 3. Firebase Deployment Logic ---
async function deployToFirebase(payload, cliConfig) {
  const serviceAccountPath = path.resolve(cliConfig.serviceAccount);
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Service Account JSON not found at: ${serviceAccountPath}.\n` +
      `Provide a valid file via --service-account or GOOGLE_APPLICATION_CREDENTIALS.`
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
      storageBucket: `${serviceAccount.project_id}.appspot.com`
    });
  }

  const results = [];
  const tenantSlug = cliConfig.tenant ? cliConfig.tenant.trim() : null;

  // Realtime Database Upload
  if (cliConfig.target === 'rtdb' || cliConfig.target === 'both') {
    const db = admin.database();
    const dbPath = tenantSlug ? `tenants/${tenantSlug}/app_config` : 'app_config';
    console.log(`${colors.cyan}ℹ Uploading to Firebase Realtime Database at /${dbPath}...${colors.reset}`);

    await db.ref(dbPath).set(payload);
    results.push(`Realtime DB: /${dbPath}`);
  }

  // Cloud Storage Upload
  if (cliConfig.target === 'storage' || cliConfig.target === 'both') {
    const bucket = admin.storage().bucket();
    const storagePath = tenantSlug
      ? `tenants/${tenantSlug}/config/app_config.json`
      : 'config/app_config.json';

    console.log(`${colors.cyan}ℹ Uploading to Firebase Storage at ${storagePath}...${colors.reset}`);

    const file = bucket.file(storagePath);
    await file.save(JSON.stringify(payload, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'no-cache, no-store, must-revalidate'
      }
    });

    results.push(`Cloud Storage: ${storagePath}`);
  }

  return results;
}

// --- 4. Main Orchestrator ---
async function main() {
  console.log(`\n${colors.bold}=== White-Label Reader: Firebase Config Validator & Uploader ===${colors.reset}\n`);
  const cliConfig = parseArgs();

  // 1. Read JSON file
  const jsonPath = path.resolve(cliConfig.file);
  console.log(`Loading JSON from: ${colors.cyan}${jsonPath}${colors.reset}`);

  if (!fs.existsSync(jsonPath)) {
    console.error(`${colors.red}✖ Error: File not found at ${jsonPath}${colors.reset}`);
    process.exit(1);
  }

  let rawData;
  let payload;
  try {
    rawData = fs.readFileSync(jsonPath, 'utf8');
    payload = JSON.parse(rawData);
  } catch (err) {
    console.error(`${colors.red}✖ Failed to parse JSON: ${err.message}${colors.reset}`);
    process.exit(1);
  }

  // 2. Validate Schema
  console.log(`Validating schema integrity...`);
  const { errors, warnings } = validateSchema(payload);

  if (warnings.length > 0) {
    console.log(`\n${colors.yellow}${colors.bold}Warnings:${colors.reset}`);
    warnings.forEach(w => console.log(`  ${colors.yellow}⚠ ${w}${colors.reset}`));
  }

  if (errors.length > 0) {
    console.log(`\n${colors.red}${colors.bold}Validation Failed (${errors.length} error${errors.length > 1 ? 's' : ''}):${colors.reset}`);
    errors.forEach(e => console.log(`  ${colors.red}✖ ${e}${colors.reset}`));
    console.log(`\n${colors.red}Aborted: Fix schema errors before deploying.${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.green}✔ Schema validation passed successfully.${colors.reset}`);

  // 3. Stamp UTC ISO Timestamp (Hot-Update Trigger)
  if (cliConfig.autoTimestamp && !cliConfig.dryRun) {
    payload.lastUpdatedIso = new Date().toISOString();
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`${colors.cyan}✔ Updated "lastUpdatedIso" to ${payload.lastUpdatedIso} in local file.${colors.reset}`);
  }

  // 4. Handle Dry-Run
  if (cliConfig.dryRun) {
    console.log(`\n${colors.yellow}${colors.bold}DRY RUN COMPLETE:${colors.reset} File is valid and ready for upload. No remote changes were made.\n`);
    process.exit(0);
  }

  // 5. Upload to Firebase
  try {
    const deployedLocations = await deployToFirebase(payload, cliConfig);
    console.log(`\n${colors.green}${colors.bold}✔ Upload Complete!${colors.reset}`);
    deployedLocations.forEach(loc => console.log(`  ${colors.green}• ${loc}${colors.reset}`));
    console.log(`\n${colors.cyan}Active devices will hot-update theme, content, and notifications on next launch or resume.${colors.reset}\n`);
  } catch (err) {
    console.error(`\n${colors.red}✖ Firebase Deployment Failed: ${err.message}${colors.reset}\n`);
    process.exit(1);
  }
}

main();