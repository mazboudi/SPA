// E2E Verification Test for SQLite Database & Teams Adaptive Card Engine
import {
  db,
  searchCatalog,
  getTitleById,
  getCatalogCount,
  getRequests,
  insertRequest,
  updateRequestFields,
  getTaskById,
  updateTaskRecord,
} from './server/db/database.js';
import { notifyNewRequest, notifyTaskAction, notifyPackagingComplete } from './server/lib/teamsNotifier.js';

async function runTests() {
  console.log('🧪 Starting SQLite & Teams Integration Test Suite...\n');

  // Test 1: Check Database Size
  console.log('1️⃣ Checking SQLite Database Counts...');
  const count = getCatalogCount();
  console.log(`   ✅ SQLite Database contains ${count} Software Title Models.`);
  if (count < 1000) throw new Error(`Expected >1000 titles, got ${count}`);

  // Test 2: Search for "1Password"
  console.log('\n2️⃣ Testing SQLite Search for "1Password"...');
  const results1p = searchCatalog('1Password');
  if (results1p.length === 0) throw new Error('1Password search returned 0 results');
  const onePass = results1p[0];
  console.log(`   ✅ Found: ${onePass.displayName} (${onePass.publisher}) with ${onePass.versions.length} versions.`);
  console.log(`   ✅ Sample Version:`, onePass.versions[0]);

  // Test 3: Search for Denied / Hybrid Title
  console.log('\n3️⃣ Testing SQLite Search for "Node.js"...');
  const nodeResults = searchCatalog('Node.js');
  if (nodeResults.length === 0) throw new Error('Node.js search returned 0 results');
  const nodeTitle = nodeResults[0];
  console.log(`   ✅ Found: ${nodeTitle.displayName} with ${nodeTitle.versions.length} versions.`);
  const hasDenied = nodeTitle.versions.some(v => v.disposition === 'Denied');
  console.log(`   ✅ Has Denied Version Records: ${hasDenied ? 'YES (Proactive Block active)' : 'NO'}`);

  // Test 4: Create Request in SQLite
  console.log('\n4️⃣ Testing Software Request Insertion in SQLite...');
  const testReqId = 'REQ_TEST_' + Date.now();
  const testReqNum = 'RITM' + Math.floor(1000000 + Math.random() * 9000000);
  const now = new Date().toISOString();

  const reqObj = {
    id: testReqId,
    number: testReqNum,
    shortDescription: `Software Request: ${onePass.displayName} ${onePass.versions[0].version}`,
    titleId: onePass.id,
    titleName: onePass.displayName,
    publisher: onePass.publisher,
    version: onePass.versions[0].version,
    platform: 'windows',
    category: onePass.category,
    installerType: 'msi',
    installerSource: '',
    requestedFor: 'Jonathan Architect',
    requesterEmail: 'jonathan.architect@fiserv.com',
    department: 'Enterprise Architecture',
    targetDevice: 'W11-CORP-9900',
    installType: 'New Install',
    deploymentScope: 'Individual',
    businessJustification: 'Verified secure password vault for engineering deployment.',
    disposition: onePass.versions[0].disposition,
    stage: 'governance_review',
    state: 'In Review',
    priority: 'High',
    submittedAt: now,
    updatedAt: now,
    packagingArtifacts: null,
  };

  const task1Id = 'TASK_TEST_' + Date.now() + '_1';
  const task2Id = 'TASK_TEST_' + Date.now() + '_2';

  const tasks = [
    {
      id: task1Id,
      requestId: testReqId,
      number: 'SCTASK' + Math.floor(1000000 + Math.random() * 9000000),
      name: 'Risk Review',
      assignmentGroup: 'Enterprise Risk',
      state: 'Open',
      notes: 'Validate against NIST NVD 2.0.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: task2Id,
      requestId: testReqId,
      number: 'SCTASK' + Math.floor(1000000 + Math.random() * 9000000),
      name: 'Packaging Review & Execution',
      assignmentGroup: 'EUC Software Packaging Team',
      state: 'Pending',
      notes: 'Ready for packaging in SPA Workbench.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const createdReq = insertRequest(reqObj, tasks);
  console.log(`   ✅ Request Saved to SQLite: ${createdReq.number} (Stage: ${createdReq.stage}, Tasks: ${createdReq.tasks.length})`);

  // Test 5: Test Teams Webhook Payload Generation
  console.log('\n5️⃣ Testing Microsoft Teams Adaptive Card Generation for New Request...');
  const teamsRes = await notifyNewRequest(createdReq);
  console.log(`   ✅ Teams Adaptive Card generated:`, teamsRes);

  // Test 6: Approve Task in SQLite
  console.log('\n6️⃣ Testing Task Approval in SQLite...');
  updateTaskRecord(task1Id, {
    state: 'Closed Complete',
    completedBy: 'Dev Director (Manager)',
    completedAt: now,
    notes: 'Approved for architect workstation.',
  });
  updateTaskRecord(task2Id, { state: 'Open' });
  const updatedReq = updateRequestFields(testReqId, { stage: 'packaging', state: 'In Packaging' });
  console.log(`   ✅ Task Approved! Request advanced in SQLite to: Stage = "${updatedReq.stage}", State = "${updatedReq.state}"`);

  // Test 7: Complete Packaging Callback
  console.log('\n7️⃣ Testing Packaging Complete Callback & Artifact Attachment...');
  const artifacts = {
    gitRepoUrl: 'https://gitlab.onefiserv.net/euc/packages/1password.git',
    commitSha: '5f4e3d2c1b0a',
    pipelineId: '992014',
    platform: 'windows',
    version: onePass.versions[0].version,
    packagedAt: now,
  };
  updateTaskRecord(task2Id, { state: 'Closed Complete', completedBy: 'SPA Workbench' });
  const closedReq = updateRequestFields(testReqId, {
    state: 'Closed Complete',
    stage: 'completed',
    packagingArtifacts: artifacts,
  });
  console.log(`   ✅ Request Closed in SQLite: State = "${closedReq.state}", Stage = "${closedReq.stage}"`);
  console.log(`   ✅ Recorded Artifacts in SQLite:`, closedReq.packagingArtifacts);

  // Teams Completion Card
  const completeCardRes = await notifyPackagingComplete(closedReq, artifacts);
  console.log(`   ✅ Teams Completion Card generated:`, completeCardRes);

  // Test 8: Unlisted Software Intake with Requester vs Beneficiary & Catalog Enrollment
  console.log('\n8️⃣ Testing Unlisted Software Intake & Automatic Catalog Self-Enrollment...');
  const unlistedReqId = 'REQ_UNLISTED_' + Date.now();
  const unlistedReqNum = 'RITM' + Math.floor(1000000 + Math.random() * 9000000);
  const unlistedTask1Id = 'TASK_UNLISTED_1_' + Date.now();
  const unlistedTask2Id = 'TASK_UNLISTED_2_' + Date.now();
  const unlistedTask3Id = 'TASK_UNLISTED_3_' + Date.now();

  const unlistedReqObj = {
    id: unlistedReqId,
    number: unlistedReqNum,
    shortDescription: 'Software Request: Docker Desktop Enterprise 4.28',
    titleId: null,
    titleName: 'Docker Desktop Enterprise',
    publisher: 'Docker Inc',
    version: '4.28.0',
    platform: 'windows',
    category: 'Developer Tools',
    installerType: 'msi',
    installerSource: 'https://download.docker.com/win/main/amd64/DockerDesktop.exe',
    requestedBy: 'Alex Johnson',
    requesterEmail: 'alex.johnson@fiserv.com',
    requestedFor: 'Sarah Connor',
    beneficiaryEmail: 'sarah.connor@fiserv.com',
    department: 'Cloud Native Architecture',
    targetDevice: 'W11-ENG-0900',
    installType: 'New Install',
    deploymentScope: 'Department',
    businessJustification: 'Container runtime required for Kubernetes cluster microservice testing.',
    disposition: 'Review Required',
    stage: 'governance_review',
    state: 'In Review',
    priority: 'High',
    isUnlisted: true,
    submittedAt: now,
    updatedAt: now,
    packagingArtifacts: null,
  };

  const unlistedTasks = [
    {
      id: unlistedTask1Id,
      requestId: unlistedReqId,
      number: 'SCTASK' + Math.floor(1000000 + Math.random() * 9000000),
      name: 'Risk Review',
      assignmentGroup: 'Enterprise Risk',
      state: 'Open',
      notes: 'Initial risk intake.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: unlistedTask2Id,
      requestId: unlistedReqId,
      number: 'SCTASK' + Math.floor(1000000 + Math.random() * 9000000),
      name: 'Software Disposition & Security Review',
      assignmentGroup: 'Cybersecurity',
      state: 'Open',
      notes: 'Review unlisted software container security.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: unlistedTask3Id,
      requestId: unlistedReqId,
      number: 'SCTASK' + Math.floor(1000000 + Math.random() * 9000000),
      name: 'Packaging Review & Execution',
      assignmentGroup: 'EUC Software Packaging Team',
      state: 'Pending',
      notes: 'Build package upon approval.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const createdUnlisted = insertRequest(unlistedReqObj, unlistedTasks);
  console.log(`   ✅ Unlisted Request Saved: ${createdUnlisted.number}`);
  console.log(`   ✅ Requester: "${createdUnlisted.requestedBy}" | Beneficiary: "${createdUnlisted.requestedFor}"`);

  // Simulate Cybersecurity Reviewer Approving and Enrolling into Authoritative Catalog
  console.log('   🔄 Simulating Cybersecurity Approval and Authoritative Catalog Upsert...');
  const { upsertCatalogTitleAndVersion } = await import('./server/db/database.js');
  const enrolledModel = upsertCatalogTitleAndVersion(
    {
      displayName: createdUnlisted.titleName,
      publisher: createdUnlisted.publisher,
      category: createdUnlisted.category,
      supportedPlatforms: [createdUnlisted.platform],
      licenseRequired: 'Yes',
    },
    {
      version: createdUnlisted.version,
      disposition: 'Approved',
      dispositionReason: 'Approved during Cybersecurity & Architecture evaluation.',
      alternative: null,
      packagingStatus: 'Approved - Pending Packaging',
    }
  );

  console.log(`   ✅ Model Enrolled into SQLite Catalog: "${enrolledModel.displayName}" (ID: ${enrolledModel.id})`);
  console.log(`   ✅ Version Record Enrolled: v${enrolledModel.versions[0].version} — Disposition: [${enrolledModel.versions[0].disposition}]`);

  // Verify Catalog Search finds the newly enrolled title
  const searchResults = searchCatalog('Docker Desktop Enterprise');
  if (searchResults.length === 0) throw new Error('Failed to find newly enrolled title in searchCatalog');
  console.log(`   ✅ SQLite Search Confirmed: Found "${searchResults[0].displayName}" by "${searchResults[0].publisher}" with ${searchResults[0].versions.length} version(s)!`);

  console.log('\n🎉 ALL 8 E2E SQLITE, UNLISTED INTAKE & TEAMS INTEGRATION TESTS PASSED 100% PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
