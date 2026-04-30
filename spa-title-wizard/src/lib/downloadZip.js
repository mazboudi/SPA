import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Download all files as a ZIP archive
 */
export async function downloadAsZip(files, packageId) {
  const zip = new JSZip();
  const root = zip.folder(packageId);

  for (const [path, content] of Object.entries(files)) {
    if (typeof content === 'string' && content.startsWith('data:')) {
      // Binary file from data URL (e.g. logo upload)
      const base64 = content.split(',')[1];
      root.file(path, base64, { base64: true });
    } else {
      root.file(path, content);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${packageId}.zip`);
}

/**
 * Export files to a folder using the File System Access API
 * Returns false if the API is not supported or user cancels
 */
export async function exportToFolder(files, packageId) {
  if (!('showDirectoryPicker' in window)) {
    return false;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const rootHandle = await dirHandle.getDirectoryHandle(packageId, { create: true });
    const skipped = [];

    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/');
      let current = rootHandle;

      try {
        // Create subdirectories
        for (let i = 0; i < parts.length - 1; i++) {
          current = await current.getDirectoryHandle(parts[i], { create: true });
        }

        // Write file
        const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
        const writable = await fileHandle.createWritable();
        if (typeof content === 'string' && content.startsWith('data:')) {
          const resp = await fetch(content);
          const blob = await resp.blob();
          await writable.write(blob);
        } else {
          await writable.write(content);
        }
        await writable.close();
      } catch (fileErr) {
        // macOS/Chrome may reject dot-files (.gitlab-ci.yml, .gitignore)
        console.warn(`Skipped file: ${path}`, fileErr.message);
        skipped.push(path);
      }
    }

    if (skipped.length > 0) {
      alert(`⚠️ ${skipped.length} file(s) could not be written (browser restriction on dot-files):\n\n${skipped.join('\n')}\n\nUse "Download ZIP" instead to get all files including dot-files.`);
    }

    return true;
  } catch (err) {
    if (err.name === 'AbortError') return false;
    throw err;
  }
}
