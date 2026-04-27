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
 * Parse an MSI file and extract common properties.
 * @param {File} file - The MSI File object from a file input
 * @returns {Promise<Object>} - Extracted MSI metadata
 */
export async function parseMsiFile(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const cfb = CFB.read(data, { type: 'array' });

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

    // Step 2: Find _StringPool (its lengths must sum to _StringData's size)
    const stringPoolEntry = findStringPool(cfb, stringDataEntry.content.length);
    if (!stringPoolEntry) {
      console.warn('MSI: _StringPool not found, falling back to binary scan');
      fallbackBinaryScan(data, result);
      return result;
    }

    // Step 3: Decode string pool into an array
    const strings = decodeStringPool(stringPoolEntry.content, stringDataEntry.content);
    console.log(`MSI: Decoded ${strings.length} strings from pool`);

    // Step 4: Find and decode the Property table
    const properties = findAndDecodePropertyTable(cfb, strings);
    console.log(`MSI: Extracted ${Object.keys(properties).length} properties`);

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

  return result;
}

/**
 * Find the _StringData entry by scanning for entries containing known MSI property names.
 * _StringData is a concatenation of all strings; it will contain "ProductCode", "ProductName", etc.
 */
function findStringData(cfb) {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const markerStrings = ['ProductCode', 'ProductName', 'Manufacturer'];

  for (const entry of cfb.FileIndex) {
    if (!entry.content || entry.content.length < 100) continue;
    // Skip very large entries (CAB data, typically > 500KB)
    if (entry.content.length > 500000) continue;

    const text = decoder.decode(new Uint8Array(entry.content));
    const matches = markerStrings.filter(m => text.includes(m));
    if (matches.length >= 2) {
      return entry;
    }
  }
  return null;
}

/**
 * Find the _StringPool entry by checking which entry's (u16 length) values sum
 * to exactly the _StringData size. This is a definitive identification.
 */
function findStringPool(cfb, stringDataSize) {
  for (const entry of cfb.FileIndex) {
    if (!entry.content || entry.content.length < 8) continue;
    // StringPool has 4-byte header + 4-byte-per-string entries
    if (entry.content.length % 4 !== 0) continue;
    // Skip if same size as StringData (they can't be the same entry)
    if (entry.content.length === stringDataSize) continue;

    const data = new Uint8Array(entry.content);
    const view = new DataView(data.buffer);

    let totalLen = 0;
    for (let i = 4; i + 3 < data.length; i += 4) {
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
function decodeStringPool(poolContent, stringContent) {
  const pool = new DataView(new Uint8Array(poolContent).buffer);
  const strBytes = new Uint8Array(stringContent);
  const strings = [''];  // Index 0 is always empty
  const decoder = new TextDecoder('utf-8', { fatal: false });

  let offset = 0;
  for (let i = 4; i + 3 < poolContent.length; i += 4) {
    const len = pool.getUint16(i, true);
    if (len > 0 && offset + len <= strBytes.length) {
      strings.push(decoder.decode(strBytes.slice(offset, offset + len)));
      offset += len;
    } else {
      strings.push('');
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
    'ALLUSERS', 'ARPURLINFOABOUT',
  ]);

  const wide = strings.length > 0xFFFF;
  const idxSize = wide ? 4 : 2;
  const numCols = 2;

  let bestMatch = {};
  let bestScore = 0;

  for (const entry of cfb.FileIndex) {
    if (!entry.content || entry.content.length < idxSize * numCols) continue;

    const data = new Uint8Array(entry.content);
    const view = new DataView(data.buffer);
    const totalIndices = Math.floor(data.length / idxSize);

    // Column-major: first half = keys, second half = values
    if (totalIndices % numCols !== 0) continue;
    const numRows = totalIndices / numCols;
    const colSize = numRows * idxSize;

    const props = {};
    let score = 0;

    for (let r = 0; r < numRows; r++) {
      const keyOffset = r * idxSize;
      const valOffset = colSize + r * idxSize;
      if (valOffset + idxSize > data.length) break;

      const keyIdx = wide ? view.getUint32(keyOffset, true) : view.getUint16(keyOffset, true);
      const valIdx = wide ? view.getUint32(valOffset, true) : view.getUint16(valOffset, true);

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

  return bestMatch;
}

/**
 * Fallback: scan raw binary for GUID patterns and known strings.
 * Less reliable but catches edge cases where table parsing fails.
 */
function fallbackBinaryScan(data, result) {
  try {
    const decoder = new TextDecoder('utf-16le', { fatal: false });
    const text = decoder.decode(data);

    const guidPattern = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;
    const guids = text.match(guidPattern) || [];
    if (guids.length >= 1 && !result.productCode) result.productCode = guids[0];
    if (guids.length >= 2 && !result.upgradeCode) result.upgradeCode = guids[1];

    if (!result.productVersion) {
      const vm = text.match(/(\d+\.\d+\.\d+[\.\d]*)/);
      if (vm) result.productVersion = vm[1];
    }
  } catch (e) {
    console.warn('Fallback binary scan failed:', e);
  }
}
