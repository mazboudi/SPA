// spa-intake-portal/server/services/servicenowService.js
// Handles communication with ServiceNow Table API for Option B (Headless ServiceNow)

if (process.env.SNOW_IGNORE_SSL === 'true' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export class ServiceNowService {
  constructor(config = {}) {
    this.instance = config.instance || process.env.SNOW_URL || process.env.SNOW_INSTANCE || '';
    this.user = config.user || process.env.SNOW_USER || '';
    this.pass = config.pass || process.env.SNOW_PASS || '';
    
    this.clientId = (config.clientId || process.env.SNOW_CLIENT_ID || '').trim();
    this.clientSecret = (config.clientSecret || process.env.SNOW_CLIENT_SECRET || '').trim();
    this.accessToken = null;
    this.tokenExpiresAt = 0;

    // Table names with defaults matching scoped app
    this.tables = {
      title: config.titleTable || process.env.SNOW_TITLE_TABLE || 'x_fise2_software_0_spa_intake_software_title',
      version: config.versionTable || process.env.SNOW_VERSION_TABLE || 'x_fise2_software_0_software_version',
      request: config.requestTable || process.env.SNOW_REQUEST_TABLE || 'x_fise2_software_0_spa_intake_request',
      task: config.taskTable || process.env.SNOW_TASK_TABLE || 'x_fise2_software_0_spa_intake_task',
    };

    let host = this.instance.trim();
    if (!host) {
      this.baseUrl = '';
      this.tokenUrl = '';
    } else if (host.startsWith('http://') || host.startsWith('https://')) {
      host = host.replace(/\/+$/, '');
      this.baseUrl = `${host}/api/now/table`;
      this.tokenUrl = `${host}/oauth_token.do`;
    } else if (host.includes('.')) {
      this.baseUrl = `https://${host}/api/now/table`;
      this.tokenUrl = `https://${host}/oauth_token.do`;
    } else {
      this.baseUrl = `https://${host}.service-now.com/api/now/table`;
      this.tokenUrl = `https://${host}.service-now.com/oauth_token.do`;
    }
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    console.log(`🔐 [ServiceNow] Requesting OAuth access token with Client ID: ${this.clientId}...`);

    // Clean secret in case it has prefix/suffix
    let cleanSecret = this.clientSecret;
    // If copied with sys_id prefix (e.g., "56122fdc...  1  <secret>"), extract the actual secret
    const parts = cleanSecret.split(/\s+/).filter(Boolean);
    if (parts.length >= 3 && parts[1] === '1') {
      cleanSecret = parts[2];
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: cleanSecret,
    });

    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OAuth token request failed (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + ((data.expires_in || 1800) * 1000);
    console.log(`✅ [ServiceNow] Obtained OAuth access token (Expires in ${data.expires_in}s)`);
    return this.accessToken;
  }

  async getAuthHeader() {
    // 1. Prefer OAuth 2.0 Bearer token
    if (this.clientId && this.clientSecret) {
      try {
        const token = await this.getAccessToken();
        if (token) return `Bearer ${token}`;
      } catch (err) {
        console.warn(`⚠️ [ServiceNow] OAuth token retrieval failed: ${err.message}. Checking Basic Auth...`);
      }
    }

    // 2. Fallback to Basic Auth
    const user = (this.user || process.env.SNOW_USER || '').trim();
    const pass = (this.pass || process.env.SNOW_PASS || '').trim();
    return (user && pass) ? 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') : '';
  }

  isConfigured() {
    const user = (this.user || process.env.SNOW_USER || '').trim();
    const pass = (this.pass || process.env.SNOW_PASS || '').trim();
    const cId = (this.clientId || process.env.SNOW_CLIENT_ID || '').trim();
    const cSec = (this.clientSecret || process.env.SNOW_CLIENT_SECRET || '').trim();
    const inst = (this.instance || process.env.SNOW_URL || process.env.SNOW_INSTANCE || '').trim();
    return Boolean(inst && ((cId && cSec) || (user && pass)));
  }

  async testConnection() {
    if (!this.isConfigured()) {
      return { ok: false, error: 'ServiceNow credentials (SNOW_URL, and either OAuth CLIENT_ID/SECRET or USER/PASS) are not configured.' };
    }

    try {
      const url = `${this.baseUrl}/${this.tables.title}?sysparm_limit=1`;
      const auth = await this.getAuthHeader();
      console.log(`🔑 [ServiceNow] Connecting to ${url} (Auth Type: ${auth.startsWith('Bearer') ? 'OAuth 2.0' : 'Basic Auth'})`);

      const res = await fetch(url, {
        headers: {
          'Authorization': auth,
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, status: res.status, error: `ServiceNow responded with HTTP ${res.status}: ${text}` };
      }

      const data = await res.json();
      return { ok: true, status: 200, count: data.result ? data.result.length : 0 };
    } catch (err) {
      const causeDetails = err.cause ? (err.cause.code || err.cause.message || String(err.cause)) : null;
      console.error(`❌ [ServiceNow] Connection error: ${err.message}`, causeDetails ? `(Cause: ${causeDetails})` : '');
      return { 
        ok: false, 
        error: err.message, 
        cause: causeDetails,
        hint: (causeDetails && causeDetails.includes('CERT')) 
          ? 'Corporate SSL certificate verification failed. Try adding SNOW_IGNORE_SSL=true in your .env file.'
          : (causeDetails && causeDetails.includes('ENOTFOUND'))
          ? 'DNS cannot resolve hostname. Ensure you are connected to the corporate VPN.'
          : undefined
      };
    }
  }

  // 1. Search Software Titles
  async searchTitles(searchTerm = '', limit = 50) {
    if (!this.isConfigured()) return [];

    let query = '';
    if (searchTerm) {
      query = `u_display_nameLIKE${encodeURIComponent(searchTerm)}^ORu_publisherLIKE${encodeURIComponent(searchTerm)}`;
    }

    const auth = await this.getAuthHeader();
    const url = `${this.baseUrl}/${this.tables.title}?sysparm_limit=${limit}${query ? `&sysparm_query=${query}` : ''}`;
    const res = await fetch(url, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`Failed to fetch titles from ServiceNow: HTTP ${res.status}`);
    const data = await res.json();
    return data.result || [];
  }

  // 2. Fetch Versions for a specific Title
  async getVersionsForTitle(titleSysId) {
    if (!this.isConfigured()) return [];

    const auth = await this.getAuthHeader();
    const url = `${this.baseUrl}/${this.tables.version}?sysparm_query=u_software_title=${titleSysId}`;
    const res = await fetch(url, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`Failed to fetch versions from ServiceNow: HTTP ${res.status}`);
    const data = await res.json();
    return data.result || [];
  }

  // 3. Create a Software Request in ServiceNow
  async createRequest(reqData) {
    if (!this.isConfigured()) {
      throw new Error('ServiceNow is not configured.');
    }

    const payload = {
      u_software_title: reqData.titleId || '',
      u_requested_version: reqData.version || '',
      u_platform: (reqData.platform || 'windows').toLowerCase(),
      u_requester_email: reqData.requesterEmail || reqData.beneficiaryEmail || '',
      u_department: reqData.department || '',
      u_target_device: reqData.targetDevice || '',
      u_install_type: reqData.installType || 'Self-Service (Company Portal)',
      u_deployment_scope: reqData.deploymentScope || 'Single Device',
      u_business_justification: reqData.businessJustification || '',
      short_description: `Software Request: ${reqData.titleName} ${reqData.version}`,
      priority: reqData.priority === 'High' ? '2' : reqData.priority === 'Critical' ? '1' : '3',
    };

    const auth = await this.getAuthHeader();
    const res = await fetch(`${this.baseUrl}/${this.tables.request}`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create request in ServiceNow: HTTP ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return data.result; // Contains sys_id, number (e.g. SPA0001001), state, sys_created_on
  }

  // 4. Fetch Requests and their associated Tasks from ServiceNow
  async getRequests(limit = 100) {
    if (!this.isConfigured()) return [];

    const auth = await this.getAuthHeader();
    // Fetch requests
    const reqUrl = `${this.baseUrl}/${this.tables.request}?sysparm_limit=${limit}&sysparm_query=ORDERBYDESCsys_created_on`;
    const res = await fetch(reqUrl, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`Failed to fetch requests from ServiceNow: HTTP ${res.status}`);
    const reqData = await res.json();
    const requests = reqData.result || [];

    // Fetch active tasks for these requests
    const tasksUrl = `${this.baseUrl}/${this.tables.task}?sysparm_limit=250`;
    const taskRes = await fetch(tasksUrl, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
    });

    let tasks = [];
    if (taskRes.ok) {
      const taskData = await taskRes.json();
      tasks = taskData.result || [];
    }

    // Map into SPA portal standard schema
    return requests.map(r => {
      const relatedTasks = tasks.filter(t => 
        (t.u_software_request && (t.u_software_request.value === r.sys_id || t.u_software_request === r.sys_id))
      );

      return {
        id: r.sys_id,
        number: r.number,
        titleName: r.short_description ? r.short_description.replace('Software Request: ', '') : 'Software Request',
        version: r.u_requested_version || '',
        platform: r.u_platform || 'windows',
        requesterEmail: r.u_requester_email || '',
        department: r.u_department || '',
        targetDevice: r.u_target_device || '',
        businessJustification: r.u_business_justification || '',
        state: r.state === '3' ? 'Closed Complete' : r.state === '4' ? 'Closed Incomplete' : 'In Review',
        stage: r.state === '3' ? 'Complete' : r.state === '4' ? 'Rejected' : 'Governance Review',
        disposition: r.state === '4' ? 'Denied' : 'Approved',
        submittedAt: r.sys_created_on,
        updatedAt: r.sys_updated_on,
        source: 'servicenow',
        tasks: relatedTasks.map(t => ({
          id: t.sys_id,
          number: t.number,
          name: t.short_description,
          taskType: t.u_spa_task_type || t.u_task_type || 'Task',
          state: t.state === '3' ? 'Closed Complete' : t.state === '4' ? 'Closed Incomplete' : 'Open',
        })),
      };
    });
  }
}
