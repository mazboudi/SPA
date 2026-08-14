/**
 * parsePsadtBlocks.js
 * Performs comment-wrapped block parsing on a PSADT v4 script to reconstruct the visual action state.
 *
 * Scans each deployment phase block, extracts `# <SPA:Action>` comment wrappers, computes
 * CRC hashes to detect manual edits, and wraps any legacy/custom code into raw PowerShell blocks.
 *
 * Variable extraction is delegated to the shared extractVarDeclarationsV4() function
 * in parsePsadt.js — the single source of truth for $adtSession variable parsing.
 */

import { extractVarDeclarationsV4, modernizeLegacyScriptParts } from './parsePsadt.js';

/**
 * Promotes known standard PSADT template boilerplate out of raw script blocks
 * and converts them into visual SPA action cards.
 */
export function promoteLegacyCards(rawScript) {
  if (!rawScript) return { orderedItems: [], actions: [], remaining: '' };
  const extracted = [];
  let text = rawScript;

  // Use NUL-delimited placeholders to track each extracted action's position
  // within the source text. This lets us reconstruct the original document order
  // when mixing promoted cards with leftover raw_ps content.
  const mkPlaceholder = (idx) => `\x00${idx}\x00`;

  const extract = (rx, makeAction) => {
    text = text.replace(rx, (...args) => {
      const action = makeAction(...args);
      if (!action) return '';
      const idx = extracted.length;
      extracted.push(action);
      return mkPlaceholder(idx);
    });
  };

  // 1. Zero-Config MSI (SPA template version) — remove, no action card
  const zcMsiRx = /(?:##\s*Handle Zero-Config MSI installations\.\r?\n)?\s*if\s*\(\$adtSession\.UseDefaultMsi\)[\s\S]*?\$adtSession\.DefaultMspFiles\s*\|\s*Start-ADTMsiProcess\s+-Action\s+Patch\s*\}\s*\}/gi;
  text = text.replace(zcMsiRx, '');

  const zcMsiUninstallRx = /(?:##\s*Handle Zero-Config MSI uninstallations\.\r?\n)?\s*if\s*\(\$adtSession\.UseDefaultMsi\)[\s\S]*?Start-ADTMsiProcess\s*@ExecuteDefaultMSISplat\s*\}/gi;
  text = text.replace(zcMsiUninstallRx, '');

  // 2. Pre-Install / Pre-Uninstall Show-Welcome with process closing
  const welcomeRx = /(?:##\s*Show Welcome Message[^\r\n]*\r?\n)?\s*\$saiwParams\s*=\s*@\{([\s\S]*?)\}\s*(?:if\s*\([^\{]+\{\s*\$saiwParams\.Add\('CloseProcesses'[^}]+\}\s*)?(#?Show-ADTInstallationWelcome\s*@saiwParams)/gi;
  extract(welcomeRx, (match, hashBody, callStmt) => {
    const allowDefer = /AllowDefer\s*=\s*\$true/i.test(hashBody);
    const deferTimesMatch = /DeferTimes\s*=\s*(\d+)/i.exec(hashBody);
    const deferTimes = deferTimesMatch ? parseInt(deferTimesMatch[1], 10) : 3;
    const checkDiskSpace = /CheckDiskSpace\s*=\s*\$true/i.test(hashBody);
    const persistPrompt = /PersistPrompt\s*=\s*\$true/i.test(hashBody);
    return {
      type: 'show_welcome',
      enabled: !callStmt.startsWith('#'),
      allowDefer,
      deferTimes,
      checkDiskSpace,
      persistPrompt,
      closeProcessesCountdown: 0,
      forceCloseProcessesCountdown: 0,
      blockExecution: false,
    };
  });

  // 3. Simple Show-Welcome for Uninstall countdown
  const uninstallWelcomeRx = /(?:##\s*If there are processes to close[^\r\n]*\r?\n)?\s*if\s*\(\$adtSession\.AppProcessesToClose\.Count\s*-gt\s*0\)\s*\{\s*Show-ADTInstallationWelcome\s+-CloseProcesses\s+\$adtSession\.AppProcessesToClose\s+-CloseProcessesCountdown\s+(\d+)\s*\}/gi;
  extract(uninstallWelcomeRx, (match, cd) => ({
    type: 'show_welcome',
    enabled: true,
    allowDefer: false,
    deferTimes: 0,
    checkDiskSpace: false,
    persistPrompt: false,
    closeProcessesCountdown: parseInt(cd, 10),
    forceCloseProcessesCountdown: 0,
    blockExecution: false,
  }));

  // 4. Standard Show-Progress
  const progressRx = /(?:##\s*Show Progress Message[^\r\n]*\r?\n)?\s*(#?)Show-ADTInstallationProgress(?:[\s\S]*?-StatusMessage\s+'([^']+)')?(?:[\s\S]*?-WindowLocation\s+'([^']+)')?/gi;
  extract(progressRx, (match, comment, msg) => ({
    type: 'show_progress',
    enabled: !comment.startsWith('#'),
    statusMessage: msg || '',
    topMost: true,
  }));

  // 5. Post-Install Show-Prompt (Show Completion)
  //    Matches both block-style (braces on own lines, PSADT 4.1.8 standard) and
  //    compact single-line style. Also captures the message text for round-trips.
  //    Quoted timeout value (e.g. -Timeout '5') is also accepted.
  const promptRx = /(?:##\s*Display a message at the end[^\r\n]*[\r\n]*)\s*if\s*\(!\$adtSession\.UseDefaultMsi\)[\s\r\n]*\{[\s\r\n]*(#?)Show-ADTInstallationPrompt\s+-Message\s+'([^']+)'[^\r\n]*[\r\n\s]*\}|(?:##\s*Display a message at the end[^\r\n]*[\r\n]*)?\s*if\s*\(!\$adtSession\.UseDefaultMsi\)\s*\{\s*(#?)Show-ADTInstallationPrompt\s+-Message\s+'([^']+)'[^}]*\}/gi;
  extract(promptRx, (match, commentA, msgA, commentB, msgB) => ({
    type: 'show_completion',
    enabled: !(commentA || commentB || '').startsWith('#'),
    message: msgA || msgB || '',
  }));

  // 6. Generic Perform tasks placeholder comments
  const performTasksRx = /##\s*<Perform (?:Pre-|Post-)?(?:Installation|Uninstallation) tasks here>/gi;
  text = text.replace(performTasksRx, '');

  // Clear out any trailing/multiple blank lines left behind
  text = text.replace(/^\s*$(?:\r?\n)+/gm, '\n').trim();

  // ── Reconstruct document-ordered items from text-with-placeholders ────────
  // After all replacements, `text` contains the leftover raw content with
  // \x00N\x00 placeholders where each promoted action was. Splitting on these
  // gives us alternating [text, actionIdx, text, actionIdx, ...] segments that
  // preserve the original source ordering.
  const segments = text.split(/\x00(\d+)\x00/);
  const orderedItems = [];

  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 0) {
      // Text segment — may be leftover raw PS
      const seg = segments[i].replace(/^[\s\r\n]+|[\s\r\n]+$/g, '');
      if (seg) orderedItems.push({ _rawText: seg });
    } else {
      // Placeholder index → the promoted action card
      orderedItems.push(extracted[parseInt(segments[i], 10)]);
    }
  }

  // Backward-compatible flat accessors
  const actions  = orderedItems.filter(item => !item._rawText);
  const remaining = orderedItems.filter(item => item._rawText).map(item => item._rawText).join('\n');

  return { orderedItems, actions, remaining };
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
      phases: {
        variableDeclaration: { actions: [] },
        preInstall: { actions: [] },
        install: { actions: [] },
        postInstall: { actions: [] },
        preUninstall: { actions: [] },
        uninstall: { actions: [] },
        postUninstall: { actions: [] },
      }
    }
  };

  if (!content) return result;

  // Normalize encoding: strip BOM, normalize CRLF → LF
  content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = content.split('\n');

  /**
   * Count net { vs } on a line, skipping characters inside quoted strings.
   * Registry keys (and other string params) can contain { and } inside
   * single- or double-quoted values; counting them naively corrupts depth.
   */
  function netBraces(line) {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
      if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
      if (inSingle || inDouble) continue;
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    return depth;
  }

  // ── 1. Parse $adtSession variables ─────────────────────────────────────
  // Standard + array + system-managed vars via the shared single source of truth
  const standardVars = extractVarDeclarationsV4(content);

  // Additionally scan for SPA:Action-wrapped custom vars (only present in generated scripts)
  const wrappedVars = [];
  let insideSession = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\$adtSession\s*=\s*@{/.test(line)) {
      insideSession = true;
      continue;
    }
    if (insideSession && /^\s*}\s*$/.test(line)) {
      break;
    }
    if (insideSession) {
      const actionMatch = line.match(/#\s*<SPA:Action\s+Data="([^"]+)"(?:\s+Hash="[^"]+")?>/);
      if (actionMatch) {
        const rawData = actionMatch[1];
        let j = i + 1;
        while (j < lines.length && !/#\s*<\/SPA:Action>/.test(lines[j])) {
          j++;
        }
        try {
          const actionObj = JSON.parse(decodeURIComponent(rawData));
          wrappedVars.push(actionObj);
        } catch (e) {
          console.error('Failed to parse wrapped variable', e);
        }
        i = j;
      }
    }
  }

  // Merge: SPA:Action-wrapped vars take precedence (they carry user edits from VS Code)
  const wrappedNames = new Set(wrappedVars.map(a => a.name));
  result.lifecycle.phases.variableDeclaration.actions = [
    ...standardVars.filter(a => !wrappedNames.has(a.name)),
    ...wrappedVars,
  ];

  const phaseLines = {
    preInstall: [],
    install: [],
    postInstall: [],
    preUninstall: [],
    uninstall: [],
    postUninstall: [],
  };

  let currentPhase = null;
  let bracesCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect function boundaries to switch phases
    if (/function\s+Install-ADTDeployment/.test(line)) {
      currentPhase = 'preInstall';
      bracesCount = 0;
      bracesCount += netBraces(line);
      continue;
    }
    if (/function\s+Uninstall-ADTDeployment/.test(line)) {
      currentPhase = 'preUninstall';
      bracesCount = 0;
      bracesCount += netBraces(line);
      continue;
    }
    // Skip Repair-ADTDeployment (no longer used in PSADT 4.1x)
    if (/function\s+Repair-ADTDeployment/.test(line)) {
      // Skip until the function closes
      let repairBraces = 0;
      repairBraces += netBraces(line);
      while (i + 1 < lines.length && repairBraces > 0) {
        i++;
        repairBraces += netBraces(lines[i]);
      }
      continue;
    }

    if (currentPhase) {
      const trimmed = line.trim();

      // Skip the function's opening brace line if it's on a line by itself and we haven't entered the body
      if (trimmed === '{' && bracesCount === 0) {
        bracesCount = 1;
        continue;
      }

      // Skip [CmdletBinding()] param() at the top of the function
      if (trimmed.startsWith('[CmdletBinding()]') && phaseLines[currentPhase] && phaseLines[currentPhase].length < 10) {
        let paramParen = 0;
        let seenParamBlock = false;
        let lineLimit = 50; // Safety valve

        while (i + 1 < lines.length && lineLimit-- > 0) {
          i++;
          const innerLine = lines[i];
          const innerTrimmed = innerLine.trim();

          if (innerTrimmed.startsWith('param')) {
            seenParamBlock = true;
          }

          bracesCount += netBraces(innerLine);
          for (const ch of innerLine) {
            if (ch === '(') paramParen++;
            if (ch === ')') paramParen--;
          }

          if (seenParamBlock && paramParen <= 0 && innerTrimmed.endsWith(')')) {
            break;
          }
        }
        continue;
      }

      // Track exact nested braces — quote-aware to handle registry keys containing { }
      let tempBraces = bracesCount + netBraces(line);

      // Detect sub-phase marker overrides.
      // IMPORTANT: use negative lookbehind to avoid matching '## MARK: Pre-Install'
      // as an 'Install' phase transition — that bug caused pre-install to immediately
      // jump to install, losing all pre-install AND install actions on VS Code sync.
      if (currentPhase.startsWith('pre') && /##\s*MARK:\s*(?!Pre-)(?!Post-)(Install|Uninstall)\b/i.test(line)) {
        currentPhase = currentPhase.replace('pre', '').toLowerCase();
        bracesCount = tempBraces;
        continue;
      }
      if (!currentPhase.startsWith('post') && /##\s*MARK:\s*Post-/i.test(line)) {
        const type = currentPhase.includes('ninstall') ? 'uninstall' : 'install';
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
            // Filter out exact phase boilerplate markers that are not skipped by the regexes
            if (/^##=+$/.test(trimmed)) return false;
            if (/^##\s*MARK:\s*(?:Pre-|Post-)?(?:Install|Uninstall)$/i.test(trimmed)) return false;
            if (trimmed.includes('adtSession.InstallPhase =')) return false;
            return true;
          })
          .join('\n')
          .trim();

        if (cleanRaw) {
          // Promote legacy template boilerplate into visual cards.
          // orderedItems preserves the original source order: each item is either
          // a promoted action card or { _rawText } for leftover raw PowerShell.
          const { orderedItems } = promoteLegacyCards(cleanRaw);

          for (const item of orderedItems) {
            if (item._rawText) {
              // Leftover raw PS — emit as raw_ps only if it has executable content
              const hasExecutableCode = item._rawText.split('\n').some(line => {
                const t = line.trim();
                return t && !t.startsWith('#') && !t.startsWith('<#');
              });
              if (hasExecutableCode) {
                actions.push({
                  type: 'raw_ps',
                  enabled: true,
                  script: modernizeLegacyScriptParts(item._rawText),
                  note: 'Legacy or custom script block',
                  isManuallyEdited: true
                });
              }
            } else {
              actions.push(item);
            }
          }
        }
        currentRawBuffer = [];
      }
    };
    for (let i = 0; i < lns.length; i++) {
      const line = lns[i];
      const actionMatch = line.match(/#\s*<SPA:Action\s+Data="([^"]+)"(?:\s+Hash="[^"]+")?>/);
      const customCodeMatch = line.match(/#\s*<SPA:CustomCode(?:\s+Phase="([^"]+)")?(?:\s+Guide="([^"]+)")?>/);
      if (actionMatch) {
        // Flush any preceding raw code before parsing the visual card
        flushRawBuffer();

        const rawData = actionMatch[1];

        // Read child lines until closing marker
        let j = i + 1;
        while (j < lns.length && !/#\s*<\/SPA:Action>/.test(lns[j])) {
          j++;
        }

        try {
          const actionObj = JSON.parse(decodeURIComponent(rawData));
          actions.push(actionObj);
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
            script: modernizeLegacyScriptParts(cleanCode),
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
