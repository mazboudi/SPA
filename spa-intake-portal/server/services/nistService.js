import { getCachedNistRisk, saveNistRisk } from '../db/database.js';

const NIST_API_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const NIST_API_KEY = process.env.NIST_API_KEY || '193AB9A0-0264-47CD-84C9-A22707636662';

/**
 * Clean software title name for optimal NIST keyword search
 */
export function cleanSearchKeyword(titleName = '') {
  if (!titleName) return '';
  return titleName
    .replace(/\b(Enterprise|Professional|Community|Desktop|Edition|Corporation|Inc\.|LLC|Ltd\.|Software|Client|Tool|for Windows|Win32|x64|x86)\b/gi, '')
    .replace(/[()[\]{}]/g, '')
    .trim();
}

/**
 * Extract the highest CVSS v3.x score (or fallback to v2)
 */
function extractCvssScore(metrics = {}) {
  if (metrics.cvssMetricV31 && metrics.cvssMetricV31.length > 0) {
    const primary = metrics.cvssMetricV31.find(m => m.type === 'Primary') || metrics.cvssMetricV31[0];
    if (primary?.cvssData?.baseScore != null) {
      return {
        score: Number(primary.cvssData.baseScore),
        severity: primary.cvssData.baseSeverity || 'UNKNOWN',
        version: '3.1',
      };
    }
  }

  if (metrics.cvssMetricV30 && metrics.cvssMetricV30.length > 0) {
    const primary = metrics.cvssMetricV30.find(m => m.type === 'Primary') || metrics.cvssMetricV30[0];
    if (primary?.cvssData?.baseScore != null) {
      return {
        score: Number(primary.cvssData.baseScore),
        severity: primary.cvssData.baseSeverity || 'UNKNOWN',
        version: '3.0',
      };
    }
  }

  if (metrics.cvssMetricV2 && metrics.cvssMetricV2.length > 0) {
    const primary = metrics.cvssMetricV2.find(m => m.type === 'Primary') || metrics.cvssMetricV2[0];
    if (primary?.cvssData?.baseScore != null) {
      return {
        score: Number(primary.cvssData.baseScore),
        severity: primary.baseSeverity || 'UNKNOWN',
        version: '2.0',
      };
    }
  }

  return { score: 0, severity: 'NONE', version: null };
}

/**
 * Perform a query against the NIST NVD 2.0 API with a timeout
 */
async function queryNistApi(params = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') query.append(k, String(v));
  }

  const url = `${NIST_API_URL}?${query.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

  try {
    const res = await fetch(url, {
      headers: {
        'apiKey': NIST_API_KEY,
        'User-Agent': 'SPA-Enterprise-Intake-Engine/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`NIST NVD API returned HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Evaluate NIST Security Risk and 12-point criteria for a given software title
 */
export async function evaluateNistRisk(titleName, version = '', forceRefresh = false) {
  if (!titleName || typeof titleName !== 'string') {
    throw new Error('titleName is required for NIST risk evaluation');
  }

  // Check cache first
  if (!forceRefresh) {
    const cached = getCachedNistRisk(titleName, version);
    if (cached) return cached;
  }

  const keyword = cleanSearchKeyword(titleName) || titleName.trim();
  const violations = [];
  let maxCvss = 0;
  let highestSeverity = 'CLEAN';
  let totalCves = 0;
  let topCves = [];
  let trendingCount = 0;

  try {
    // 1. All-time search for top CVEs and maximum CVSS score
    const allTimeData = await queryNistApi({
      keywordSearch: keyword,
      resultsPerPage: 25,
    });

    totalCves = allTimeData.totalResults || 0;
    const items = allTimeData.vulnerabilities || [];

    topCves = items.map(item => {
      const cve = item.cve || {};
      const { score, severity, version: cvssVer } = extractCvssScore(cve.metrics);
      if (score > maxCvss) {
        maxCvss = score;
        highestSeverity = severity;
      }

      const desc = (cve.descriptions || []).find(d => d.lang === 'en')?.value || 'No description provided';
      return {
        id: cve.id,
        published: cve.published,
        lastModified: cve.lastModified,
        cvss: score,
        severity,
        cvssVersion: cvssVer,
        description: desc.length > 280 ? desc.slice(0, 280) + '...' : desc,
        nvdUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      };
    });

    // Sort by CVSS score descending
    topCves.sort((a, b) => b.cvss - a.cvss);

    // 2. 30-60 day trending vulnerability search
    try {
      const now = new Date();
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const trendingData = await queryNistApi({
        keywordSearch: keyword,
        pubStartDate: sixtyDaysAgo.toISOString().replace('Z', ''),
        pubEndDate: now.toISOString().replace('Z', ''),
        resultsPerPage: 20,
      });

      const trendingItems = trendingData.vulnerabilities || [];
      trendingCount = trendingItems.filter(item => {
        const { score } = extractCvssScore(item.cve?.metrics);
        return score >= 4.0; // Medium or higher
      }).length;
    } catch (trendErr) {
      console.warn('NIST trending window query warning:', trendErr.message);
    }
  } catch (apiErr) {
    console.error(`NIST API evaluation error for "${titleName}":`, apiErr.message);
    // If offline or NIST rate-limited, provide fallback clean evaluation with warning
    violations.push({
      rule: 'NIST_CONNECTIVITY',
      passed: false,
      message: `NIST NVD Live API query unavailable (${apiErr.message}). Reviewer must manually verify NVD.`,
    });
  }

  // ── RULE 1: NVD CVSS v3.x score >= 7.0 Check ─────────────────────────────
  const rule1Passed = maxCvss < 7.0;
  if (!rule1Passed) {
    violations.push({
      rule: 'CVSS_SCORE_THRESHOLD',
      passed: false,
      title: 'NVD CVSS v3.x Score Exceeds Enterprise Threshold',
      message: `Must not be associated with vulnerability with a NVD CVSS v3.x security score of >= 7.0. Current Max Score: ${maxCvss.toFixed(1)} (${highestSeverity}).`,
    });
  } else {
    violations.push({
      rule: 'CVSS_SCORE_THRESHOLD',
      passed: true,
      title: 'CVSS Score Within Tolerable Threshold',
      message: maxCvss > 0
        ? `Max CVSS v3.x score is ${maxCvss.toFixed(1)} (under 7.0 threshold).`
        : `No known high/critical CVEs identified in NIST NVD database.`,
    });
  }

  // ── RULE 2: Trending Medium+ Vulnerabilities (30-60 days) ──────────────────
  const rule2Passed = trendingCount === 0;
  if (!rule2Passed) {
    violations.push({
      rule: 'TRENDING_VULNERABILITIES',
      passed: false,
      title: 'Active Trending Vulnerabilities in Last 30-60 Days',
      message: `Found ${trendingCount} trending vulnerability/vulnerabilities with medium or higher CVSS score in the last 60 days. Requires AppSec mitigation review.`,
    });
  } else {
    violations.push({
      rule: 'TRENDING_VULNERABILITIES',
      passed: true,
      title: 'No Trending Vulnerabilities',
      message: `Zero trending >= medium vulnerabilities identified in the 30-60 day analysis window.`,
    });
  }

  // Calculate overall risk level
  let riskLevel = 'CLEAN';
  if (maxCvss >= 9.0) riskLevel = 'CRITICAL';
  else if (maxCvss >= 7.0) riskLevel = 'HIGH';
  else if (maxCvss >= 4.0) riskLevel = 'MEDIUM';
  else if (maxCvss > 0) riskLevel = 'LOW';

  const evalResult = {
    titleName,
    version,
    riskScore: maxCvss,
    riskLevel,
    maxCvss,
    trendingCount,
    totalCves,
    cves: topCves.slice(0, 10),
    violations,
    fetchedAt: new Date().toISOString(),
  };

  // Save to SQLite cache
  saveNistRisk(evalResult);

  return evalResult;
}
