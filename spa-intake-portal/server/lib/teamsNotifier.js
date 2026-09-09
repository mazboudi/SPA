// Microsoft Teams Webhook & Adaptive Card Notification Engine
import { getSetting } from '../db/database.js';

export async function sendTeamsCard(cardPayload) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL || getSetting('teams_webhook_url');

  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    console.log('📢 [TEAMS NOTIFIER MOCK] Webhook URL not set. Card payload generated:');
    console.log(JSON.stringify(cardPayload, null, 2));
    return { status: 'mock_logged', reason: 'No TEAMS_WEBHOOK_URL configured' };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [TEAMS NOTIFIER] Failed to send webhook (${res.status}):`, errText);
      return { status: 'error', statusText: errText };
    }

    console.log('✅ [TEAMS NOTIFIER] Successfully dispatched Adaptive Card to Microsoft Teams.');
    return { status: 'success' };
  } catch (err) {
    console.error('❌ [TEAMS NOTIFIER] Error sending Adaptive Card:', err.message);
    return { status: 'error', message: err.message };
  }
}

// ── 1. New Software Request Submitted ──────────────────────────────────────────
export async function notifyNewRequest(request, portalBaseUrl = 'http://localhost:5174') {
  const isApproved = request.disposition === 'Approved';
  const isDenied = request.disposition === 'Denied';
  const themeColor = isApproved ? '16a34a' : isDenied ? 'dc2626' : 'd97706';

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          msteams: { width: 'Full' },
          body: [
            {
              type: 'Container',
              style: isApproved ? 'good' : isDenied ? 'attention' : 'warning',
              items: [
                {
                  type: 'TextBlock',
                  text: `📋 New Software Request: ${request.number}`,
                  weight: 'Bolder',
                  size: 'Medium',
                  color: isApproved ? 'Good' : isDenied ? 'Attention' : 'Warning',
                },
                {
                  type: 'TextBlock',
                  text: `Stage: ${request.stage.toUpperCase()} | State: ${request.state}`,
                  size: 'Small',
                  isSubtle: true,
                },
              ],
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Software Title:', value: `${request.titleName}` },
                { title: 'Version:', value: `${request.version}` },
                { title: 'Approval Disposition:', value: `${request.disposition}` },
                { title: 'Platform:', value: `${request.platform.toUpperCase()}` },
                { title: 'Requester:', value: `${request.requestedFor} (${request.department})` },
                { title: 'Target Device:', value: `${request.targetDevice || 'Individual Workstation'}` },
                { title: 'Install Type:', value: `${request.installType} (${request.deploymentScope})` },
              ],
            },
            {
              type: 'TextBlock',
              text: `**Business Justification:**\n${request.businessJustification}`,
              wrap: true,
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: '🌐 Open in Governance Center',
              url: `${portalBaseUrl}/#tracker`,
            },
          ],
        },
      },
    ],
  };

  return sendTeamsCard(card);
}

// ── 2. Governance Task Action (Approve / Reject) ──────────────────────────────
export async function notifyTaskAction(task, request, action, reviewer, notes, portalBaseUrl = 'http://localhost:5174') {
  const isApprove = action === 'approve';

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: isApprove ? `✅ Task Approved: ${task.name}` : `❌ Task Rejected: ${task.name}`,
              weight: 'Bolder',
              size: 'Medium',
              color: isApprove ? 'Good' : 'Attention',
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Request Number:', value: `${request.number}` },
                { title: 'Software:', value: `${request.titleName} ${request.version}` },
                { title: 'Assignment Group:', value: `${task.assignmentGroup}` },
                { title: 'Reviewer:', value: `${reviewer}` },
                { title: 'New Request Stage:', value: `${request.stage.toUpperCase()}` },
              ],
            },
            {
              type: 'TextBlock',
              text: `**Reviewer Notes:**\n"${notes || 'No comments provided.'}"`,
              wrap: true,
              isSubtle: true,
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'View Ticket in Portal',
              url: `${portalBaseUrl}/#tracker`,
            },
          ],
        },
      },
    ],
  };

  return sendTeamsCard(card);
}

// ── 3. Packaging Deployment & Completion ──────────────────────────────────────
export async function notifyPackagingComplete(request, artifacts, portalBaseUrl = 'http://localhost:5174') {
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: `🚀 Software Packaged & Deployed: ${request.titleName} ${request.version}`,
              weight: 'Bolder',
              size: 'Large',
              color: 'Good',
            },
            {
              type: 'TextBlock',
              text: `Request ${request.number} is now **CLOSED COMPLETE**. The authoritative catalog has been updated to **Packaged & Ready**.`,
              wrap: true,
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'GitLab Repository:', value: `${artifacts.gitRepoUrl || 'N/A'}` },
                { title: 'Commit SHA:', value: `${artifacts.commitSha || 'main'}` },
                { title: 'CI/CD Pipeline ID:', value: `${artifacts.pipelineId || 'N/A'}` },
                { title: 'Target Platform:', value: `${artifacts.platform?.toUpperCase() || request.platform.toUpperCase()}` },
                { title: 'Packaged For:', value: `${request.requestedFor} (${request.targetDevice || 'Workstation'})` },
              ],
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: '📦 View Package in GitLab',
              url: artifacts.gitRepoUrl || 'https://gitlab.onefiserv.net',
            },
            {
              type: 'Action.OpenUrl',
              title: '📋 Open Audit Tracker',
              url: `${portalBaseUrl}/#tracker`,
            },
          ],
        },
      },
    ],
  };

  return sendTeamsCard(card);
}
