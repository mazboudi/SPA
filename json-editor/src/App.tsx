import { useMemo, useState } from 'react';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type FileHandleLike = FileSystemFileHandle | null;

type LoadedFile = {
  id: string;
  name: string;
  sourceText: string;
  json: JsonValue;
  originalJson: JsonValue;
  handle: FileHandleLike;
  indent: string;
  newline: string;
  trailingNewline: boolean;
  parseError?: string;
  dirty: boolean;
};

type FlatEntry = {
  path: string;
  value: JsonValue;
  type: ValueType;
};

type OverlayField = {
  path: string;
  filesPresent: string[];
  valuesByFile: Record<string, JsonValue>;
  types: ValueType[];
  inferredType: ValueType | 'mixed';
  isUniform: boolean;
  distinctValueCount: number;
};

type ApplyMode = 'all-present' | 'all-files-add-missing' | 'selected-files';
type ViewMode = 'common' | 'conflicts' | 'all' | 'changed';

type DraftEdit = {
  rawValue: string;
  parsedValue?: JsonValue;
  error?: string;
  applyMode: ApplyMode;
  selectedFiles: string[];
};

type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object';

declare global {
  interface Window {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle[]>;
  }
}

function detectType(value: JsonValue): ValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'object';
  }
}

function flattenJson(value: JsonValue, basePath = ''): FlatEntry[] {
  const type = detectType(value);

  if (type !== 'object' && type !== 'array') {
    return [{ path: basePath || '$', value, type }];
  }

  const entries: FlatEntry[] = [];

  if (type === 'object') {
    const obj = value as Record<string, JsonValue>;
    const keys = Object.keys(obj);
    if (keys.length === 0 && basePath) {
      entries.push({ path: basePath, value, type });
      return entries;
    }
    for (const key of keys) {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      entries.push(...flattenJson(obj[key], nextPath));
    }
  } else {
    const arr = value as JsonValue[];
    if (arr.length === 0 && basePath) {
      entries.push({ path: basePath, value, type });
      return entries;
    }
    for (let index = 0; index < arr.length; index += 1) {
      const nextPath = `${basePath}[${index}]`;
      entries.push(...flattenJson(arr[index], nextPath));
    }
  }

  return entries;
}

function valueKey(value: JsonValue): string {
  return JSON.stringify(value);
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function parseWithInferredType(rawValue: string, expectedType: ValueType | 'mixed'): { parsedValue?: JsonValue; error?: string } {
  if (expectedType === 'string') {
    return { parsedValue: rawValue };
  }
  if (expectedType === 'number') {
    if (rawValue.trim() === '') return { error: 'Enter a number.' };
    const parsedNumber = Number(rawValue);
    if (Number.isNaN(parsedNumber)) return { error: 'Invalid number.' };
    return { parsedValue: parsedNumber };
  }
  if (expectedType === 'boolean') {
    if (rawValue === 'true') return { parsedValue: true };
    if (rawValue === 'false') return { parsedValue: false };
    return { error: 'Enter true or false.' };
  }
  if (expectedType === 'null') {
    if (rawValue.trim().toLowerCase() === 'null' || rawValue.trim() === '') return { parsedValue: null };
    return { error: 'Enter null.' };
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (expectedType !== 'mixed' && detectType(parsed) !== expectedType) {
      return { error: `Expected ${expectedType}, received ${detectType(parsed)}.` };
    }
    return { parsedValue: parsed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON value.' };
  }
}

function parsePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const regex = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) tokens.push(match[1]);
    else if (match[2] !== undefined) tokens.push(Number(match[2]));
  }
  return tokens;
}

function setValueAtPath(root: JsonValue, path: string, value: JsonValue, createMissing: boolean): JsonValue {
  const cloned = cloneJson(root);
  const tokens = parsePath(path);
  if (tokens.length === 0) return value;

  let current: any = cloned;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];

    if (typeof token === 'number') {
      if (!Array.isArray(current)) return cloned;
      if (current[token] === undefined) {
        if (!createMissing) return cloned;
        current[token] = typeof nextToken === 'number' ? [] : {};
      }
      current = current[token];
    } else {
      if (current === null || typeof current !== 'object' || Array.isArray(current)) return cloned;
      if (!(token in current) || current[token] === undefined) {
        if (!createMissing) return cloned;
        current[token] = typeof nextToken === 'number' ? [] : {};
      }
      current = current[token];
    }
  }

  const lastToken = tokens[tokens.length - 1];
  if (typeof lastToken === 'number') {
    if (!Array.isArray(current)) return cloned;
    if (lastToken > current.length && !createMissing) return cloned;
    current[lastToken] = value;
  } else {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return cloned;
    if (!createMissing && !(lastToken in current)) return cloned;
    current[lastToken] = value;
  }

  return cloned;
}

function detectIndent(text: string): string {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(\s+)\S+/);
    if (match) return match[1].includes('\t') ? '\t' : ' '.repeat(match[1].length);
  }
  return '  ';
}

function detectNewline(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function formatValueForInput(field: OverlayField): string {
  if (!field.isUniform) return '';
  const firstValue = field.valuesByFile[field.filesPresent[0]];
  if (field.inferredType === 'string') return String(firstValue ?? '');
  if (field.inferredType === 'number' || field.inferredType === 'boolean') return String(firstValue);
  if (field.inferredType === 'null') return 'null';
  return JSON.stringify(firstValue, null, 2);
}

async function loadFileObjects(files: Array<{ file: File; handle: FileHandleLike }>): Promise<LoadedFile[]> {
  return Promise.all(
    files.map(async ({ file, handle }, index) => {
      const sourceText = await file.text();
      try {
        const parsed = JSON.parse(sourceText) as JsonValue;
        return {
          id: `${file.name}-${index}-${file.lastModified}`,
          name: file.name,
          sourceText,
          json: parsed,
          originalJson: cloneJson(parsed),
          handle,
          indent: detectIndent(sourceText),
          newline: detectNewline(sourceText),
          trailingNewline: /\r?\n$/.test(sourceText),
          dirty: false,
        } satisfies LoadedFile;
      } catch (error) {
        return {
          id: `${file.name}-${index}-${file.lastModified}`,
          name: file.name,
          sourceText,
          json: {} as JsonValue,
          originalJson: {} as JsonValue,
          handle,
          indent: '  ',
          newline: '\n',
          trailingNewline: true,
          parseError: error instanceof Error ? error.message : 'Invalid JSON file.',
          dirty: false,
        } satisfies LoadedFile;
      }
    }),
  );
}

export default function App() {
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [draftEdits, setDraftEdits] = useState<Record<string, DraftEdit>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('common');
  const [message, setMessage] = useState<string>('');
  const [activeFileIds, setActiveFileIds] = useState<string[]>([]);

  const validFiles = useMemo(() => loadedFiles.filter((file) => !file.parseError), [loadedFiles]);

  const overlayFields = useMemo<OverlayField[]>(() => {
    const byPath = new Map<string, OverlayField>();

    for (const file of validFiles) {
      const flat = flattenJson(file.json);
      for (const entry of flat) {
        const existing = byPath.get(entry.path);
        if (!existing) {
          byPath.set(entry.path, {
            path: entry.path,
            filesPresent: [file.id],
            valuesByFile: { [file.id]: entry.value },
            types: [entry.type],
            inferredType: entry.type,
            isUniform: true,
            distinctValueCount: 1,
          });
        } else {
          existing.filesPresent.push(file.id);
          existing.valuesByFile[file.id] = entry.value;
          existing.types.push(entry.type);
          const distinctTypes = Array.from(new Set(existing.types));
          existing.inferredType = distinctTypes.length === 1 ? distinctTypes[0] : 'mixed';
        }
      }
    }

    const list = Array.from(byPath.values()).map((field) => {
      const distinctValues = new Set(field.filesPresent.map((fileId) => valueKey(field.valuesByFile[fileId])));
      return {
        ...field,
        isUniform: distinctValues.size === 1,
        distinctValueCount: distinctValues.size,
      };
    });

    list.sort((a, b) => a.path.localeCompare(b.path));
    return list;
  }, [validFiles]);

  const filteredFields = useMemo(() => {
    const changedPaths = new Set(Object.keys(draftEdits));
    return overlayFields.filter((field) => {
      if (viewMode === 'common') return field.filesPresent.length > 1;
      if (viewMode === 'conflicts') return field.filesPresent.length > 1 && !field.isUniform;
      if (viewMode === 'changed') return changedPaths.has(field.path);
      return true;
    });
  }, [overlayFields, viewMode, draftEdits]);

  async function openWithPicker() {
    try {
      if (!window.showOpenFilePicker) {
        setMessage('File System Access API is not available. Use the file input fallback.');
        return;
      }
      const handles = await window.showOpenFilePicker({
        multiple: true,
        excludeAcceptAllOption: false,
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      const files = await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
      const loaded = await loadFileObjects(files);
      setLoadedFiles(loaded);
      setActiveFileIds(loaded.filter((file) => !file.parseError).map((file) => file.id));
      setDraftEdits({});
      setMessage(`Loaded ${loaded.length} file(s).`);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Unable to open files.');
    }
  }

  async function onInputFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).map((file) => ({ file, handle: null }));
    const loaded = await loadFileObjects(files);
    setLoadedFiles(loaded);
    setActiveFileIds(loaded.filter((file) => !file.parseError).map((file) => file.id));
    setDraftEdits({});
    setMessage(`Loaded ${loaded.length} file(s) in fallback mode.`);
    event.target.value = '';
  }

  function updateDraft(path: string, field: OverlayField, changes: Partial<DraftEdit>) {
    const current = draftEdits[path] ?? {
      rawValue: formatValueForInput(field),
      applyMode: 'all-present' as ApplyMode,
      selectedFiles: field.filesPresent,
    };
    const next = { ...current, ...changes };
    const validation = parseWithInferredType(next.rawValue, field.inferredType);
    next.parsedValue = validation.parsedValue;
    next.error = validation.error;
    setDraftEdits((prev) => ({ ...prev, [path]: next }));
  }

  function applyDraft(path: string, field: OverlayField) {
    const draft = draftEdits[path];
    if (!draft || draft.error !== undefined || draft.parsedValue === undefined) {
      setMessage(`Cannot apply ${path}. Resolve validation errors first.`);
      return;
    }

    const targets =
      draft.applyMode === 'selected-files'
        ? draft.selectedFiles
        : draft.applyMode === 'all-files-add-missing'
          ? validFiles.map((file) => file.id)
          : field.filesPresent;

    setLoadedFiles((prev) =>
      prev.map((file) => {
        if (file.parseError || !targets.includes(file.id)) return file;
        const createMissing = draft.applyMode === 'all-files-add-missing';
        const nextJson = setValueAtPath(file.json, path, draft.parsedValue as JsonValue, createMissing);
        const changed = JSON.stringify(nextJson) !== JSON.stringify(file.json);
        if (!changed) return file;
        return {
          ...file,
          json: nextJson,
          dirty: true,
        };
      }),
    );

    setMessage(`Applied ${path} to ${targets.length} file(s).`);
  }

  function resetAll() {
    setLoadedFiles((prev) => prev.map((file) => ({ ...file, json: cloneJson(file.originalJson), dirty: false })));
    setDraftEdits({});
    setMessage('Reset all changes.');
  }

  function serializeFile(file: LoadedFile): string {
    const output = JSON.stringify(file.json, null, file.indent);
    return file.trailingNewline ? `${output}${file.newline}` : output;
  }

  async function saveAll() {
    const dirtyFiles = loadedFiles.filter((file) => file.dirty && !file.parseError);
    if (dirtyFiles.length === 0) {
      setMessage('No changed files to save.');
      return;
    }

    const filesWithHandles = dirtyFiles.filter((file) => file.handle);
    const filesWithoutHandles = dirtyFiles.filter((file) => !file.handle);

    try {
      for (const file of filesWithHandles) {
        const writable = await file.handle!.createWritable();
        await writable.write(serializeFile(file));
        await writable.close();
      }
      if (filesWithoutHandles.length > 0) {
        filesWithoutHandles.forEach(downloadFile);
      }
      setLoadedFiles((prev) => prev.map((file) => (file.dirty ? { ...file, dirty: false, originalJson: cloneJson(file.json) } : file)));
      setMessage(
        filesWithoutHandles.length > 0
          ? `Saved ${filesWithHandles.length} file(s) directly and downloaded ${filesWithoutHandles.length} file(s).`
          : `Saved ${filesWithHandles.length} file(s) directly.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save files.');
    }
  }

  function downloadFile(file: LoadedFile) {
    const blob = new Blob([serializeFile(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const fileSummary = useMemo(() => ({
    total: loadedFiles.length,
    valid: validFiles.length,
    errors: loadedFiles.filter((file) => file.parseError).length,
    dirty: loadedFiles.filter((file) => file.dirty).length,
  }), [loadedFiles, validFiles]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>JSON Overlay Editor</h1>
          <p>
            Load multiple JSON files, normalize overlapping fields, bulk edit once, validate by type,
            then save back in place when supported or fall back to downloads.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={openWithPicker}>Open with file picker</button>
          <label className="file-input-label">
            <input type="file" accept=".json,application/json" multiple onChange={onInputFiles} />
            Open with input fallback
          </label>
          <button className="secondary" onClick={saveAll}>Save all</button>
          <button className="secondary" onClick={resetAll}>Reset</button>
        </div>
      </header>

      <section className="summary-bar">
        <div><strong>{fileSummary.total}</strong><span>loaded</span></div>
        <div><strong>{fileSummary.valid}</strong><span>valid</span></div>
        <div><strong>{fileSummary.errors}</strong><span>errors</span></div>
        <div><strong>{fileSummary.dirty}</strong><span>changed</span></div>
        <div className="message">{message}</div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Files</h2>
        </div>
        <div className="file-list">
          {loadedFiles.length === 0 && <div className="empty">No files loaded yet.</div>}
          {loadedFiles.map((file) => (
            <label key={file.id} className={`file-card ${file.parseError ? 'error' : ''}`}>
              <input
                type="checkbox"
                checked={activeFileIds.includes(file.id)}
                onChange={(event) => {
                  setActiveFileIds((prev) =>
                    event.target.checked ? [...prev, file.id] : prev.filter((id) => id !== file.id),
                  );
                }}
                disabled={Boolean(file.parseError)}
              />
              <div>
                <div className="file-name">{file.name}</div>
                <div className="file-meta">
                  {file.parseError ? `Parse error: ${file.parseError}` : file.dirty ? 'Changed' : 'Unchanged'}
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header with-controls">
          <h2>Overlay</h2>
          <div className="segmented">
            {(['common', 'conflicts', 'all', 'changed'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                className={viewMode === mode ? 'active' : ''}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="overlay-table-wrapper">
          <table className="overlay-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Presence</th>
                <th>Current</th>
                <th>Edit once</th>
                <th>Apply</th>
              </tr>
            </thead>
            <tbody>
              {filteredFields.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">No overlay rows match the current view.</td>
                </tr>
              )}
              {filteredFields.map((field) => {
                const draft = draftEdits[field.path] ?? {
                  rawValue: formatValueForInput(field),
                  applyMode: 'all-present' as ApplyMode,
                  selectedFiles: field.filesPresent,
                };

                const targetFilesForDraft =
                  draft.applyMode === 'selected-files'
                    ? draft.selectedFiles
                    : draft.applyMode === 'all-files-add-missing'
                      ? validFiles.map((file) => file.id)
                      : field.filesPresent;

                return (
                  <tr key={field.path}>
                    <td>
                      <div className="path-cell">{field.path}</div>
                      {!field.isUniform && <div className="chip warning">Mixed ({field.distinctValueCount})</div>}
                    </td>
                    <td>{field.inferredType}</td>
                    <td>{field.filesPresent.length} / {validFiles.length}</td>
                    <td>
                      {field.isUniform ? (
                        <pre>{JSON.stringify(field.valuesByFile[field.filesPresent[0]], null, 2)}</pre>
                      ) : (
                        <details>
                          <summary>Inspect per file</summary>
                          <div className="per-file-values">
                            {field.filesPresent.map((fileId) => {
                              const file = validFiles.find((item) => item.id === fileId);
                              if (!file) return null;
                              return (
                                <div key={fileId}>
                                  <strong>{file.name}</strong>
                                  <pre>{JSON.stringify(field.valuesByFile[fileId], null, 2)}</pre>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </td>
                    <td>
                      <textarea
                        value={draft.rawValue}
                        onChange={(event) => updateDraft(field.path, field, { rawValue: event.target.value })}
                        placeholder={field.inferredType === 'string' ? 'Type text' : 'Enter JSON-compatible value'}
                      />
                      {draft.error && <div className="error-text">{draft.error}</div>}
                    </td>
                    <td>
                      <select
                        value={draft.applyMode}
                        onChange={(event) => updateDraft(field.path, field, { applyMode: event.target.value as ApplyMode })}
                      >
                        <option value="all-present">All files where field exists</option>
                        <option value="all-files-add-missing">All files and add missing</option>
                        <option value="selected-files">Only selected files</option>
                      </select>
                      {draft.applyMode === 'selected-files' && (
                        <div className="checkbox-list">
                          {validFiles.map((file) => (
                            <label key={file.id}>
                              <input
                                type="checkbox"
                                checked={draft.selectedFiles.includes(file.id)}
                                onChange={(event) => {
                                  const nextSelected = event.target.checked
                                    ? [...draft.selectedFiles, file.id]
                                    : draft.selectedFiles.filter((id) => id !== file.id);
                                  updateDraft(field.path, field, { selectedFiles: nextSelected });
                                }}
                              />
                              {file.name}
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="action-row">
                        <span className="files-affected">{targetFilesForDraft.length} target file(s)</span>
                        <button onClick={() => applyDraft(field.path, field)} disabled={Boolean(draft.error) || targetFilesForDraft.length === 0}>
                          Apply
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Simplify the UX further</h2>
        </div>
        <ul className="suggestion-list">
          <li>Keep v1 focused on scalar values and explicit JSON entry for arrays or objects.</li>
          <li>Default the table to common fields only so the user is not flooded with one-off fields.</li>
          <li>Add saved field profiles later so only approved paths appear for a given JSON family.</li>
          <li>For array-heavy files, prefer full-array replace in v1 instead of index-aware merge logic.</li>
        </ul>
      </section>
    </div>
  );
}
