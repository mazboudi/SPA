# JSON Overlay Editor

A pure browser React app for bulk editing multiple JSON files.

## What it does

- Opens multiple JSON files through the File System Access API when available.
- Falls back to standard file input when the browser does not support direct file handles.
- Builds a normalized overlay of JSON field paths.
- Lets you edit a shared field once and apply it to multiple files.
- Validates edits against the inferred field type.
- Saves back in place when file handles are available.
- Falls back to file downloads when direct save is not available.

## Recommended browser

Use Chrome or Edge on desktop for the best experience.

## Run locally

```bash
npm install
npm run dev
```

## Current v1 scope

- Strongest for scalar fields and explicit JSON entry for arrays or objects.
- Nested arrays are handled by index paths such as `items[0].name`.
- Save uses the original file's detected indent, newline style, and trailing newline preference.

## Good next steps

- Add JSON Schema upload and AJV validation.
- Add field profiles so only approved editable paths appear.
- Add change preview and per-file diff.
- Add ZIP export for fallback download mode.
