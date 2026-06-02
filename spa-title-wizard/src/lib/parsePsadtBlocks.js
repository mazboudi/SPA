/**
 * parsePsadtBlocks.js
 * Performs comment-wrapped block parsing on a PSADT v4 script to reconstruct the visual action state.
 *
 * Scans each deployment phase block, extracts `# <SPA:Action>` comment wrappers, computes
 * CRC hashes to detect manual edits, and wraps any legacy/custom code into raw PowerShell blocks.
 */

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function normalizeForHash(str) {
  if (!str) return '';
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

function dedentLines(blockLines) {
  return blockLines.map(line => {
    const match = line.match(/^(\s{0,8})(.*)$/);
    return match ? match[2] : line;
  });
}

/**
 * Extracts all actions from a script block.
 * @param {string} content The full script content
 * @returns {object} Reconstructed lifecycle phases and variables
 */
export default function parsePsadtBlocks(content) {
  const result = {
    lifecycle: {
      repairMode: 'mirror',
      phases: {
        variableDeclaration: { actions: [] },
        preInstall: { actions: [] },
        install: { actions: [] },
        postInstall: { actions: [] },
        preUninstall: { actions: [] },
        uninstall: { actions: [] },
        postUninstall: { actions: [] },
        preRepair: { actions: [] },
        repair: { actions: [] },
        postRepair: { actions: [] },
      }
    }
  };

  if (!content) return result;

  const lines = content.split(/\r?\n/);

  // 1. Parse standard custom variables from $adtSession Hashtable declaration
  let insideSession = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\$adtSession\s*=\s*@{/.test(line)) {
      insideSession = true;
      continue;
    }
    if (insideSession && /^\s*}\s*$/.test(line)) {
      insideSession = false;
      break;
    }
    if (insideSession) {
      // Check for wrapped variables
      const actionMatch = line.match(/#\s*<SPA:Action\s+Data="([^"]+)"\s+Hash="([^"]+)">/);
      if (actionMatch) {
        const rawData = actionMatch[1];
        const expectedHash = actionMatch[2];

        // Gather block lines
        const blockLines = [];
        let j = i + 1;
        while (j < lines.length && !/#\s*<\/SPA:Action>/.test(lines[j])) {
          blockLines.push(lines[j]);
          j++;
        }

        try {
          const actionObj = JSON.parse(decodeURIComponent(rawData));
          const codeString = blockLines.join('\n');
          const actualHash = simpleHash(normalizeForHash(codeString));

          if (actualHash !== expectedHash) {
            // User modified variables manually! Convert to custom_variable with raw changes
            const match = codeString.match(/^\s*([A-Za-z0-9_]+)\s*=\s*'([^']*)'/);
            if (match) {
              actionObj.name = match[1];
              actionObj.value = match[2];
            }
            actionObj.isManuallyEdited = true;
          }
          result.lifecycle.phases.variableDeclaration.actions.push(actionObj);
        } catch (e) {
          console.error('Failed to parse wrapped variable', e);
        }
        i = j; // skip forward
      }
    }
  }

  // 2. Parse phases from standard deployment functions
  const phaseBounds = {
    preInstall: { start: /function\s+Install-ADTDeployment/, end: /##\s*MARK:\s*Install/ },
    install: { start: /##\s*MARK:\s*Install/, end: /##\s*MARK:\s*Post-Install/ },
    postInstall: { start: /##\s*MARK:\s*Post-Install/, end: /^\s*}\s*$/ },

    preUninstall: { start: /function\s+Uninstall-ADTDeployment/, end: /##\s*MARK:\s*Uninstall/ },
    uninstall: { start: /##\s*MARK:\s*Uninstall/, end: /##\s*MARK:\s*Post-Uninstall/ },
    postUninstall: { start: /##\s*MARK:\s*Post-Uninstall/, end: /^\s*}\s*$/ },

    preRepair: { start: /function\s+Repair-ADTDeployment/, end: /##\s*MARK:\s*Repair/ },
    repair: { start: /##\s*MARK:\s*Repair/, end: /##\s*MARK:\s*Post-Repair/ },
    postRepair: { start: /##\s*MARK:\s*Post-Repair/, end: /^\s*}\s*$/ },
  };

  const phaseLines = {
    preInstall: [],
    install: [],
    postInstall: [],
    preUninstall: [],
    uninstall: [],
    postUninstall: [],
    preRepair: [],
    repair: [],
    postRepair: [],
  };

  let currentPhase = null;
  let bracesCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect function boundaries to switch phases
    if (/function\s+Install-ADTDeployment/.test(line)) {
      currentPhase = 'preInstall';
      bracesCount = 0;
      for (const ch of line) {
        if (ch === '{') bracesCount++;
        if (ch === '}') bracesCount--;
      }
      continue;
    }
    if (/function\s+Uninstall-ADTDeployment/.test(line)) {
      currentPhase = 'preUninstall';
      bracesCount = 0;
      for (const ch of line) {
        if (ch === '{') bracesCount++;
        if (ch === '}') bracesCount--;
      }
      continue;
    }
    if (/function\s+Repair-ADTDeployment/.test(line)) {
      currentPhase = 'preRepair';
      bracesCount = 0;
      for (const ch of line) {
        if (ch === '{') bracesCount++;
        if (ch === '}') bracesCount--;
      }
      result.lifecycle.repairMode = 'custom'; // If Repair-ADTDeployment function is defined, it is a custom repair
      continue;
    }

    if (currentPhase) {
      const trimmed = line.trim();

      // Skip the function's opening brace line if it's on a line by itself and we haven't entered the body
      if (trimmed === '{' && bracesCount === 0) {
        bracesCount = 1;
        continue;
      }

      // Track exact nested braces
      let tempBraces = bracesCount;
      for (const ch of line) {
        if (ch === '{') tempBraces++;
        if (ch === '}') tempBraces--;
      }

      // Detect sub-phase marker overrides
      if (currentPhase.startsWith('pre') && /##\s*MARK:\s*(Install|Uninstall|Repair)\b/.test(line)) {
        currentPhase = currentPhase.replace('pre', '').toLowerCase();
        bracesCount = tempBraces;
        continue;
      }
      if (!currentPhase.startsWith('post') && /##\s*MARK:\s*Post-/.test(line)) {
        const type = currentPhase.includes('install') ? 'install' : currentPhase.includes('uninstall') ? 'uninstall' : 'repair';
        currentPhase = 'post' + type.charAt(0).toUpperCase() + type.slice(1);
        bracesCount = tempBraces;
        continue;
      }

      if (tempBraces <= 0) {
        currentPhase = null; // exited function block
        continue;
      }

      bracesCount = tempBraces;
      phaseLines[currentPhase].push(line);
    }
  }

  // 3. Parse extracted lines per phase into action cards
  for (const [phaseKey, lns] of Object.entries(phaseLines)) {
    const actions = [];
    let currentRawBuffer = [];

    const flushRawBuffer = () => {
      if (currentRawBuffer.length > 0) {
        const cleanRaw = currentRawBuffer
          .map(l => l.trimRight())
          .filter(l => {
            const trimmed = l.trim();
            if (!trimmed) return false;
            // Filter out boilerplate skeleton lines and section title markers
            if (/^\[CmdletBinding\(\)\]$/i.test(trimmed)) return false;
            if (/^param$/i.test(trimmed)) return false;
            if (/^\($/.test(trimmed)) return false;
            if (/^\)$/.test(trimmed)) return false;
            if (/^##/.test(trimmed)) return false; // Filters ##======= and ## MARK:
            if (trimmed.includes('adtSession.InstallPhase')) return false;
            if (trimmed.includes('## No')) return false;
            if (trimmed.includes("Write-ADTLogEntry -Message 'TODO")) return false;
            return true;
          })
          .join('\n')
          .trim();

        if (cleanRaw) {
          // Check if cleanRaw contains at least one line of executable code
          const hasExecutableCode = cleanRaw.split('\n').some(line => {
            const t = line.trim();
            return t && !t.startsWith('#') && !t.startsWith('<#');
          });

          if (hasExecutableCode) {
            actions.push({
              type: 'raw_ps',
              enabled: true,
              script: cleanRaw,
              note: 'Legacy or custom script block',
              isManuallyEdited: true
            });
          }
        }
        currentRawBuffer = [];
      }
    };

    for (let i = 0; i < lns.length; i++) {
      const line = lns[i];
      const actionMatch = line.match(/#\s*<SPA:Action\s+Data="([^"]+)"\s+Hash="([^"]+)">/);
      const customCodeMatch = line.match(/#\s*<SPA:CustomCode(?:\s+Phase="([^"]+)")?(?:\s+Guide="([^"]+)")?>/);

      if (actionMatch) {
        // Flush any preceding raw code before parsing the visual card
        flushRawBuffer();

        const rawData = actionMatch[1];
        const expectedHash = actionMatch[2];

        // Read child lines until closing marker
        const blockLines = [];
        let j = i + 1;
        while (j < lns.length && !/#\s*<\/SPA:Action>/.test(lns[j])) {
          blockLines.push(lns[j]);
          j++;
        }

        try {
          const actionObj = JSON.parse(decodeURIComponent(rawData));
          const codeString = blockLines.join('\n');
          const actualHash = simpleHash(normalizeForHash(codeString));

          if (actualHash !== expectedHash) {
            // Manual edit detected! Convert to raw_ps block to lock visual forms
            actions.push({
              type: 'raw_ps',
              enabled: true,
              script: blockLines.map(l => l.trim()).join('\n'),
              note: `Manually modified ${actionObj.type} block`,
              isManuallyEdited: true
            });
          } else {
            actions.push(actionObj);
          }
        } catch (e) {
          console.error(`Failed to parse block action in phase ${phaseKey}`, e);
        }
        i = j; // skip forward
      } else if (customCodeMatch) {
        // Flush any preceding raw code before parsing the custom code block
        flushRawBuffer();

        // Read child lines until closing marker
        const blockLines = [];
        let j = i + 1;
        while (j < lns.length && !/#\s*<\/SPA:CustomCode>/.test(lns[j])) {
          blockLines.push(lns[j]);
          j++;
        }

        const cleanCode = dedentLines(blockLines).map(l => l.trimRight()).join('\n').trim();
        const hasCustomContent = blockLines.some(l => {
          const t = l.trim();
          return t && !t.startsWith('# TODO:');
        });

        if (hasCustomContent) {
          actions.push({
            type: 'raw_ps',
            enabled: true,
            script: cleanCode,
            note: `Packager Custom Code (${phaseKey})`,
            isManuallyEdited: true,
            isCustomCodeBlock: true
          });
        }
        i = j; // skip forward
      } else {
        currentRawBuffer.push(line);
      }
    }

    // Flush any remaining trailing raw code at the end of the phase
    flushRawBuffer();

    result.lifecycle.phases[phaseKey].actions = actions;
  }

  return result;
}
