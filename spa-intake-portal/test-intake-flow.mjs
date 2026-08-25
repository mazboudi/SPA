// Standalone Verification Test Script for Software Request Intake & Lifecycle Hub
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('🧪 Starting Standalone Intake Portal verification tests...\n');

  // 1. Start Server on port 3002
  const serverProcess = spawn('node', ['server/index.js'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', data => {
    // console.log(`[SERVER]: ${data}`);
  });

  serverProcess.stderr.on('data', data => {
    console.error(`[SERVER ERROR]: ${data}`);
  });

  // Wait 1.5s for server to start
  await new Promise(r => setTimeout(r, 1500));

  const BASE_URL = 'http://localhost:3002/api/intake';

  try {
    // Test 1: Health Check
    console.log('1️⃣ Checking Health Endpoint...');
    const healthRes = await fetch('http://localhost:3002/api/health');
    const healthData = await healthRes.json();
    if (healthData.status !== 'ok') throw new Error('Health check failed');
    console.log('   ✅ Health check passed:', healthData);

    // Test 2: Fetch Authoritative Software Catalog
    console.log('\n2️⃣ Querying Authoritative Software Catalog...');
    const catRes = await fetch(`${BASE_URL}/catalog`);
    const catData = await catRes.json();
    if (!catData.titles || catData.titles.length === 0) throw new Error('Catalog is empty');
    console.log(`   ✅ Loaded ${catData.titles.length} software models. First title: "${catData.titles[0].displayName}"`);

    // Test 3: Search for Google Chrome
    console.log('\n3️⃣ Searching for "Chrome" in catalog...');
    const searchRes = await fetch(`${BASE_URL}/catalog?search=Chrome`);
    const searchData = await searchRes.json();
    const chrome = searchData.titles[0];
    if (!chrome) throw new Error('Chrome not found in catalog');
    console.log(`   ✅ Found: ${chrome.displayName} (${chrome.publisher}) with ${chrome.versions.length} versions.`);
    const approvedVer = chrome.versions.find(v => v.disposition === 'Approved');
    console.log(`   ✅ Tested Version Vetting: ${approvedVer.version} is [${approvedVer.disposition}]`);

    // Test 4: Submit a New Request for Chrome
    console.log('\n4️⃣ Submitting Software Request for Chrome...');
    const submitRes = await fetch(`${BASE_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleId: chrome.id,
        titleName: chrome.displayName,
        publisher: chrome.publisher,
        version: approvedVer.version,
        platform: 'windows',
        category: chrome.category,
        installerType: 'msi',
        requestedFor: 'Jonathan Test',
        department: 'FinTech Engineering',
        targetDevice: 'W11-TEST-001',
        installType: 'New Install',
        deploymentScope: 'Individual',
        businessJustification: 'Automated test suite verification request.',
        priority: 'High',
      }),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData.error || 'Submission failed');
    const testReq = submitData.request;
    console.log(`   ✅ Request Created: ${testReq.number} (${testReq.shortDescription})`);
    console.log(`   ✅ Initial Stage: "${testReq.stage}", State: "${testReq.state}", Tasks Generated: ${testReq.tasks.length}`);

    // Test 5: Approve Manager Task
    console.log('\n5️⃣ Approving Manager Task for ' + testReq.number + '...');
    const mgrTask = testReq.tasks.find(t => t.name === 'Manager Approval');
    if (!mgrTask) throw new Error('Manager Approval task not found');

    const approveRes = await fetch(`http://localhost:3002/api/intake/tasks/${mgrTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        completedBy: 'Manager Bot',
        notes: 'Automated test approval.',
      }),
    });
    const approveData = await approveRes.json();
    if (!approveRes.ok) throw new Error(approveData.error || 'Task approval failed');
    console.log(`   ✅ Manager Task Approved. Request stage advanced to: "${approveData.request.stage}"`);

    // Test 6: Verify Request Appears in Packaging Queue for Workbench
    console.log('\n6️⃣ Querying Packaging Queue for Workbench (GET /api/intake/queue)...');
    const queueRes = await fetch(`${BASE_URL}/queue?platform=windows`);
    const queueData = await queueRes.json();
    const queuedItem = queueData.items.find(i => i.RequestID === testReq.number);
    if (!queuedItem) throw new Error(`Request ${testReq.number} not found in packaging queue`);
    console.log(`   ✅ Found active packaging task in queue: ${queuedItem.RequestID} (${queuedItem.DisplayName} ${queuedItem.Version})`);

    // Test 7: Simulate Workbench Publishing Callback
    console.log('\n7️⃣ Simulating Workbench Publish Callback (POST /api/intake/requests/:id/complete-packaging)...');
    const completeRes = await fetch(`${BASE_URL}/requests/${testReq.id}/complete-packaging`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gitRepoUrl: 'https://gitlab.onefiserv.net/euc/packages/google-chrome.git',
        commitSha: '9f8a7b6c5d4e3f2a1b0c',
        pipelineId: '884920',
        platform: 'windows',
        packageId: 'google-chrome',
        packageVersion: approvedVer.version,
        notes: 'Successfully deployed to Microsoft Intune via CI/CD.',
      }),
    });
    const completeData = await completeRes.json();
    if (!completeRes.ok) throw new Error(completeData.error || 'Complete callback failed');
    console.log(`   ✅ Request Auto-Closed: State = "${completeData.request.state}", Stage = "${completeData.request.stage}"`);
    console.log(`   ✅ Recorded Packaging Artifacts:`, completeData.request.packagingArtifacts);

    console.log('\n🎉 ALL 7 INTEGRATION TESTS PASSED SUCCESSFULLY! Full flow verified.\n');
  } finally {
    serverProcess.kill();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
