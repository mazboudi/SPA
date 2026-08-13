/**
 * parseMsi.js — MSI metadata extractor (ported from pymsi)
 *
 * Faithfully ports the logic from https://github.com/nightlark/pymsi to
 * JavaScript. Uses the bundled 'cfb' npm package only for OLE container
 * parsing; all MSI database decoding is done inline.
 *
 * Self-contained: no CDN, no WebAssembly, no network access required.
 */
import CFB from 'cfb';

// ─────────────────────────────────────────────────────────────────────────────
//  MSI stream-name encoding  (ported from pymsi/streamname.py)
// ─────────────────────────────────────────────────────────────────────────────

// TABLE_PREFIX is U+4840 — prepended to every table stream name
const TABLE_PREFIX = '\u4840';

/** Map a mime-alphabet index (0-63) to its ASCII character. */
function mime2utf(x) {
  if (x < 10)   return String.fromCharCode(x + 48);       // '0'..'9'
  if (x < 36)   return String.fromCharCode(x - 10 + 65);  // 'A'..'Z'
  if (x < 62)   return String.fromCharCode(x - 36 + 97);  // 'a'..'z'
  if (x === 62) return '.';
  return '_';
}

/** Map an ASCII character to its mime-alphabet index (0-63), or null. */
function utf2mime(c) {
  const code = typeof c === 'number' ? c : c.charCodeAt(0);
  if (code >= 48 && code <= 57)  return code - 48;        // '0'..'9'
  if (code >= 65 && code <= 90)  return code - 65 + 10;   // 'A'..'Z'
  if (code >= 97 && code <= 122) return code - 97 + 36;   // 'a'..'z'
  if (code === 46) return 62;  // '.'
  if (code === 95) return 63;  // '_'
  return null;
}

/**
 * Encode a table/stream name to its MSI Unicode representation.
 * isTable=true prepends TABLE_PREFIX (U+4840).
 *
 * Two-char pairs: chr(0x3800 + (v2 << 6) + v1)
 *   v1 = mime index of first char (low 6 bits)
 *   v2 = mime index of second char (high 6 bits)
 * Single char:   chr(0x4800 + v1)
 */
function encodeMsiName(name, isTable = false) {
  let out = isTable ? TABLE_PREFIX : '';
  for (let i = 0; i < name.length; i++) {
    const v1 = utf2mime(name[i]);
    if (v1 !== null) {
      if (i + 1 < name.length) {
        const v2 = utf2mime(name[i + 1]);
        if (v2 !== null) {
          out += String.fromCharCode(0x3800 + (v2 << 6) + v1);
          i++; // consume two chars
          continue;
        }
      }
      out += String.fromCharCode(0x4800 + v1);
    } else {
      out += name[i];
    }
  }
  return out;
}

/**
 * Decode a MSI-encoded stream name back to ASCII.
 * For two-char encoding: low 6 bits → first char, high bits → second char.
 */
function decodeMsiName(name) {
  let out = '';
  let start = 0;
  if (name.startsWith(TABLE_PREFIX)) { start = 1; }
  for (let i = start; i < name.length; i++) {
    const value = name.charCodeAt(i);
    if (value >= 0x3800 && value < 0x4800) {
      const v = value - 0x3800;
      out += mime2utf(v & 0x3F);  // first char = low 6 bits
      out += mime2utf(v >> 6);    // second char = high bits
    } else if (value >= 0x4800 && value <= 0x487F) {
      out += mime2utf(value - 0x4800);
    } else {
      out += name[i];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Binary helpers
// ─────────────────────────────────────────────────────────────────────────────

function toUint8(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  if (Array.isArray(content)) return new Uint8Array(content);
  if (content && typeof content.buffer === 'object') return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  return new Uint8Array(0);
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stream lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a CFB stream entry by its MSI-encoded name.
 * Tries: TABLE_PREFIX-encoded, plain-encoded, decoded-name match.
 */
function findStream(cfb, name, isTable = false) {
  const encodedTable = encodeMsiName(name, true);
  const encodedPlain = encodeMsiName(name, false);

  for (const entry of cfb.FileIndex) {
    if (!entry.content) continue;
    if (entry.name === encodedTable || entry.name === encodedPlain) return entry;
  }
  // Fallback: cfb may have already decoded the names
  for (const entry of cfb.FileIndex) {
    if (!entry.content) continue;
    if (entry.name === name) return entry;
    try {
      if (decodeMsiName(entry.name) === name) return entry;
    } catch { /* skip */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  String pool  (ported from pymsi/stringpool.py)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode _StringPool + _StringData into an array of strings (0-indexed).
 *
 * Ported exactly from pymsi StringPool.__init__():
 *   - Header: 4 bytes read as u32 LE.
 *       High bit (0x80000000) = long_string_refs flag (3-byte indices in tables).
 *       Remaining 31 bits = ANSI codepage ID.
 *   - Each pool entry = [length: u16][refcount: u16].
 *       If length==0 AND refcount>0 → the NEXT 4 bytes (u32) give the true length.
 *   - Database string references are 1-based (ref=0 = null, ref=1 = strings[0]).
 *
 * @returns {{ strings: string[], longStringRefs: boolean }}
 */
function decodeStringPool(poolBytes, dataBytes) {
  const pool = viewOf(poolBytes);
  let pos = 0;

  // 4-byte header (u32 LE)
  const header = pool.getUint32(pos, true); pos += 4;
  const longStringRefs = !!(header & 0x80000000);
  const codepageId = header & 0x7FFFFFFF;

  let decoder;
  try {
    if (codepageId === 0 || codepageId === 65001) {
      decoder = new TextDecoder('utf-8', { fatal: false });
    } else if (codepageId === 1252) {
      decoder = new TextDecoder('windows-1252', { fatal: false });
    } else if (codepageId === 1200 || codepageId === 1201) {
      decoder = new TextDecoder('utf-16le', { fatal: false });
    } else {
      decoder = new TextDecoder('utf-8', { fatal: false });
    }
  } catch {
    decoder = new TextDecoder('utf-8', { fatal: false });
  }

  const strings = []; // 0-indexed; DB refs are 1-based
  let dataOffset = 0;

  while (pos + 3 < poolBytes.length) {
    let length   = pool.getUint16(pos,     true); pos += 2;
    let refcount = pool.getUint16(pos,     true); pos += 2;

    // Extended: length==0 AND refcount>0 means next u32 is actual length
    if (length === 0 && refcount > 0) {
      if (pos + 3 < poolBytes.length) {
        length = pool.getUint32(pos, true); pos += 4;
      }
    }

    if (length > 0 && dataOffset + length <= dataBytes.length) {
      strings.push(decoder.decode(dataBytes.slice(dataOffset, dataOffset + length)));
      dataOffset += length;
    } else {
      strings.push('');
    }
  }

  console.log(`MSI StringPool: ${strings.length} strings, codepage=${codepageId}, longRefs=${longStringRefs}`);
  return { strings, longStringRefs };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Property table  (ported from pymsi/table.py _read_rows)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode the Property table stream.
 *
 * Per pymsi table.py _read_rows(), the layout is COLUMN-MAJOR:
 *   outer loop = columns, inner loop = rows
 *   for col in columns:
 *     for row in 0..numRows:
 *       rows[row][col] = read_value()
 *
 * The Property table has 2 string columns: [Property (PK), Value].
 * Each string cell is refWidth bytes:
 *   Standard: 2 bytes (u16)
 *   Long-refs: 3 bytes (u16 low + u8 high = 24-bit index)
 * String refs are 1-based (0 = null, N = strings[N-1]).
 *
 * We try both ref widths (2 and 3) and pick the higher-scoring result.
 */
function decodePropertyTable(tableBytes, strings, longStringRefs) {
  const bytes = toUint8(tableBytes);
  const knownKeys = new Set([
    'ProductCode', 'ProductVersion', 'ProductName', 'Manufacturer',
    'UpgradeCode', 'ProductLanguage', 'ALLUSERS', 'ARPCONTACT',
    'ARPHELPLINK', 'ARPURLINFOABOUT', 'ARPNOREPAIR', 'ARPNOMODIFY',
    'SecureCustomProperties', 'ARPNOREMOVE',
  ]);

  let bestProps = {};
  let bestScore = 0;
  let bestDesc  = 'none';

  // Try the expected ref width first, then the other as fallback
  const refWidths = longStringRefs ? [3, 2] : [2, 3];

  for (const refWidth of refWidths) {
    const rowStride = refWidth * 2; // 2 columns per row
    if (bytes.length === 0 || bytes.length % rowStride !== 0) continue;

    const numRows = bytes.length / rowStride;
    if (numRows < 1 || numRows > 10000) continue;

    const view = viewOf(bytes);

    // Column 0: Property keys — bytes [0 .. numRows*refWidth)
    const keys = [];
    for (let r = 0; r < numRows; r++) {
      const off = r * refWidth;
      let idx = view.getUint16(off, true);
      if (refWidth === 3) idx |= (view.getUint8(off + 2) << 16);
      keys.push(idx === 0 ? null : (idx - 1 < strings.length ? strings[idx - 1] : null));
    }

    // Column 1: Values — bytes [numRows*refWidth .. 2*numRows*refWidth)
    const vals = [];
    const col1Offset = numRows * refWidth;
    for (let r = 0; r < numRows; r++) {
      const off = col1Offset + r * refWidth;
      let idx = view.getUint16(off, true);
      if (refWidth === 3) idx |= (view.getUint8(off + 2) << 16);
      vals.push(idx === 0 ? '' : (idx - 1 < strings.length ? strings[idx - 1] : ''));
    }

    const props = {};
    let score   = 0;
    for (let r = 0; r < numRows; r++) {
      const key = keys[r];
      if (key && /^[A-Za-z_]/.test(key)) {
        props[key] = vals[r] || '';
        if (knownKeys.has(key)) score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestProps = props;
      bestDesc  = `refWidth=${refWidth}, ${numRows} rows, score=${score}`;
    }
  }

  console.log(`MSI Property table: col-major, ${bestDesc}, ${Object.keys(bestProps).length} props`);
  return bestProps;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an MSI file and extract common properties.
 * @param {File} file
 * @returns {Promise<{productCode, productVersion, productName, manufacturer, upgradeCode, fileName}>}
 */
export async function parseMsiFile(file) {
  const emptyResult = {
    productCode: '', productVersion: '', productName: '',
    manufacturer: '', upgradeCode: '', fileName: file.name,
  };

  // ── Primary: delegate to backend (Node.js cfb works for any MSI size) ──────
  try {
    const formData = new FormData();
    formData.append('msi', file);
    const resp = await fetch('/api/msi-info', { method: 'POST', body: formData });
    if (resp.ok) {
      const json = await resp.json();
      console.log('MSI: backend parse result:', json);
      return {
        productCode:    json.productCode    || '',
        productVersion: json.productVersion || '',
        productName:    json.productName    || '',
        manufacturer:   json.manufacturer   || '',
        upgradeCode:    json.upgradeCode    || '',
        fileName:       file.name,
      };
    }
    console.warn('MSI: backend returned', resp.status, '— falling back to browser parser');
  } catch (networkErr) {
    console.warn('MSI: backend unreachable, falling back to browser parser:', networkErr.message);
  }

  // ── Fallback: browser-side CFB parsing (may fail on large MSIs) ─────────────
  const buffer = await file.arrayBuffer();
  const result = { ...emptyResult };

  let cfb;
  try {
    cfb = CFB.read(buffer, { type: 'buffer' });
  } catch (e) {
    console.error('MSI: CFB parse failed:', e);
    fallbackBinaryScan(new Uint8Array(buffer), result);
    return result;
  }

  try {
    const poolEntry = findStream(cfb, '_StringPool', true);
    const dataEntry = findStream(cfb, '_StringData', true);
    const propEntry = findStream(cfb, 'Property',    true);

    if (!poolEntry || !dataEntry || !propEntry) {
      console.warn('MSI: key streams not found → binary fallback');
      fallbackBinaryScan(new Uint8Array(buffer), result);
      return result;
    }

    const { strings, longStringRefs } = decodeStringPool(toUint8(poolEntry.content), toUint8(dataEntry.content));
    const properties = decodePropertyTable(propEntry.content, strings, longStringRefs);

    result.productCode    = properties['ProductCode']    || '';
    result.productVersion = properties['ProductVersion'] || '';
    result.productName    = properties['ProductName']    || '';
    result.manufacturer   = properties['Manufacturer']   || '';
    result.upgradeCode    = properties['UpgradeCode']    || '';
    console.log('MSI: browser parse result:', result);

  } catch (e) {
    console.warn('MSI: browser parse failed:', e);
    fallbackBinaryScan(new Uint8Array(buffer), result);
  }

  if (!result.productCode || !result.productVersion || !result.productName) {
    fallbackBinaryScan(new Uint8Array(buffer), result);
  }

  return result;
}
// ─────────────────────────────────────────────────────────────────────────────
//  Binary fallback
// ─────────────────────────────────────────────────────────────────────────────

function fallbackBinaryScan(data, result) {
  try {
    const utf8  = new TextDecoder('utf-8',    { fatal: false }).decode(data);
    const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(data);
    const guidPat = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;

    for (const text of [utf8, utf16]) {
      if (!result.productCode) {
        const m = text.match(/ProductCode[^{]{0,20}(\{[0-9A-Fa-f-]{36}\})/i);
        if (m) result.productCode = m[1];
      }
      if (!result.upgradeCode) {
        const m = text.match(/UpgradeCode[^{]{0,20}(\{[0-9A-Fa-f-]{36}\})/i);
        if (m) result.upgradeCode = m[1];
      }
    }
    if (!result.productCode || !result.upgradeCode) {
      const guids = utf16.match(guidPat) || [];
      if (!result.productCode  && guids[0]) result.productCode  = guids[0];
      if (!result.upgradeCode  && guids[1]) result.upgradeCode  = guids[1];
    }
    if (!result.productVersion) {
      const vm = utf16.match(/ProductVersion[^\d]{0,20}(\d+\.\d+\.\d+[\.\d]*)/);
      result.productVersion = vm ? vm[1] : ((utf16.match(/(\d+\.\d+\.\d+[\.\d]*)/) || [])[1] || '');
    }
    if (!result.productName) {
      const idx = utf16.indexOf('ProductName');
      if (idx > -1) {
        const after = utf16.substring(idx + 11, idx + 200).replace(/[\x00-\x1f]/g, '').trim();
        if (after.length > 1 && after.length < 100)
          result.productName = after.split(/[\x00\t\n]/)[0].trim();
      }
    }
  } catch (e) {
    console.warn('MSI: Binary fallback failed:', e);
  }
}
