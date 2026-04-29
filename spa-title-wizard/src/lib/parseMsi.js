/**
 * parseMsi.js
 * Extracts metadata from MSI files in the browser using CFB (Compound Binary File) parsing.
 *
 * MSI files are OLE Compound Documents containing a relational database.
 * Key internal structures:
 *   - _StringPool: array of (u16 length, u16 refcount) pairs
 *   - _StringData: all strings concatenated (UTF-8/CP1252)
 *   - Property table: key-value pairs as (string_index, string_index) rows
 *
 * Because MSI stream names use a non-trivial encoding (CJK char mapping),
 * we identify streams by their content characteristics rather than name decoding.
 */
import CFB from 'cfb';

/**
 * Safely convert any CFB entry content to a Uint8Array.
 * CFB can return Buffer, ArrayBuffer, Uint8Array, or plain Array — normalize them all.
 */
function toUint8(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  if (Array.isArray(content)) return new Uint8Array(content);
  // Node Buffer
  if (content && typeof content.buffer === 'object') {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  return new Uint8Array(0);
}

/**
 * Create a DataView over the exact range of a Uint8Array.
 * Avoids the bug where uint8.buffer references a larger backing buffer.
 */
function viewOf(uint8) {
  return new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
}

/**
 * Parse an MSI file and extract common properties.
 * @param {File} file - The MSI File object from a file input
 * @returns {Promise<Object>} - Extracted MSI metadata
 */
export async function parseMsiFile(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  let cfb;
  try {
    cfb = CFB.read(data, { type: 'array' });
  } catch (e) {
    console.error('CFB parse failed:', e);
    return { productCode: '', productVersion: '', productName: '', manufacturer: '', upgradeCode: '', fileName: file.name };
  }

  const result = {
    productCode: '',
    productVersion: '',
    productName: '',
    manufacturer: '',
    upgradeCode: '',
    fileName: file.name,
  };

  try {
    // Step 1: Find _StringData (the entry containing raw strings like "ProductCode")
    const stringDataEntry = findStringData(cfb);
    if (!stringDataEntry) {
      console.warn('MSI: _StringData not found, falling back to binary scan');
      fallbackBinaryScan(data, result);
      return result;
    }

    const stringDataBytes = toUint8(stringDataEntry.content);

    // Step 2: Find _StringPool (its lengths must sum to _StringData's size)
    const stringPoolEntry = findStringPool(cfb, stringDataBytes.length, stringDataEntry);
    if (!stringPoolEntry) {
      console.warn('MSI: _StringPool not found, falling back to binary scan');
      fallbackBinaryScan(data, result);
      return result;
    }

    // Step 3: Decode string pool into an array
    const strings = decodeStringPool(toUint8(stringPoolEntry.content), stringDataBytes);
    console.log(`MSI: Decoded ${strings.length} strings from pool`);

    // Step 4: Find and decode the Property table
    const properties = findAndDecodePropertyTable(cfb, strings);
    console.log(`MSI: Extracted ${Object.keys(properties).length} properties:`, properties);

    // Step 5: Map to result
    result.productCode = properties['ProductCode'] || '';
    result.productVersion = properties['ProductVersion'] || '';
    result.productName = properties['ProductName'] || '';
    result.manufacturer = properties['Manufacturer'] || '';
    result.upgradeCode = properties['UpgradeCode'] || '';
  } catch (e) {
    console.warn('MSI table parsing failed, trying binary fallback:', e);
    fallbackBinaryScan(data, result);
  }

  // If structured parsing missed some fields, try binary scan to fill gaps
  if (!result.productCode || !result.productVersion) {
    console.log('MSI: Filling gaps with binary fallback');
    fallbackBinaryScan(data, result);
  }

  return result;
}

/**
 * Find the _StringData entry by scanning for entries containing known MSI property names.
 * _StringData is a concatenation of all strings; it will contain "ProductCode", "ProductName", etc.
 */
function findStringData(cfb) {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const markerStrings = ['ProductCode', 'ProductName', 'Manufacturer', 'ProductVersion'];

  let bestEntry = null;
  let bestScore = 0;

  for (const entry of cfb.FileIndex) {
    if (!entry.content) continue;
    const bytes = toUint8(entry.content);
    if (bytes.length < 100) continue;
    // Skip very large entries (CAB data, typically > 500KB)
    if (bytes.length > 500000) continue;

    const text = decoder.decode(bytes);
    const score = markerStrings.filter(m => text.includes(m)).length;
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }
  return bestScore >= 2 ? bestEntry : null;
}

/**
 * Find the _StringPool entry by checking which entry's (u16 length) values sum
 * to exactly the _StringData size. This is a definitive identification.
 */
function findStringPool(cfb, stringDataSize, stringDataEntry) {
  for (const entry of cfb.FileIndex) {
    if (!entry.content || entry === stringDataEntry) continue;
    const bytes = toUint8(entry.content);
    if (bytes.length < 8) continue;
    // StringPool has 4-byte header + 4-byte-per-string entries
    if (bytes.length % 4 !== 0) continue;
    // Skip if same size as StringData (they can't be the same entry)
    if (bytes.length === stringDataSize) continue;

    const view = viewOf(bytes);

    let totalLen = 0;
    for (let i = 4; i + 3 < bytes.length; i += 4) {
      totalLen += view.getUint16(i, true);
    }

    if (totalLen === stringDataSize) {
      return entry;
    }
  }
  return null;
}

/**
 * Decode _StringPool + _StringData into an array of strings.
 * Pool format: [codepage:u16, reserved:u16] then repeating [length:u16, refcount:u16].
 * Data format: all strings concatenated (UTF-8 or CP1252).
 */
function decodeStringPool(poolBytes, stringBytes) {
  const pool = viewOf(poolBytes);
  const strings = [''];  // Index 0 is always empty
  const decoder = new TextDecoder('utf-8', { fatal: false });

  let offset = 0;
  for (let i = 4; i + 3 < poolBytes.length; i += 4) {
    const len = pool.getUint16(i, true);
    if (len > 0 && offset + len <= stringBytes.length) {
      strings.push(decoder.decode(stringBytes.slice(offset, offset + len)));
      offset += len;
    } else if (len === 0) {
      strings.push('');
      // offset stays the same for zero-length strings
    } else {
      // len would exceed stringBytes — data is corrupt or we hit the end
      strings.push('');
      offset += len;
    }
  }

  return strings;
}

/**
 * Find the Property table among all CFB entries and decode it.
 *
 * MSI tables store data in COLUMN-MAJOR order: all values for column 1
 * (keys) are stored contiguously, followed by all values for column 2 (values).
 * The Property table has exactly 2 columns of string indices (u16 each).
 *
 * We identify it by brute-force checking which entry yields the most known
 * property names when decoded with this layout.
 */
function findAndDecodePropertyTable(cfb, strings) {
  const knownKeys = new Set([
    'ProductCode', 'ProductVersion', 'ProductName', 'Manufacturer',
    'UpgradeCode', 'ProductLanguage', 'ARPCONTACT', 'ARPHELPLINK',
    'ALLUSERS', 'ARPURLINFOABOUT', 'ARPPRODUCTICON', 'ARPNOREPAIR',
    'ARPNOMODIFY', 'SecureCustomProperties',
  ]);

  let bestMatch = {};
  let bestScore = 0;

  // Try both u16 (most MSIs) and u32 (large MSIs with >65535 strings)
  const indexSizes = strings.length > 0xFFFF ? [4] : [2];

  for (const idxSize of indexSizes) {
    const numCols = 2;

    for (const entry of cfb.FileIndex) {
      if (!entry.content) continue;
      const bytes = toUint8(entry.content);
      if (bytes.length < idxSize * numCols * 2) continue;
      // Must be evenly divisible into 2-column rows
      if (bytes.length % (idxSize * numCols) !== 0) continue;

      const view = viewOf(bytes);
      const numRows = bytes.length / (idxSize * numCols);
      // Skip unreasonable sizes
      if (numRows < 2 || numRows > 5000) continue;

      const colSize = numRows * idxSize;
      const props = {};
      let score = 0;

      for (let r = 0; r < numRows; r++) {
        const keyOffset = r * idxSize;
        const valOffset = colSize + r * idxSize;
        if (valOffset + idxSize > bytes.length) break;

        const keyIdx = idxSize === 4
          ? view.getUint32(keyOffset, true)
          : view.getUint16(keyOffset, true);
        const valIdx = idxSize === 4
          ? view.getUint32(valOffset, true)
          : view.getUint16(valOffset, true);

        if (keyIdx > 0 && keyIdx < strings.length) {
          const key = strings[keyIdx];
          const val = (valIdx > 0 && valIdx < strings.length) ? strings[valIdx] : '';
          if (key && /^[A-Za-z_]/.test(key)) {
            props[key] = val;
            if (knownKeys.has(key)) score++;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = props;
      }
    }
  }

  return bestMatch;
}

/**
 * Fallback: scan raw binary for GUID patterns and known property strings.
 * Uses both UTF-8 and UTF-16LE scans for broader coverage.
 * Only fills fields that are still empty — doesn't overwrite structured parsing results.
 */
function fallbackBinaryScan(data, result) {
  try {
    // Scan UTF-8
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(data);
    // Scan UTF-16LE
    const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(data);

    const guidPattern = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;

    // Try to find GUIDs near known property names for accurate assignment
    for (const text of [utf8, utf16]) {
      if (!result.productCode) {
        const pcMatch = text.match(/ProductCode[^\{]{0,20}(\{[0-9A-Fa-f-]{36}\})/i);
        if (pcMatch) result.productCode = pcMatch[1];
      }
      if (!result.upgradeCode) {
        const ucMatch = text.match(/UpgradeCode[^\{]{0,20}(\{[0-9A-Fa-f-]{36}\})/i);
        if (ucMatch) result.upgradeCode = ucMatch[1];
      }
    }

    // If we still don't have codes, grab the first two GUIDs from UTF-16
    if (!result.productCode || !result.upgradeCode) {
      const guids = utf16.match(guidPattern) || [];
      if (guids.length >= 1 && !result.productCode) result.productCode = guids[0];
      if (guids.length >= 2 && !result.upgradeCode) result.upgradeCode = guids[1];
    }

    // Version: look for semver-like patterns
    if (!result.productVersion) {
      const vm = utf16.match(/ProductVersion[^\d]{0,20}(\d+\.\d+\.\d+[\.\d]*)/);
      if (vm) {
        result.productVersion = vm[1];
      } else {
        // Generic version pattern fallback
        const genericVm = utf16.match(/(\d+\.\d+\.\d+[\.\d]*)/);
        if (genericVm) result.productVersion = genericVm[1];
      }
    }

    // Product name: try to extract from near "ProductName"
    if (!result.productName) {
      // In UTF-16LE, look for chars after ProductName up to a null
      const pnIdx = utf16.indexOf('ProductName');
      if (pnIdx > -1) {
        const after = utf16.substring(pnIdx + 11, pnIdx + 200);
        const cleaned = after.replace(/[\x00-\x1f]/g, '').trim();
        if (cleaned.length > 1 && cleaned.length < 100) {
          result.productName = cleaned.split(/[\x00\t\n]/)[0].trim();
        }
      }
    }
  } catch (e) {
    console.warn('Fallback binary scan failed:', e);
  }
}
