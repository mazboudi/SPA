#!/usr/bin/env node
/**
 * generate-intune-index.mjs
 *
 * Scans RefactorApps/IntuneExport/ and produces:
 *   1. public/intune-catalog-index.json  — lightweight search index
 *   2. public/intune-exports/*.json      — full export files for on-demand fetch
 *
 * Run:  node scripts/generate-intune-index.mjs
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const EXPORT_DIR = join(REPO_ROOT, 'RefactorApps', 'IntuneExport');
const PUBLIC_DIR = join(resolve(import.meta.dirname, '..'), 'public');
const INDEX_FILE = join(PUBLIC_DIR, 'intune-catalog-index.json');
const EXPORTS_OUT = join(PUBLIC_DIR, 'intune-exports');

// Ensure output dirs exist
mkdirSync(EXPORTS_OUT, { recursive: true });

const files = readdirSync(EXPORT_DIR).filter(f => f.endsWith('.json'));
console.log(`Found ${files.length} Intune export files.`);

const index = [];

for (const file of files) {
  try {
    const raw = readFileSync(join(EXPORT_DIR, file), 'utf-8');
    const data = JSON.parse(raw);
    const app = data.app || {};

    index.push({
      appId: data.appId || app.id || '',
      displayName: data.displayName || app.displayName || basename(file, '.json'),
      publisher: app.publisher || '',
      version: app.displayVersion || '',
      description: app.description || '',
      fileName: file,
    });

    // Copy full export to public dir
    cpSync(join(EXPORT_DIR, file), join(EXPORTS_OUT, file));
  } catch (err) {
    console.warn(`  ⚠ Skipping ${file}: ${err.message}`);
  }
}

// Sort alphabetically by displayName
index.sort((a, b) => a.displayName.localeCompare(b.displayName));

writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
console.log(`✅ Wrote ${index.length} entries to ${INDEX_FILE}`);
console.log(`✅ Copied exports to ${EXPORTS_OUT}`);
