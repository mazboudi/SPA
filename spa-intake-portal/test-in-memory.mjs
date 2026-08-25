// In-Memory Test Runner for spa-intake-portal
process.env.NODE_ENV = 'test';
import app from './server/index.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper to simulate express requests in-memory
function simulateRequest(method, path, body = null, query = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      url: path,
      path: path.split('?')[0],
      query,
      params: {},
      body,
      headers: {},
      get: (h) => req.headers[h.toLowerCase()],
    };

    let statusCode = 200;
    let responseData = null;
    let headers = {};

    const res = {
      status: (code) => { statusCode = code; return res; },
      setHeader: (k, v) => { headers[k] = v; return res; },
      json: (data) => {
        responseData = data;
        resolve({ status: statusCode, body: data, headers });
      },
      send: (data) => {
        responseData = data;
        resolve({ status: statusCode, body: data, headers });
      },
      sendStatus: (code) => {
        statusCode = code;
        resolve({ status: statusCode, body: null, headers });
      },
    };

    app.handle(req, res);
  });
}

async function run() {
  console.log('🧪 Starting in-memory integration verification suite...\n');

  // Test 1: Health
  console.log('1️⃣ Testing Health Route...');
  const hRes = await simulateRequest('GET', '/api/health');
  if (hRes.status !== 200 || hRes.body.status !== 'ok') throw new Error('Health route failed');
  console.log('   ✅ Health OK:', hRes.body);

  // Test 2: Catalog
  console.log('\n2️⃣ Testing Catalog Route...');
  const catRes = await simulateRequest('GET', '/api/intake/catalog');
  if (catRes.status !== 200 || !catRes.body.titles.length) throw new Error('Catalog failed');
  console.log(`   ✅ Catalog returned ${catRes.body.count} authoritative titles.`);

  // Test 3: Search
  console.log('\n3️⃣ Testing Catalog Search for "Chrome"...');
  const sRes = await simulateRequest('GET', '/api/intake/catalog?search=Chrome', null, { search: 'Chrome' });
  const chrome = sRes.body.titles[0];
  if (!chrome || !chrome.displayName.includes('Chrome')) throw new Error('Chrome search failed');
  console.log(`   ✅ Found: ${chrome.displayName} with ${chrome.versions.length} versions.`);

  // Test 4: Create Request
  console.log('\n4️⃣ Testing Software Request Submission...');
  const newReqRes = await simulateRequest('POST', '/api/intake/requests', {
    titleId: chrome.id,
    titleName: chrome.displayName,
    publisher: chrome.publisher,
    version: '134.0.6998.89',
    platform: 'windows',
    category: chrome.category,
    requestedFor: 'Jonathan Enterprise',
    department: 'Software Engineering',
    targetDevice: 'W11-CORP-9900',
    installType: 'New Install',
    deploymentScope: 'Individual',
    businessJustification: 'Test justification for developer browser.',
    priority: 'High',
  });
  if (newReqRes.status !== 201) throw new Error('Create request failed: ' + JSON.stringify(newReqRes.body));
  const reqObj = newReqRes.body.request;
  console.log(`   ✅ Request Created: ${reqObj.number}, Stage = "${reqObj.stage}", Tasks = ${reqObj.tasks.length}`);

  // Test 5: Approve Manager Task
  console.log(`\n5️⃣ Testing Manager Task Approval for ${reqObj.number}...`);
  const mgrTask = reqObj.tasks.find(t => t.name === 'Manager Approval');
  const appTaskRes = await simulateRequest('PATCH', `/api/intake/tasks/${mgrTask.id}`, {
    action: 'approve',
    completedBy: 'Dev Lead (Manager)',
    notes: 'Approved for developer workstation.',
  });
  if (appTaskRes.status !== 200) throw new Error('Task approval failed');
  console.log(`   ✅ Task Approved! Request advanced to Stage = "${appTaskRes.body.request.stage}"`);

  // Test 6: Workbench Packaging Queue Feed
  console.log('\n6️⃣ Testing Workbench Packaging Queue (GET /api/intake/queue)...');
  const qRes = await simulateRequest('GET', '/api/intake/queue?platform=windows', null, { platform: 'windows' });
  const queued = qRes.body.items.find(i => i.RequestID === reqObj.number);
  if (!queued) throw new Error('Request not surfaced in queue');
  console.log(`   ✅ Packaging Queue surfaced ticket: ${queued.RequestID} (${queued.DisplayName} ${queued.Version})`);

  // Test 7: Publish Callback from Workbench
  console.log(`\n7️⃣ Testing Packaging Complete Callback from Workbench...`);
  const compRes = await simulateRequest('POST', `/api/intake/requests/${reqObj.id}/complete-packaging`, {
    gitRepoUrl: 'https://gitlab.onefiserv.net/euc/packages/google-chrome.git',
    commitSha: 'a1b2c3d4e5f6',
    pipelineId: '900214',
    platform: 'windows',
    packageId: 'google-chrome',
    packageVersion: '134.0.6998.89',
    notes: 'Published to Intune by SPA Packaging Workbench',
  });
  if (compRes.status !== 200) throw new Error('Complete packaging failed');
  console.log(`   ✅ Request State Auto-Closed: "${compRes.body.request.state}", Stage: "${compRes.body.request.stage}"`);
  console.log('   ✅ Recorded Artifacts:', compRes.body.request.packagingArtifacts);

  console.log('\n🎉 ALL 7 IN-MEMORY INTEGRATION TESTS PASSED PERFECTLY!\n');
}

run().catch(err => {
  console.error('\n❌ ERROR:', err);
  process.exit(1);
});
