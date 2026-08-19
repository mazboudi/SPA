/**
 * snippets.js
 * Curated library of parameterized PowerShell snippets for the Custom PowerShell card.
 */

export const SNIPPETS = [

  // ── Registry ──────────────────────────────────────────────────────────────
  {
    id: 'registry-read',
    label: 'Read Registry Value',
    category: 'Registry',
    icon: '📖',
    description: 'Read a registry value into a variable',
    params: [
      { key: 'varName',   label: 'Variable Name', type: 'text', placeholder: 'regValue' },
      { key: 'hive',      label: 'Hive',          type: 'select', options: ['HKLM','HKCU','HKCR','HKU'], default: 'HKLM' },
      { key: 'keyPath',   label: 'Key Path',      type: 'text', placeholder: 'SOFTWARE\\MyCompany\\App' },
      { key: 'valueName', label: 'Value Name',    type: 'text', placeholder: 'Version' },
    ],
    template: (p) =>
`$${p.varName || 'regValue'} = Get-RegistryKey -Key '${p.hive || 'HKLM'}:\\${p.keyPath || 'SOFTWARE\\MyCompany\\App'}' -Value '${p.valueName || 'Version'}'
Write-ADTLogEntry -Message "Registry value '${p.valueName || 'Version'}': $$${p.varName || 'regValue'}" -Severity 1`,
  },

  {
    id: 'registry-write',
    label: 'Write Registry Value',
    category: 'Registry',
    icon: '✏️',
    description: 'Create or update a registry value',
    params: [
      { key: 'hive',     label: 'Hive',       type: 'select', options: ['HKLM','HKCU','HKCR','HKU'], default: 'HKLM' },
      { key: 'keyPath',  label: 'Key Path',   type: 'text', placeholder: 'SOFTWARE\\MyCompany\\App' },
      { key: 'name',     label: 'Value Name', type: 'text', placeholder: 'Installed' },
      { key: 'dataType', label: 'Type',       type: 'select', options: ['String','DWord','QWord','Binary','ExpandString','MultiString'], default: 'String' },
      { key: 'value',    label: 'Value Data', type: 'text', placeholder: '1' },
    ],
    template: (p) => {
      const val = (p.dataType === 'DWord' || p.dataType === 'QWord') ? (p.value || '1') : `'${p.value || '1'}'`;
      return `Set-RegistryKey -Key '${p.hive || 'HKLM'}:\\${p.keyPath || 'SOFTWARE\\MyCompany\\App'}' -Name '${p.name || 'Installed'}' -Value ${val} -Type ${p.dataType || 'String'}`;
    },
  },

  {
    id: 'registry-delete-value',
    label: 'Delete Registry Value',
    category: 'Registry',
    icon: '🗑️',
    description: 'Remove a specific registry value',
    params: [
      { key: 'hive',    label: 'Hive',       type: 'select', options: ['HKLM','HKCU','HKCR','HKU'], default: 'HKLM' },
      { key: 'keyPath', label: 'Key Path',   type: 'text', placeholder: 'SOFTWARE\\MyCompany\\App' },
      { key: 'name',    label: 'Value Name', type: 'text', placeholder: 'OldSetting' },
    ],
    template: (p) =>
`Remove-RegistryKey -Key '${p.hive || 'HKLM'}:\\${p.keyPath || 'SOFTWARE\\MyCompany\\App'}' -Name '${p.name || 'OldSetting'}'`,
  },

  {
    id: 'registry-delete-key',
    label: 'Delete Registry Key (Recursive)',
    category: 'Registry',
    icon: '🗑️',
    description: 'Remove an entire registry key and all subkeys',
    params: [
      { key: 'hive',    label: 'Hive',     type: 'select', options: ['HKLM','HKCU','HKCR','HKU'], default: 'HKLM' },
      { key: 'keyPath', label: 'Key Path', type: 'text', placeholder: 'SOFTWARE\\MyCompany\\OldApp' },
    ],
    template: (p) =>
`Remove-RegistryKey -Key '${p.hive || 'HKLM'}:\\${p.keyPath || 'SOFTWARE\\MyCompany\\OldApp'}' -Recurse`,
  },

  // ── Files & Folders ───────────────────────────────────────────────────────
  {
    id: 'files-create-dir',
    label: 'Create Directory',
    category: 'Files & Folders',
    icon: '📁',
    description: 'Create a directory (no error if it already exists)',
    params: [
      { key: 'path', label: 'Directory Path', type: 'text', placeholder: 'C:\\ProgramData\\MyCompany\\App' },
    ],
    template: (p) =>
`New-Folder -Path '${p.path || 'C:\\ProgramData\\MyCompany\\App'}'`,
  },

  {
    id: 'files-copy',
    label: 'Copy File',
    category: 'Files & Folders',
    icon: '📋',
    description: 'Copy a file from source to destination',
    params: [
      { key: 'source', label: 'Source Path',      type: 'text', placeholder: '$dirFiles\\config.xml' },
      { key: 'dest',   label: 'Destination Path', type: 'text', placeholder: 'C:\\ProgramData\\MyCompany\\App' },
    ],
    template: (p) =>
`Copy-File -Path '${p.source || '$dirFiles\\config.xml'}' -Destination '${p.dest || 'C:\\ProgramData\\MyCompany\\App'}'`,
  },

  {
    id: 'files-remove',
    label: 'Remove File',
    category: 'Files & Folders',
    icon: '🗑️',
    description: 'Remove a file (no error if not found)',
    params: [
      { key: 'path',      label: 'File Path', type: 'text', placeholder: 'C:\\ProgramData\\MyCompany\\old.log' },
      { key: 'recursive', label: 'Recurse',   type: 'boolean', default: false },
    ],
    template: (p) =>
`Remove-File -Path '${p.path || 'C:\\ProgramData\\MyCompany\\old.log'}'${p.recursive ? ' -Recurse' : ''}`,
  },

  {
    id: 'files-remove-folder',
    label: 'Remove Folder',
    category: 'Files & Folders',
    icon: '🗑️',
    description: 'Remove a folder and all its contents',
    params: [
      { key: 'path', label: 'Folder Path', type: 'text', placeholder: 'C:\\ProgramData\\MyCompany\\OldApp' },
    ],
    template: (p) =>
`Remove-Folder -Path '${p.path || 'C:\\ProgramData\\MyCompany\\OldApp'}'`,
  },

  // ── Services ──────────────────────────────────────────────────────────────
  {
    id: 'service-stop',
    label: 'Stop Service',
    category: 'Services',
    icon: '⏹️',
    description: 'Stop a Windows service gracefully',
    params: [
      { key: 'name', label: 'Service Name', type: 'text', placeholder: 'MyService' },
    ],
    template: (p) =>
`Stop-ServiceAndDependencies -Name '${p.name || 'MyService'}'`,
  },

  {
    id: 'service-start',
    label: 'Start Service',
    category: 'Services',
    icon: '▶️',
    description: 'Start a Windows service',
    params: [
      { key: 'name', label: 'Service Name', type: 'text', placeholder: 'MyService' },
    ],
    template: (p) =>
`Start-ServiceAndDependencies -Name '${p.name || 'MyService'}'`,
  },

  {
    id: 'service-wait',
    label: 'Wait for Service State',
    category: 'Services',
    icon: '⏳',
    description: 'Poll until a service reaches a specific state',
    params: [
      { key: 'name',    label: 'Service Name', type: 'text',   placeholder: 'MyService' },
      { key: 'status',  label: 'Wait For',     type: 'select', options: ['Running','Stopped','Paused'], default: 'Running' },
      { key: 'timeout', label: 'Timeout (s)',  type: 'number', default: 30 },
    ],
    template: (p) =>
`$svcTimer = [System.Diagnostics.Stopwatch]::StartNew()
do {
    $svc = Get-Service -Name '${p.name || 'MyService'}' -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} while ($svc.Status -ne '${p.status || 'Running'}' -and $svcTimer.Elapsed.TotalSeconds -lt ${p.timeout || 30})
Write-ADTLogEntry -Message "Service '${p.name || 'MyService'}' is now: $($svc.Status)" -Severity 1`,
  },

  // ── Processes ──────────────────────────────────────────────────────────────
  {
    id: 'process-kill',
    label: 'Kill Process by Name',
    category: 'Processes',
    icon: '💀',
    description: 'Force-terminate a process by its executable name',
    params: [
      { key: 'name', label: 'Process Name (no .exe)', type: 'text', placeholder: 'notepad' },
    ],
    template: (p) =>
`Get-Process -Name '${p.name || 'notepad'}' -ErrorAction SilentlyContinue | Stop-Process -Force`,
  },

  {
    id: 'process-wait',
    label: 'Wait for Process to Exit',
    category: 'Processes',
    icon: '⏳',
    description: 'Block until a process exits or timeout is reached',
    params: [
      { key: 'name',    label: 'Process Name (no .exe)', type: 'text',   placeholder: 'setup' },
      { key: 'timeout', label: 'Timeout (seconds)',       type: 'number', default: 120 },
    ],
    template: (p) =>
`$proc = Get-Process -Name '${p.name || 'setup'}' -ErrorAction SilentlyContinue
if ($proc) {
    Write-ADTLogEntry -Message "Waiting for process '${p.name || 'setup'}' to exit (max ${p.timeout || 120}s)..." -Severity 1
    $proc | Wait-Process -Timeout ${p.timeout || 120} -ErrorAction SilentlyContinue
}`,
  },

  // ── Shortcuts ─────────────────────────────────────────────────────────────
  {
    id: 'shortcut-create-desktop',
    label: 'Create Desktop Shortcut',
    category: 'Shortcuts',
    icon: '🔗',
    description: 'Create a shortcut on the All Users desktop',
    params: [
      { key: 'name',   label: 'Shortcut Name', type: 'text', placeholder: 'My Application' },
      { key: 'target', label: 'Target Path',   type: 'text', placeholder: 'C:\\Program Files\\MyApp\\app.exe' },
      { key: 'icon',   label: 'Icon Path',     type: 'text', placeholder: 'C:\\Program Files\\MyApp\\app.exe' },
    ],
    template: (p) =>
`New-Shortcut -Path "$envCommonDesktop\\${p.name || 'My Application'}.lnk" -TargetPath '${p.target || 'C:\\Program Files\\MyApp\\app.exe'}' -IconLocation '${p.icon || 'C:\\Program Files\\MyApp\\app.exe'}' -Description '${p.name || 'My Application'}'`,
  },

  {
    id: 'shortcut-remove',
    label: 'Remove Shortcut',
    category: 'Shortcuts',
    icon: '🗑️',
    description: 'Remove a desktop or start menu shortcut',
    params: [
      { key: 'path', label: 'Shortcut Path', type: 'text', placeholder: '$envCommonDesktop\\My Application.lnk' },
    ],
    template: (p) =>
`Remove-File -Path '${p.path || '$envCommonDesktop\\My Application.lnk'}'`,
  },

  // ── Scheduled Tasks ───────────────────────────────────────────────────────
  {
    id: 'task-remove',
    label: 'Remove Scheduled Task',
    category: 'Scheduled Tasks',
    icon: '🗑️',
    description: 'Remove a scheduled task by name',
    params: [
      { key: 'name',   label: 'Task Name',   type: 'text', placeholder: 'MyCompany - MyTask' },
      { key: 'folder', label: 'Task Folder', type: 'text', placeholder: '\\', default: '\\' },
    ],
    template: (p) =>
`$task = Get-ScheduledTask -TaskName '${p.name || 'MyCompany - MyTask'}' -TaskPath '${p.folder || '\\'}' -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName '${p.name || 'MyCompany - MyTask'}' -TaskPath '${p.folder || '\\'}' -Confirm:$false
    Write-ADTLogEntry -Message "Scheduled task '${p.name || 'MyCompany - MyTask'}' removed." -Severity 1
}`,
  },

  // ── Environment Variables ─────────────────────────────────────────────────
  {
    id: 'env-set',
    label: 'Set Environment Variable',
    category: 'Environment Variables',
    icon: '🌐',
    description: 'Set a system-scope environment variable',
    params: [
      { key: 'name',  label: 'Variable Name', type: 'text',   placeholder: 'MY_APP_HOME' },
      { key: 'value', label: 'Value',         type: 'text',   placeholder: 'C:\\Program Files\\MyApp' },
      { key: 'scope', label: 'Scope',         type: 'select', options: ['Machine','User','Process'], default: 'Machine' },
    ],
    template: (p) =>
`[System.Environment]::SetEnvironmentVariable('${p.name || 'MY_APP_HOME'}', '${p.value || 'C:\\Program Files\\MyApp'}', '${p.scope || 'Machine'}')
Write-ADTLogEntry -Message "Environment variable '${p.name || 'MY_APP_HOME'}' set." -Severity 1`,
  },

  {
    id: 'env-remove',
    label: 'Remove Environment Variable',
    category: 'Environment Variables',
    icon: '🗑️',
    description: 'Remove a system-scope environment variable',
    params: [
      { key: 'name',  label: 'Variable Name', type: 'text',   placeholder: 'MY_APP_HOME' },
      { key: 'scope', label: 'Scope',         type: 'select', options: ['Machine','User','Process'], default: 'Machine' },
    ],
    template: (p) =>
`[System.Environment]::SetEnvironmentVariable('${p.name || 'MY_APP_HOME'}', $null, '${p.scope || 'Machine'}')
Write-ADTLogEntry -Message "Environment variable '${p.name || 'MY_APP_HOME'}' removed." -Severity 1`,
  },

  // ── Firewall ──────────────────────────────────────────────────────────────
  {
    id: 'firewall-add',
    label: 'Add Firewall Rule',
    category: 'Firewall',
    icon: '🔥',
    description: 'Create a Windows Firewall inbound or outbound rule',
    params: [
      { key: 'name',      label: 'Rule Name',  type: 'text',   placeholder: 'MyApp - Allow Inbound' },
      { key: 'direction', label: 'Direction',  type: 'select', options: ['Inbound','Outbound'], default: 'Inbound' },
      { key: 'protocol',  label: 'Protocol',   type: 'select', options: ['TCP','UDP','Any'], default: 'TCP' },
      { key: 'port',      label: 'Port(s)',     type: 'text',   placeholder: '8080' },
      { key: 'action',    label: 'Action',     type: 'select', options: ['Allow','Block'], default: 'Allow' },
    ],
    template: (p) =>
`New-NetFirewallRule -DisplayName '${p.name || 'MyApp - Allow Inbound'}' -Direction ${p.direction || 'Inbound'} -Protocol ${p.protocol || 'TCP'} -LocalPort ${p.port || '8080'} -Action ${p.action || 'Allow'} -Profile Any -Enabled True
Write-ADTLogEntry -Message "Firewall rule '${p.name || 'MyApp - Allow Inbound'}' created." -Severity 1`,
  },

  {
    id: 'firewall-remove',
    label: 'Remove Firewall Rule',
    category: 'Firewall',
    icon: '🗑️',
    description: 'Remove a Windows Firewall rule by display name',
    params: [
      { key: 'name', label: 'Rule Name', type: 'text', placeholder: 'MyApp - Allow Inbound' },
    ],
    template: (p) =>
`Remove-NetFirewallRule -DisplayName '${p.name || 'MyApp - Allow Inbound'}' -ErrorAction SilentlyContinue
Write-ADTLogEntry -Message "Firewall rule '${p.name || 'MyApp - Allow Inbound'}' removed." -Severity 1`,
  },

  // ── Flow & Conditional Logic ──────────────────────────────────────────────
  {
    id: 'flow-if-else',
    label: 'If / Else',
    category: 'Flow & Conditional Logic',
    icon: '🔀',
    description: 'Standard conditional block',
    params: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'Test-Path -Path "C:\\MyFile.txt"' },
    ],
    template: (p) =>
`if (${p.condition || 'Test-Path -Path "C:\\MyFile.txt"'})
{
    # TODO: action when true
}
else
{
    # TODO: action when false
}`,
  },

  {
    id: 'flow-try-catch',
    label: 'Try / Catch / Finally',
    category: 'Flow & Conditional Logic',
    icon: '🛡️',
    description: 'Error-handling block with optional finally',
    params: [
      { key: 'logMessage', label: 'Log Message (on error)', type: 'text',   placeholder: 'Operation failed' },
      { key: 'severity',   label: 'Error Severity',        type: 'select', options: ['1 (Info)','2 (Warning)','3 (Error)'], default: '3 (Error)' },
    ],
    template: (p) => {
      const sev = (p.severity || '3 (Error)').split(' ')[0];
      return `try
{
    # TODO: risky operation here
}
catch
{
    Write-ADTLogEntry -Message "${p.logMessage || 'Operation failed'}: $($_.Exception.Message)" -Severity ${sev}
}
finally
{
    # TODO: cleanup (runs regardless of error)
}`;
    },
  },

  {
    id: 'flow-try-catch-only',
    label: 'Try / Catch',
    category: 'Flow & Conditional Logic',
    icon: '🛡️',
    description: 'Error-handling block without finally',
    params: [
      { key: 'logMessage', label: 'Log Message (on error)', type: 'text', placeholder: 'Operation failed' },
    ],
    template: (p) =>
`try
{
    # TODO: risky operation here
}
catch
{
    Write-ADTLogEntry -Message "${p.logMessage || 'Operation failed'}: $($_.Exception.Message)" -Severity 3
}`,
  },

  {
    id: 'flow-foreach',
    label: 'ForEach Loop',
    category: 'Flow & Conditional Logic',
    icon: '🔄',
    description: 'Iterate over a collection',
    params: [
      { key: 'itemVar',    label: 'Item Variable', type: 'text', placeholder: 'item', default: 'item' },
      { key: 'collection', label: 'Collection',    type: 'text', placeholder: '$myList' },
    ],
    template: (p) =>
`foreach ($${p.itemVar || 'item'} in ${p.collection || '$myList'})
{
    # TODO: process $${p.itemVar || 'item'}
    Write-ADTLogEntry -Message "Processing: $${p.itemVar || 'item'}" -Severity 1
}`,
  },

  {
    id: 'flow-switch',
    label: 'Switch Statement',
    category: 'Flow & Conditional Logic',
    icon: '🔀',
    description: 'Multi-branch conditional (switch/case)',
    params: [
      { key: 'variable', label: 'Variable to Switch On', type: 'text', placeholder: '$envOSArchitecture' },
    ],
    template: (p) =>
`switch (${p.variable || '$envOSArchitecture'})
{
    'x64'
    {
        # TODO: 64-bit logic
    }
    'x86'
    {
        # TODO: 32-bit logic
    }
    default
    {
        Write-ADTLogEntry -Message "Unexpected value: ${p.variable || '$envOSArchitecture'}" -Severity 2
    }
}`,
  },

  {
    id: 'flow-do-while',
    label: 'Do / While Loop',
    category: 'Flow & Conditional Logic',
    icon: '🔁',
    description: 'Loop that always runs at least once, useful for retry logic',
    params: [
      { key: 'condition', label: 'Continue While Condition', type: 'text', placeholder: '$retries -lt 3' },
    ],
    template: (p) =>
`$retries = 0
do
{
    # TODO: operation to retry
    $retries++
    Start-Sleep -Seconds 5
} while (${p.condition || '$retries -lt 3'})`,
  },

  {
    id: 'flow-test-path',
    label: 'Test Path / File Exists',
    category: 'Flow & Conditional Logic',
    icon: '🔍',
    description: 'Check if a file or directory exists before acting',
    params: [
      { key: 'path', label: 'Path to Test', type: 'text', placeholder: 'C:\\ProgramData\\MyCompany\\App\\config.xml' },
    ],
    template: (p) =>
`if (Test-Path -Path '${p.path || 'C:\\ProgramData\\MyCompany\\App\\config.xml'}')
{
    Write-ADTLogEntry -Message "Found: '${p.path || 'C:\\ProgramData\\MyCompany\\App\\config.xml'}'" -Severity 1
    # TODO: action when file exists
}
else
{
    Write-ADTLogEntry -Message "Not found: '${p.path || 'C:\\ProgramData\\MyCompany\\App\\config.xml'}'" -Severity 2
    # TODO: action when file does not exist
}`,
  },

  {
    id: 'flow-log-only',
    label: 'Write Log Entry',
    category: 'Flow & Conditional Logic',
    icon: '📝',
    description: 'Write a message to the PSADT log',
    params: [
      { key: 'message',  label: 'Message',  type: 'text',   placeholder: 'Custom step reached.' },
      { key: 'severity', label: 'Severity', type: 'select', options: ['1 (Info)','2 (Warning)','3 (Error)'], default: '1 (Info)' },
    ],
    template: (p) => {
      const sev = (p.severity || '1 (Info)').split(' ')[0];
      return `Write-ADTLogEntry -Message "${p.message || 'Custom step reached.'}" -Severity ${sev}`;
    },
  },
];

/** All unique categories in display order */
export const SNIPPET_CATEGORIES = [...new Set(SNIPPETS.map(s => s.category))];

/** Filter snippets by category and/or search term */
export function getSnippets({ category, search } = {}) {
  let results = SNIPPETS;
  if (category) results = results.filter(s => s.category === category);
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(s =>
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }
  return results;
}
