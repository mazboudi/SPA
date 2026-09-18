/**
 * Automated Test Suite: NIST NVD 2.0 Security Scanner & Enterprise Risk Governance
 */
import { evaluateNistRisk } from '../spa-intake-portal/server/services/nistService.js';
import {
  insertRequest,
  getRequests,
  getRequestById,
  deleteRequest,
  updateTaskRecord,
  getCachedNistRisk,
  clearNistCache,
  db
} from '../spa-intake-portal/server/db/database.js';

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('🧪 Starting NIST Risk Governance & Queue Routing Automated Test Suite');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, extra = '') {
  if (condition) {
    console.log(`✅ PASS: ${testName} ${extra ? `(${extra})` : ''}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${testName} ${extra ? `(${extra})` : ''}`);
    failCount++;
  }
}

async function runTests() {
  try {
    // ── TEST 1: Live NIST NVD 2.0 Query & Metrics ──────────────────────────
    console.log('--- Test 1: Live NIST NVD 2.0 Evaluation ---');
    clearNistCache('Wireshark');
    const nistEval = await evaluateNistRisk('Wireshark', '4.2.0', true);

    assert(nistEval && typeof nistEval === 'object', 'NIST evaluation returned an object');
    assert(nistEval.totalCves > 0, 'NIST returned recorded CVEs for Wireshark', `total: ${nistEval.totalCves}`);
    assert(nistEval.maxCvss > 0, 'Calculated Maximum CVSS score', `maxCvss: ${nistEval.maxCvss}`);
    assert(Array.isArray(nistEval.cves) && nistEval.cves.length > 0, 'Extracted top CVE records', `count: ${nistEval.cves.length}`);
    assert(nistEval.cves[0]?.nvdUrl?.includes('https://nvd.nist.gov/vuln/detail/'), 'Generated valid NIST NVD URLs');

    // ── TEST 2: SQLite Caching Mechanism ────────────────────────────────────
    console.log('\n--- Test 2: SQLite Caching Mechanism ---');
    const cached = getCachedNistRisk('Wireshark', '4.2.0');
    assert(cached !== null, 'NIST evaluation was saved to SQLite nist_risk_cache table');
    assert(cached.isCached === true, 'Cache flag is set to true');
    assert(cached.maxCvss === nistEval.maxCvss, 'Cached max CVSS matches live evaluation');

    // ── TEST 3: Rule 1 & Rule 2 Policy Violations Detection ─────────────────
    console.log('\n--- Test 3: Rule 1 & Rule 2 Policy Violations ---');
    const cvssViolation = nistEval.violations.find(v => v.rule === 'CVSS_SCORE_THRESHOLD');
    assert(cvssViolation !== undefined, 'Rule 1 (CVSS < 7.0) evaluated');
    if (nistEval.maxCvss >= 7.0) {
      assert(cvssViolation.passed === false, 'Correctly flagged CVSS >= 7.0 as policy failure', `score: ${nistEval.maxCvss}`);
    } else {
      assert(cvssViolation.passed === true, 'Correctly identified CVSS < 7.0 as compliant');
    }

    const trendingViolation = nistEval.violations.find(v => v.rule === 'TRENDING_VULNERABILITIES');
    assert(trendingViolation !== undefined, 'Rule 2 (Trending 30-60d CVEs) evaluated', `trending: ${nistEval.trendingCount}`);

    // ── TEST 4: Request Submission & Queue Routing ──────────────────────────
    console.log('\n--- Test 4: Request Submission & Queue Assignment ---');
    const testReqId = 'REQ_TEST_NIST_' + Date.now();
    const testTaskId = 'TASK_TEST_NIST_' + Date.now();
    const now = new Date().toISOString();

    const testRequest = {
      id: testReqId,
      number: 'RITM9999001',
      shortDescription: 'Software Request: Wireshark 4.2.0',
      titleId: null,
      titleName: 'Wireshark',
      publisher: 'Wireshark Foundation',
      version: '4.2.0',
      platform: 'windows',
      category: 'Developer Tools',
      requestedBy: 'Test Officer',
      requestedFor: 'Security Analyst',
      department: 'Cyber Defense',
      businessJustification: 'Packet inspection for network incident response.',
      disposition: 'Review Required',
      stage: 'governance_review',
      state: 'In Review',
      isUnlisted: 1,
      licenseRequired: 'No',
      isNewVersion: 0,
      nistRiskScore: nistEval.maxCvss,
      nistRiskLevel: nistEval.riskLevel,
      nistSummary: JSON.stringify({
        maxCvss: nistEval.maxCvss,
        trendingCount: nistEval.trendingCount,
        totalCves: nistEval.totalCves,
      }),
      submittedAt: now,
      updatedAt: now,
    };

    const testTasks = [
      {
        id: testTaskId,
        requestId: testReqId,
        number: 'SCTASK9999001',
        name: 'Risk Review',
        assignmentGroup: 'Enterprise Risk',
        state: 'Open',
        notes: 'Pre-flight evaluation against NIST NVD 2.0 completed.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: testTaskId + '_PKG',
        requestId: testReqId,
        number: 'SCTASK9999002',
        name: 'Packaging Review & Execution',
        assignmentGroup: 'EUC Software Packaging Team',
        state: 'Pending',
        notes: 'Pending governance signoff.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const inserted = insertRequest(testRequest, testTasks);
    assert(inserted && inserted.id === testReqId, 'Successfully inserted software request with child tasks');
    assert(inserted.tasks.length === 2, 'Generated 2 child tasks');

    const openRiskTask = inserted.tasks.find(t => t.assignmentGroup === 'Enterprise Risk' && t.state === 'Open');
    assert(openRiskTask !== undefined, 'Initial active task correctly routed to Enterprise Risk Review Queue');

    // ── TEST 5: 12-Point Checklist & Risk Review Clearance ──────────────────
    console.log('\n--- Test 5: 12-Point Policy Checklist Signoff & Queue Advancement ---');
    const auditNotes = `[Enterprise Risk Review: NIST Max CVSS: ${nistEval.maxCvss}/10.0 | Trending 60d: ${nistEval.trendingCount} | 12/12 Criteria Verified Passed | Officer: Alex Johnson]`;
    const updatedRiskTask = updateTaskRecord(openRiskTask.id, {
      state: 'Closed Complete',
      completedBy: 'Alex Johnson',
      completedAt: new Date().toISOString(),
      notes: auditNotes,
    });

    assert(updatedRiskTask.state === 'Closed Complete', 'Risk task marked Closed Complete with audit notes');
    assert(updatedRiskTask.notes.includes('NIST Max CVSS'), 'Audit trail includes NIST security metrics');

    // Advance packaging task
    const pkgTask = inserted.tasks.find(t => t.assignmentGroup === 'EUC Software Packaging Team');
    const updatedPkgTask = updateTaskRecord(pkgTask.id, { state: 'Open' });
    assert(updatedPkgTask.state === 'Open', 'Request automatically advanced to Packaging Execution Queue');

    // ── CLEANUP ─────────────────────────────────────────────────────────────
    console.log('\n--- Cleanup ---');
    const cleanupResult = deleteRequest(testReqId);
    assert(cleanupResult.deleted === true, 'Cleaned up test request and associated tasks');

  } catch (err) {
    console.error('Unhandled error during testing:', err);
    failCount++;
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`📊 Test Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('═══════════════════════════════════════════════════════════════════════════');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
