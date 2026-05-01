#!/usr/bin/env node
/**
 * fetch-jamf-categories.js
 *
 * Fetches Jamf Pro categories via the v1 API and writes them to
 * src/data/jamf-categories.json for use in the SPA Title Wizard.
 *
 * Usage:
 *   JAMF_URL=https://your-jamf.example.com \
 *   JAMF_CLIENT_ID=your-api-client-id \
 *   JAMF_CLIENT_SECRET=your-api-client-secret \
 *   npm run scripts/fetch-jamf-categories.js
 *
 * Or with basic auth:
 *   JAMF_URL=https://your-jamf.example.com \
 *   JAMF_USERNAME=admin \
 *   JAMF_PASSWORD=password \
 *   node scripts/fetch-jamf-categories.js
 *
 * The output file (src/data/jamf-categories.json) should be committed to the
 * repo so the wizard works offline. Re-run this script periodically to pick
 * up new categories.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '../src/data/jamf-categories.json');

async function getToken(baseUrl) {
  // Try API client credentials first (Jamf Pro 10.49+)
  if (process.env.JAMF_CLIENT_ID && process.env.JAMF_CLIENT_SECRET) {
    const resp = await fetch(`${baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.JAMF_CLIENT_ID,
        client_secret: process.env.JAMF_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });
    if (!resp.ok) throw new Error(`OAuth token request failed: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    return data.access_token;
  }

  // Fall back to basic auth → bearer token
  if (process.env.JAMF_USERNAME && process.env.JAMF_PASSWORD) {
    const creds = Buffer.from(`${process.env.JAMF_USERNAME}:${process.env.JAMF_PASSWORD}`).toString('base64');
    const resp = await fetch(`${baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}` },
    });
    if (!resp.ok) throw new Error(`Basic auth token request failed: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    return data.token;
  }

  throw new Error('Set JAMF_CLIENT_ID + JAMF_CLIENT_SECRET or JAMF_USERNAME + JAMF_PASSWORD');
}

async function fetchCategories(baseUrl, token) {
  const allCategories = [];
  let page = 0;
  const pageSize = 100;

  while (true) {
    const url = `${baseUrl}/api/v1/categories?page=${page}&page-size=${pageSize}&sort=name%3Aasc`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`Categories request failed: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();

    allCategories.push(...data.results);

    if (allCategories.length >= data.totalCount) break;
    page++;
  }

  return allCategories;
}

async function main() {
  const baseUrl = (process.env.JAMF_URL || '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('Error: JAMF_URL environment variable is required');
    process.exit(1);
  }

  console.log(`Connecting to Jamf Pro: ${baseUrl}`);

  const token = await getToken(baseUrl);
  console.log('Authenticated successfully');

  const categories = await fetchCategories(baseUrl, token);
  console.log(`Fetched ${categories.length} categories`);

  // Normalize to a simple { id, name } array
  const output = categories.map(c => ({
    id: String(c.id),
    name: c.name,
  }));

  // Ensure output directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Written to: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
