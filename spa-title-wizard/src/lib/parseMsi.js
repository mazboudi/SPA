/**
 * parseMsi.js
 * Extracts metadata from MSI files in the browser using CFB (Compound Binary File) parsing.
 *
 * MSI files are OLE Compound Documents containing a relational database.
 * Stream names in MSI files are encoded using a 64-character alphabet mapped into
 * the Unicode range 0x3800–0x487F. This file implements proper MSI stream name
 * decoding so streams are found deterministically by name — not by heuristic content
 * scanning, which was the root cause of incorrect results in the previous version.
 *
 * Self-contained: no CDN, no WebAssembly runtime, no network access required.
 * Uses only the bundled 'cfb' npm package for OLE container parsing.
 */
import CFB from 'cfb';

// ── MSI stream name encoding ──────────────────────────────────────────────────
//
// All MSI table and stream names are encoded into Unicode using this 64-char alphabet.
// Each ASCII character maps to a codepoint in the private range:
//   single char  c at index i → chr(0x4840 + i)
//   two chars c1,c2 at i,j   → chr(0x3800 + i*64 + j)
//
const MSI_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._';

/**
 * Decode an MSI-encoded stream/storage name back to its ASCII form.
 * Characters outside the MSI encoding range are kept as-is.
 */
function decodeMsiName(name) {
  let result = '';
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code >= 0x4840 && code <= 0x487f) {
      // Single-char encoding
      result += MSI_CHARS[code - 0x4840];
    } else if (code >= 0x3800 && code < 0x4800) {
      // Two-char encoding
      const idx = code - 0x3800;
      result += MSI_CHARS[Math.floor(idx / 64)] + MSI_CHARS[idx % 64];
    } else {
      result += name[i];
    }
  }
  return result;
}

/**
 * Find a CFB stream by its decoded MSI name.
 * Also accepts literal names in case the cfb library already decoded them.
 */
function findStreamByName(cfb, targetName) {
  for (const entry of cfb.FileIndex) {
    if (!entry.content) continue;
    if (entry.name === targetName || decodeMsiName(entry.name) === targetName) {
      return entry;
    }
  }
  return null;
}

// ── Binary helpers ────────────────────────────────────────────────────────────

/** Safely convert any CFB entry content to a Uint8Array. */
function toUint8(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  if (Array.isArray(content)) return new Uint8Array(content);
  if (content && typeof content.buffer === 'object') {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  return new Uint8Array(0);
}

/** Create a DataView over the exact range of a Uint8Array. */
function viewOf(uint8) {
  return new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
}

// ── String pool decoding ──────────────────────────────────────────────────────

/**
 * Read the ANSI codepage from the StringPool header (first 4 bytes).
 * Returns a TextDecoder for the appropriate encoding.
 */
function getCodepageDecoder(poolBytes) {
  if (poolBytes.length < 4) return new TextDecoder('utf-8', { fatal: false });
  const view = viewOf(poolBytes);
  const codepage = view.getUint16(0, true);
  if (codepage === 65001) return new TextDecoder('utf-8',         { fatal: false });
  if (codepage === 1252)  return new TextDecoder('windows-1252',  { fatal: false });
  if (codepage === 1200)  return new TextDecoder('utf-16le',      { fatal: false });
  return new TextDecoder('utf-8', { fatal: false });
}

/**
 * Decode _StringPool + _StringData into an indexed string array.
 *
 * Pool format (starting at byte 4, skipping the 4-byte codepage/reserved header):
 *   Each 4-byte entry = [length: u16, refcount: u16]
 *   If the high bit of 'length' is set, this is a 24-bit extended-length string:
 *     true_length = (len & 0x7FFF) | (next_refcount << 15)
 *
 * Data format: all strings concatenated in pool order.
 */
function decodeStringPool(poolBytes, stringBytes) {
  const pool    = viewOf(poolBytes);
  const decoder = getCodepageDecoder(poolBytes);
  const strings = [''];  // Index 0 is always the empty string

  let offset = 0;
  let i = 4; // Skip 4-byte header

  while (i + 3 < poolBytes.length) {
    let len      = pool.getUint16(i,     true);
    let refcount = pool.getUint16(i + 2, true);
    i += 4;

    // Extended 24-bit length: high bit set on len → next entry gives high bits
    if (len & 0x8000) {
      if (i + 3 < poolBytes.length) {
        const hiLen = pool.getUint16(i, true);
        i += 4; // consume the extension entry
        len = (len & 0x7FFF) | (hiLen << 15);
      } else {
        len = len & 0x7FFF;
      }
    }

    if (len === 0) {
      strings.push('');
    } else if (offset + len <= stringBytes.length) {
      strings.push(decoder.decode(stringBytes.slice(offset, offset + len)));
      offset += len;
    } else {
      strings.push('');
      // Don't advance offset for corrupt/overflowing entries
    }
  }

  return strings;
}

// ── Property table decoding ───────────────────────────────────────────────────

/**
 * Decode the MSI Property table stream.
 *
 * The Property table has exactly 2 string columns (Property, Value).
 * Data is stored COLUMN-MAJOR: all key indices contiguously, then all value indices.
 * Each index is u16 for standard databases (< 65536 strings) or u32 for large ones.
 *
 * Returns a plain { PropertyName: 'value' } object.
 */
function decodePropertyTable(tableContent, strings) {
  const bytes      = toUint8(tableContent);
  const totalStr   = strings.length;
  const numCols    = 2;

  // Try u16 first (standard), then u32 (large database)
  const indexSizes = totalStr > 0xFFFF ? [4, 2] : [2, 4];

  const knownKeys = new Set([
    'ProductCode', 'ProductVersion', 'ProductName', 'Manufacturer',
    'UpgradeCode', 'ProductLanguage', 'ALLUSERS', 'ARPCONTACT',
    'ARPHELPLINK', 'ARPURLINFOABOUT', 'ARPNOREPAIR', 'ARPNOMODIFY',
  ]);

  let bestProps = {};
  let bestScore = 0;

  for (const idxSize of indexSizes) {
    const rowWidth = idxSize * numCols;
    if (bytes.length === 0 || bytes.length % rowWidth !== 0) continue;

    const numRows = bytes.length / rowWidth;
    if (numRows < 1 || numRows > 10000) continue;

    const view    = viewOf(bytes);
    const colSize = numRows * idxSize;
    const props   = {};
    let score     = 0;

    for (let r = 0; r < numRows; r++) {
      const keyOff = r * idxSize;
      const valOff = colSize + r * idxSize;
      if (valOff + idxSize > bytes.length) break;

      const keyIdx = idxSize === 4
        ? view.getUint32(keyOff, true)
        : view.getUint16(keyOff, true);
      const valIdx = idxSize === 4
        ? view.getUint32(valOff, true)
        : view.getUint16(valOff, true);

      if (keyIdx > 0 && keyIdx < totalStr) {
        const key = strings[keyIdx];
        const val = (valIdx > 0 && valIdx < totalStr) ? strings[valIdx] : '';
        if (key && /^[A-Za-z_]/.test(key)) {
          props[key] = val;
          if (knownKeys.has(key)) score++;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestProps = props;
    }
  }

  return bestProps;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse an MSI file and extract common properties.
 * @param {File} file - The MSI File object from a file input
 * @returns {Promise<Object>} - { productCode, productVersion, productName, manufacturer, upgradeCode, fileName }
 */
export async function parseMsiFile(file) {
  const buffer = await file.arrayBuffer();
  const data   = new Uint8Array(buffer);

  const result = {
    productCode:    '',
    productVersion: '',
    productName:    '',
    manufacturer:   '',
    upgradeCode:    '',
    fileName:       file.name,
  };

  // Step 1: Parse OLE Compound File container
  let cfb;
  try {
    cfb = CFB.read(data, { type: 'array' });
  } catch (e) {
    console.error('MSI: CFB parse failed — file may not be a valid MSI:', e);
    fallbackBinaryScan(data, result);
    return result;
  }

  // Debug: log all decoded stream names to help diagnose issues
  if (import.meta.env?.DEV) {
    const streamNames = cfb.FileIndex
      .filter(e => e.content)
      .map(e => `"${e.name}" → "${decodeMsiName(e.name)}"`)
      .join(', ');
    console.log('MSI streams:', streamNames);
  }

  try {
    // Step 2: Locate _StringData and _StringPool by decoded MSI name
    const stringDataEntry = findStreamByName(cfb, '_StringData');
    const stringPoolEntry = findStreamByName(cfb, '_StringPool');

    if (!stringDataEntry || !stringPoolEntry) {
      console.warn('MSI: Could not locate _StringData or _StringPool streams — falling back to binary scan');
      fallbackBinaryScan(data, result);
      return result;
    }

    const stringDataBytes = toUint8(stringDataEntry.content);
    const stringPoolBytes = toUint8(stringPoolEntry.content);

    // Step 3: Decode string table
    const strings = decodeStringPool(stringPoolBytes, stringDataBytes);
    console.log(`MSI: Decoded ${strings.length} strings`);

    // Step 4: Locate and decode the Property table stream
    const propertyEntry = findStreamByName(cfb, 'Property');
    if (!propertyEntry) {
      console.warn('MSI: Property table stream not found');
      fallbackBinaryScan(data, result);
      return result;
    }

    const properties = decodePropertyTable(propertyEntry.content, strings);
    console.log(`MSI: Extracted ${Object.keys(properties).length} properties:`, properties);

    // Step 5: Map to result object
    result.productCode    = properties['ProductCode']    || '';
    result.productVersion = properties['ProductVersion'] || '';
    result.productName    = properties['ProductName']    || '';
    result.manufacturer   = properties['Manufacturer']   || '';
    result.upgradeCode    = properties['UpgradeCode']    || '';

  } catch (e) {
    console.warn('MSI: Structured parsing failed, falling back to binary scan:', e);
    fallbackBinaryScan(data, result);
  }

  // Fill any remaining empty fields with the binary fallback
  if (!result.productCode || !result.productVersion || !result.productName) {
    fallbackBinaryScan(data, result);
  }

  return result;
}

// ── Binary fallback ───────────────────────────────────────────────────────────

/**
 * Last-resort fallback: scan raw binary for GUID patterns and known property strings.
 * Scans both UTF-8 and UTF-16LE representations.
 * Only fills fields that are still empty — does not overwrite structured results.
 */
function fallbackBinaryScan(data, result) {
  try {
    const utf8  = new TextDecoder('utf-8',    { fatal: false }).decode(data);
    const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(data);
    const guidPattern = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;

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
      const guids = utf16.match(guidPattern) || [];
      if (guids.length >= 1 && !result.productCode) result.productCode = guids[0];
      if (guids.length >= 2 && !result.upgradeCode) result.upgradeCode = guids[1];
    }

    if (!result.productVersion) {
      const vm = utf16.match(/ProductVersion[^\d]{0,20}(\d+\.\d+\.\d+[\.\d]*)/);
      if (vm) {
        result.productVersion = vm[1];
      } else {
        const gvm = utf16.match(/(\d+\.\d+\.\d+[\.\d]*)/);
        if (gvm) result.productVersion = gvm[1];
      }
    }

    if (!result.productName) {
      const pnIdx = utf16.indexOf('ProductName');
      if (pnIdx > -1) {
        const after   = utf16.substring(pnIdx + 11, pnIdx + 200);
        const cleaned = after.replace(/[\x00-\x1f]/g, '').trim();
        if (cleaned.length > 1 && cleaned.length < 100) {
          result.productName = cleaned.split(/[\x00\t\n]/)[0].trim();
        }
      }
    }
  } catch (e) {
    console.warn('MSI: Fallback binary scan failed:', e);
  }
}

