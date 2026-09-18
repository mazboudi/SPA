#!/usr/bin/env node
/**
 * extract-intune-catalog.mjs
 *
 * Standalone Intune Catalog Extraction Tool
 *
 * Capabilities:
 * 1. Live Microsoft Graph API extraction (using Azure credentials from spa-title-wizard/server/.env or CLI).
 * 2. Offline / Local Export extraction from RefactorApps/IntuneExport/ or public/intune-exports/.
 * 3. Automatic model-matching normalization (clean title, publisher, normalized lookup key, clean version).
 * 4. Extraction of all packaging properties: install/uninstall commands, detection rules, MSI product codes,
 *    source UNC paths, assignments, supersedence, and dependencies.
 * 5. Optional cross-referencing against the local SQLite Authoritative Software Catalog to report matching status.
 *
 * Usage:
 *   node scripts/extract-intune-catalog.mjs [options]
 *
 * Options:
 *   --source <auto|graph|local>   Extraction source (default: auto)
 *   --dir <path>                  Local export folder (default: RefactorApps/IntuneExport)
 *   --env <path>                  Path to .env file (default: spa-title-wizard/server/.env)
 *   --out <path>                  Output JSON file (default: intune-catalog-extracted.json)
 *   --csv <path>                  Output CSV summary file (default: intune-catalog-extracted.csv)
 *   --limit <number>              Limit maximum apps to extract
 *   --match-db                    Cross-reference against intake.db software_titles
 *   --help                        Show help message
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Allow self-signed / corporate proxy TLS inspection certificates (matches spa-title-wizard server)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// ── Parse Command Line Arguments ─────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
📦 Standalone Intune Catalog Extraction Tool

Usage:
  node scripts/extract-intune-catalog.mjs [options]

Options:
  --source <auto|graph|local>   Extraction source (default: auto)
  --dir <path>                  Directory with Intune export JSONs (default: RefactorApps/IntuneExport)
  --env <path>                  Path to .env containing Azure credentials (default: spa-title-wizard/server/.env)
  --out <path>                  Output JSON path (default: intune-catalog-extracted.json)
  --csv <path>                  Output CSV path (default: intune-catalog-extracted.csv)
  --limit <number>              Limit maximum number of apps to extract
  --match-db                    Cross-reference with local SQLite intake.db software models
  --tenant <id>                 Override Azure Tenant ID
  --client-id <id>              Override Azure Client ID
  --client-secret <secret>      Override Azure Client Secret
  --token <token>               Use direct Bearer access token
  --help                        Show this help text
`);
  process.exit(0);
}

const sourceMode = getArg('--source', 'auto'); // 'auto', 'graph', 'local'
const localExportDir = resolve(REPO_ROOT, getArg('--dir', 'RefactorApps/IntuneExport'));
const outputJsonPath = resolve(REPO_ROOT, getArg('--out', 'intune-catalog-extracted.json'));
const outputCsvPath = resolve(REPO_ROOT, getArg('--csv', 'intune-catalog-extracted.csv'));
const limitArg = getArg('--limit') ? parseInt(getArg('--limit'), 10) : null;
const shouldMatchDb = hasFlag('--match-db');

// ── Read Environment Variables (Multi-path Discovery) ───────────────────────
function loadEnv() {
  const env = { ...process.env };
  const candidatePaths = [
    getArg('--env'),
    resolve(REPO_ROOT, 'spa-title-wizard/server/.env'),
    resolve(REPO_ROOT, '.env'),
    resolve(process.cwd(), 'server/.env'),
    resolve(process.cwd(), '.env'),
  ].filter(Boolean);

  let loadedFrom = null;
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (!env[k] || env[k].includes('xxxx')) env[k] = v;
          }
        }
        loadedFrom = p;
        break;
      } catch (_) {}
    }
  }
  return { env, loadedFrom };
}

const { env: envConfig, loadedFrom: envLoadedPath } = loadEnv();
const AZURE_TENANT_ID = getArg('--tenant') || envConfig.AZURE_TENANT_ID || '';
const AZURE_CLIENT_ID = getArg('--client-id') || envConfig.AZURE_CLIENT_ID || '';
const AZURE_CLIENT_SECRET = getArg('--client-secret') || envConfig.AZURE_CLIENT_SECRET || '';
const DIRECT_TOKEN = getArg('--token') || envConfig.GRAPH_TOKEN || envConfig.AZURE_BEARER_TOKEN || process.env.GRAPH_TOKEN || '';

const isGraphConfigured = Boolean(
  DIRECT_TOKEN ||
  (AZURE_TENANT_ID &&
   AZURE_CLIENT_ID &&
   AZURE_CLIENT_SECRET &&
   !AZURE_TENANT_ID.includes('xxxx') &&
   !AZURE_CLIENT_ID.includes('xxxx'))
);

// ── Clean & Normalization Helpers for Model Matching ─────────────────────────
function normalizeString(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Normalizes title by removing version tags, bitness (x64, 64-bit), and pilot tags
 * to cleanly match against authoritative Software Models.
 */
function cleanTitleForMatching(rawTitle) {
  if (!rawTitle) return 'Unknown Title';
  let cleaned = rawTitle
    .replace(/\b(x64|x86|64-bit|32-bit|arm64)\b/gi, '')
    .replace(/\b(v|ver\.?|version)\s*\d+(\.\d+)*\b/gi, '')
    .replace(/\b(for Windows|for Mac|for macOS)\b/gi, '')
    .replace(/\b(Pilot|Package|Installer|Deploy|Setup|Win32)\b/gi, '')
    .replace(/\[.*?\]|\(.*?\)/g, '') // remove bracketed text
    .replace(/\s+/g, ' ')
    .trim();

  // If over-cleaned, revert to original trimmed title
  return cleaned.length >= 2 ? cleaned : rawTitle.trim();
}

function cleanPublisherForMatching(rawPub) {
  if (!rawPub) return 'Unknown Publisher';
  return rawPub
    .replace(/\b(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?|GmbH|Co\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || rawPub.trim();
}

function cleanVersion(rawVer) {
  if (!rawVer) return '1.0.0';
  const match = rawVer.match(/\d+(\.\d+)+/);
  return match ? match[0] : rawVer.trim();
}

function extractUncPath(text) {
  if (!text) return null;
  const match = text.match(/\\\\[a-zA-Z0-9_$.-]+\\[a-zA-Z0-9_$.-\\]+/);
  return match ? match[0] : null;
}

function extractMsiProductCode(detectionRules, msiInformation) {
  if (msiInformation && msiInformation.productCode) return msiInformation.productCode;
  if (!Array.isArray(detectionRules)) return null;

  for (const rule of detectionRules) {
    if (rule.productCode) return rule.productCode;
    const path = rule.keyPath || rule.path || '';
    const match = path.match(/\{[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\}/i);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

function summarizeDetectionRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return 'None';
  return rules.map(r => {
    const type = (r['@odata.type'] || '').split('.').pop().replace('Detection', '') || 'Rule';
    if (r.productCode) return `MSI: ${r.productCode}`;
    if (r.keyPath) return `Registry: ${r.keyPath} (${r.valueName || 'Default'})`;
    if (r.path && r.fileOrFolderName) return `File: ${r.path}\\${r.fileOrFolderName}`;
    if (r.scriptContent) return 'PowerShell Script Detection';
    return type;
  }).join('; ');
}

// ── Standardize Record for Model Matching ─────────────────────────────────────
function standardizeAppRecord(rawApp, extra = {}) {
  const app = rawApp.app || rawApp;
  const appId = app.id || rawApp.appId || '';
  const rawDisplayName = app.displayName || rawApp.displayName || 'Unnamed Application';
  const rawPublisher = app.publisher || rawApp.publisher || 'Unknown Publisher';
  const displayVersion = app.displayVersion || rawApp.displayVersion || app.version || rawApp.version || 'Standard';

  const cleanTitle = cleanTitleForMatching(rawDisplayName);
  const cleanPub = cleanPublisherForMatching(rawPublisher);
  const normalizedKey = `${cleanPub.toLowerCase()}::${cleanTitle.toLowerCase()}`;

  const odataType = app['@odata.type'] || rawApp.odataType || '#microsoft.graph.win32LobApp';
  const isMac = odataType.toLowerCase().includes('mac') || (app.applicableArchitectures || '').toLowerCase().includes('mac');
  const platform = isMac ? 'macos' : 'windows';

  const detectionRules = app.detectionRules || rawApp.detectionRules || [];
  const requirementRules = app.requirementRules || rawApp.requirementRules || [];
  const assignments = rawApp.assignments || [];
  const supersedence = rawApp.supersedence || [];
  const dependencies = rawApp.dependencies || [];
  const categories = (rawApp.categories || []).map(c => c.displayName || c).filter(Boolean);

  const msiProductCode = extractMsiProductCode(detectionRules, app.msiInformation);
  const uncSourcePath = extractUncPath(app.notes) || extractUncPath(app.description) || null;

  // Extract unique assigned intents and groups
  const assignedIntents = [...new Set(assignments.map(a => a.intent).filter(Boolean))];
  const assignedGroupIds = assignments.map(a => a.target?.groupId).filter(Boolean);

  return {
    // ── Primary Identity & Model Matching Keys ──
    intuneAppId: appId,
    rawDisplayName,
    cleanTitle,
    rawPublisher,
    cleanPublisher: cleanPub,
    normalizedKey,
    displayVersion,
    cleanVersion: cleanVersion(displayVersion),
    platform,

    // ── Intune Governance & Classification ──
    odataType,
    categories: categories.length > 0 ? categories : ['General Business'],
    publishingState: app.publishingState || 'published',
    isAssigned: Boolean(app.isAssigned || assignments.length > 0),
    assignmentCount: assignments.length,
    assignedIntents,
    assignedGroupIds,

    // ── Concrete Packaging & Artifact Details ──
    packagingStatus: app.publishingState === 'published' ? 'Packaged & Ready' : 'Available',
    fileName: app.fileName || null,
    setupFilePath: app.setupFilePath || null,
    installCommandLine: app.installCommandLine || null,
    uninstallCommandLine: app.uninstallCommandLine || null,
    sizeInBytes: app.size || null,
    sizeFormatted: app.size ? `${(app.size / (1024 * 1024)).toFixed(2)} MB` : null,
    msiProductCode,
    detectionSummary: summarizeDetectionRules(detectionRules),
    sourceSharePath: uncSourcePath,
    notes: app.notes || null,
    description: app.description || null,

    // ── Enterprise Relationships ──
    supersededAppIds: supersedence.map(s => s.supersededAppId || s.targetId || s).filter(Boolean),
    dependentAppIds: dependencies.map(d => d.appId || d.targetId || d).filter(Boolean),

    // ── Timestamps ──
    createdDateTime: app.createdDateTime || null,
    lastModifiedDateTime: app.lastModifiedDateTime || null,
    extractedAt: new Date().toISOString(),
  };
}

// ── Mode 1: Live Microsoft Graph API Extractor ────────────────────────────────
async function extractFromGraphApi() {
  let token = DIRECT_TOKEN;

  if (!token) {
    const mask = (s) => (s && s.length > 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : '***');
    console.log('🌐 Connecting to Microsoft Graph API (Intune beta endpoint)...');
    console.log(`   Tenant ID:      ${mask(AZURE_TENANT_ID)}`);
    console.log(`   Client ID:      ${mask(AZURE_CLIENT_ID)}`);
    console.log(`   Client Secret:  [configured, length ${AZURE_CLIENT_SECRET.length}]`);
    if (envLoadedPath) {
      console.log(`   Config Source:  ${envLoadedPath}`);
    }

    // Token acquisition
    const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    });

    let tokenRes;
    try {
      tokenRes = await fetch(tokenUrl, { method: 'POST', body });
    } catch (netErr) {
      let cause = netErr.cause ? (netErr.cause.message || netErr.cause.code || netErr.cause) : netErr.message;
      throw new Error(`Connection to login.microsoftonline.com failed: ${cause}\n   💡 Tip: Check corporate proxy / VPN settings if traffic is intercepted.`);
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Graph token authentication failed (HTTP ${tokenRes.status}): ${errText}`);
    }

    const tokenData = await tokenRes.json();
    token = tokenData.access_token;
    console.log(`   ✅ Azure AD token acquired (expires in ${tokenData.expires_in}s).`);
  } else {
    console.log('🌐 Using provided Direct Bearer Token for Microsoft Graph API...');
  }

  const headers = { Authorization: `Bearer ${token}` };
  const GRAPH_BASE = 'https://graph.microsoft.com/beta';
  const apps = [];

  // Paged fetch for all Win32 and Mobile apps
  let url = `${GRAPH_BASE}/deviceAppManagement/mobileApps?$top=100`;
  let page = 1;

  while (url) {
    process.stdout.write(`   📥 Fetching Graph mobileApps page ${page}... `);
    let r;
    try {
      r = await fetch(url, { headers });
    } catch (netErr) {
      let cause = netErr.cause ? (netErr.cause.message || netErr.cause.code || netErr.cause) : netErr.message;
      throw new Error(`Connection to graph.microsoft.com failed: ${cause}`);
    }

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Graph mobileApps query failed (HTTP ${r.status}): ${errText}`);
    }

    const data = await r.json();
    const batch = data.value || [];
    apps.push(...batch);
    console.log(`got ${batch.length} apps (total: ${apps.length})`);

    if (limitArg && apps.length >= limitArg) {
      apps.splice(limitArg);
      break;
    }

    url = data['@odata.nextLink'] || null;
    page++;
  }

  console.log(`\n✅ Graph API returned ${apps.length} total raw application records.`);

  // Standardize results
  return apps.map(app => standardizeAppRecord(app));
}

// ── Mode 2: Local Directory Extractor ─────────────────────────────────────────
function extractFromLocalDirectory(dirPath) {
  console.log(`📂 Scanning local Intune export bundles from: ${dirPath}`);
  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const files = readdirSync(dirPath).filter(f => f.endsWith('.json'));
  console.log(`   Found ${files.length} JSON export files.`);

  const records = [];
  let errorCount = 0;

  for (let i = 0; i < files.length; i++) {
    if (limitArg && records.length >= limitArg) break;
    const file = files[i];
    try {
      const rawText = readFileSync(join(dirPath, file), 'utf8');
      const data = JSON.parse(rawText);
      const standardized = standardizeAppRecord(data, { fileName: file });
      records.push(standardized);
    } catch (err) {
      errorCount++;
    }
  }

  console.log(`✅ Successfully parsed ${records.length} applications from local export bundles (${errorCount} errors).`);
  return records;
}

// ── Cross-Reference with Local SQLite Database ────────────────────────────────
async function crossReferenceWithSqlite(records) {
  const dbPath = resolve(REPO_ROOT, 'spa-intake-portal/server/data/intake.db');
  if (!existsSync(dbPath)) {
    console.log('⚠️  Local intake.db not found; skipping model cross-referencing.');
    return records;
  }

  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);

    const titleStmt = db.prepare('SELECT id, displayName, publisher FROM software_titles');
    const allTitles = titleStmt.all();

    const titleMap = new Map();
    allTitles.forEach(t => {
      const k = `${cleanPublisherForMatching(t.publisher).toLowerCase()}::${cleanTitleForMatching(t.displayName).toLowerCase()}`;
      titleMap.set(k, t);
    });

    console.log(`🔍 Cross-referencing against ${allTitles.length} authoritative models in SQLite...`);

    let matchedCount = 0;
    records.forEach(r => {
      const match = titleMap.get(r.normalizedKey);
      if (match) {
        r.matchedModelId = match.id;
        r.matchedModelName = match.displayName;
        r.matchedModelPublisher = match.publisher;
        r.matchStatus = 'MATCHED_BASE_MODEL';
        matchedCount++;
      } else {
        r.matchedModelId = null;
        r.matchStatus = 'UNMATCHED_NEW_MODEL';
      }
    });

    console.log(`   ✅ Matched ${matchedCount}/${records.length} Intune packages to existing Software Models!`);
    return records;
  } catch (err) {
    console.warn(`   ⚠️ SQLite cross-reference note: ${err.message}`);
    return records;
  }
}

// ── Export CSV Summary Helper ────────────────────────────────────────────────
function writeCsvSummary(records, csvPath) {
  const headers = [
    'intuneAppId',
    'cleanTitle',
    'cleanPublisher',
    'displayVersion',
    'platform',
    'packagingStatus',
    'isAssigned',
    'assignmentCount',
    'assignedIntents',
    'msiProductCode',
    'sizeFormatted',
    'fileName',
    'sourceSharePath',
    'matchStatus',
    'matchedModelId',
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = Array.isArray(val) ? val.join(';') : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.join(',')];
  for (const r of records) {
    rows.push(headers.map(h => escapeCsv(r[h])).join(','));
  }

  writeFileSync(csvPath, rows.join('\n'), 'utf8');
  console.log(`📄 CSV summary exported to: ${csvPath}`);
}

// ── Main Execution Flow ──────────────────────────────────────────────────────
async function main() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🚀 Intune Catalog Extraction & Model Alignment Pipeline');
  console.log('════════════════════════════════════════════════════════════════════\n');

  let extractedRecords = [];

  // Determine Source
  let chosenSource = sourceMode;
  if (chosenSource === 'auto') {
    chosenSource = isGraphConfigured ? 'graph' : 'local';
  }

  console.log(`Extraction Mode: [${chosenSource.toUpperCase()}]`);

  if (chosenSource === 'graph') {
    if (!isGraphConfigured) {
      console.error('\n❌ Microsoft Graph API credentials are not configured.');
      console.log('   Please provide one of the following:');
      console.log('     1. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in spa-title-wizard/server/.env');
      console.log('     2. Pass credentials via CLI flags: --tenant <id> --client-id <id> --client-secret <secret>');
      console.log('     3. Pass an active bearer token: --token "<jwt>" or env GRAPH_TOKEN="<jwt>"\n');
      process.exit(1);
    }

    try {
      extractedRecords = await extractFromGraphApi();
    } catch (err) {
      console.error(`\n❌ Live Graph API extraction failed: ${err.message}\n`);
      process.exit(1);
    }
  } else {
    extractedRecords = extractFromLocalDirectory(localExportDir);
  }

  if (extractedRecords.length === 0) {
    console.error('❌ No Intune applications were extracted.');
    process.exit(1);
  }

  // Sort alphabetically by clean title
  extractedRecords.sort((a, b) => a.cleanTitle.localeCompare(b.cleanTitle));

  // Cross reference if requested
  if (shouldMatchDb) {
    extractedRecords = await crossReferenceWithSqlite(extractedRecords);
  }

  // Statistics Summary
  const platformStats = {};
  const publisherStats = {};
  let assignedCount = 0;
  let withUncCount = 0;
  let withMsiCount = 0;

  for (const r of extractedRecords) {
    platformStats[r.platform] = (platformStats[r.platform] || 0) + 1;
    publisherStats[r.cleanPublisher] = (publisherStats[r.cleanPublisher] || 0) + 1;
    if (r.isAssigned) assignedCount++;
    if (r.sourceSharePath) withUncCount++;
    if (r.msiProductCode) withMsiCount++;
  }

  // Write Output JSON
  const outputPayload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: chosenSource,
      totalApps: extractedRecords.length,
      platformBreakdown: platformStats,
      metrics: {
        assignedCount,
        unassignedCount: extractedRecords.length - assignedCount,
        withSourceSharePaths: withUncCount,
        withMsiProductCodes: withMsiCount,
      },
    },
    applications: extractedRecords,
  };

  writeFileSync(outputJsonPath, JSON.stringify(outputPayload, null, 2), 'utf8');
  console.log(`\n💾 Full JSON Catalog Export saved to: ${outputJsonPath}`);

  // Write CSV Summary
  writeCsvSummary(extractedRecords, outputCsvPath);

  // Print Summary Table
  console.log('\n📊 Extraction Summary:');
  console.log(`   • Total Applications:     ${extractedRecords.length}`);
  console.log(`   • Platforms:              Windows: ${platformStats.windows || 0} | macOS: ${platformStats.macos || 0}`);
  console.log(`   • Assigned to Groups:     ${assignedCount} (${Math.round(assignedCount / extractedRecords.length * 100)}%)`);
  console.log(`   • Source Share Paths:     ${withUncCount}`);
  console.log(`   • MSI Product Codes:      ${withMsiCount}`);

  console.log('\n🏷️  Top 5 Publishers:');
  const topPubs = Object.entries(publisherStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  topPubs.forEach(([p, c]) => console.log(`   • ${p}: ${c} package(s)`));

  console.log('\n🎉 Extraction complete! Records are ready to reconcile with the Base Software Model.\n');
}

main().catch(err => {
  console.error('\n❌ Fatal Extraction Error:', err);
  process.exit(1);
});
