/**
 * parseMsi.js
 * Extracts metadata from MSI files in the browser using CFB (Compound Binary File) parsing.
 * MSI files are OLE Compound Documents containing database tables with properties.
 */
import CFB from 'cfb';

/**
 * Parse an MSI file and extract common properties.
 * @param {File} file - The MSI File object from a file input
 * @returns {Promise<Object>} - Extracted MSI metadata
 */
export async function parseMsiFile(file) {
  const buffer = await file.arrayBuffer();
  const cfb = CFB.read(new Uint8Array(buffer), { type: 'array' });

  const result = {
    productCode: '',
    productVersion: '',
    productName: '',
    manufacturer: '',
    upgradeCode: '',
    fileName: file.name,
  };

  // MSI stores data in internal streams. The property table key/values
  // are sometimes found in string pool + tables, but a reliable fallback
  // is scanning the binary for common property patterns.
  try {
    // Attempt to find properties from the raw binary
    const text = extractStringsFromBuffer(buffer);

    // Product Code: {GUID} pattern
    const guidPattern = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;
    const guids = text.match(guidPattern) || [];

    // The first GUID is typically ProductCode, second is UpgradeCode
    if (guids.length >= 1) result.productCode = guids[0];
    if (guids.length >= 2) result.upgradeCode = guids[1];

    // Try to extract version strings (x.x.x pattern near "ProductVersion")
    const versionMatch = text.match(/ProductVersion[^\d]*(\d+\.\d+[\.\d]*)/i);
    if (versionMatch) result.productVersion = versionMatch[1];

    // Try to find ProductName
    const nameMatch = text.match(/ProductName[^\w]*([A-Za-z][A-Za-z0-9\s\-\.]+)/i);
    if (nameMatch) result.productName = nameMatch[1].trim();

    // Try to find Manufacturer
    const mfgMatch = text.match(/Manufacturer[^\w]*([A-Za-z][A-Za-z0-9\s\-\.,]+)/i);
    if (mfgMatch) result.manufacturer = mfgMatch[1].trim();

    // Also try to read from CFB entries directly
    const entries = cfb.FileIndex || [];
    for (const entry of entries) {
      if (entry.name && entry.content) {
        const entryText = extractStringsFromArrayBuffer(entry.content);
        // Look for property-like strings in table entries
        const entryGuids = entryText.match(guidPattern) || [];
        if (entryGuids.length > 0 && !result.productCode) {
          result.productCode = entryGuids[0];
        }
      }
    }
  } catch (e) {
    console.warn('MSI property extraction error (non-fatal):', e);
  }

  return result;
}

/**
 * Extract readable strings from an ArrayBuffer.
 * Handles both ASCII and UTF-16LE (common in MSI files).
 */
function extractStringsFromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let result = '';

  // UTF-16LE extraction (MSI files use UTF-16LE)
  try {
    const decoder = new TextDecoder('utf-16le', { fatal: false });
    result += decoder.decode(bytes);
  } catch (e) {
    // fallback
  }

  // ASCII fallback
  try {
    const ascii = new TextDecoder('ascii', { fatal: false });
    result += ' ' + ascii.decode(bytes);
  } catch (e) {
    // fallback
  }

  return result;
}

function extractStringsFromArrayBuffer(content) {
  if (!content || content.length === 0) return '';
  try {
    const decoder = new TextDecoder('utf-16le', { fatal: false });
    return decoder.decode(content);
  } catch {
    return '';
  }
}
