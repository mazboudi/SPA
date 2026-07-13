# SPA Packaging Workbench — User Guide

**Software Packaging Automation (SPA) | Windows & macOS**

| Field | Value |
|-------|-------|
| **Product** | SPA Packaging Workbench (Title Wizard) |
| **Revision** | 1.0 |
| **Audience** | EUC Engineers, Application Packagers |
| **Status** | Current |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Getting Started](#3-getting-started)
4. [Platform Selection](#4-platform-selection)
5. [Sidebar Navigation](#5-sidebar-navigation)
6. [Title Modes](#6-title-modes)
7. [Wizard Stages](#7-wizard-stages)
8. [ServiceNow Queue Integration](#8-servicenow-queue-integration)
9. [Project Picker](#9-project-picker)
10. [GitLab Publishing & Pipeline Control](#10-gitlab-publishing--pipeline-control)
11. [Live Publish Activity Log](#11-live-publish-activity-log)
12. [Pipeline Tracker](#12-pipeline-tracker)
13. [Intune Sync & Push](#13-intune-sync--push)
14. [Settings](#14-settings)
15. [Unsaved Work Protection](#15-unsaved-work-protection)
16. [Validation & Step Gating](#16-validation--step-gating)
17. [Generated File Structure](#17-generated-file-structure)
18. [Appendices](#18-appendices)

---

## 1. Overview

The **SPA Packaging Workbench** (internally called the *Title Wizard*) is a browser-based application that guides engineers through the complete lifecycle of a software packaging project — from ServiceNow intake all the way to a published GitLab tag and a triggered CI/CD pipeline.

It eliminates manual file scaffolding by generating all required configuration files (YAML manifests, PSADT PowerShell scripts, Intune app manifests, Jamf scope definitions) from form inputs, then commits them directly to GitLab over the API or via a local `git push`.

### Key capabilities

| Capability | Description |
|---|---|
| **Multi-platform** | Separate, tailored workflows for Windows (Intune/PSADT) and macOS (Jamf Pro/PKG) |
| **ServiceNow integration** | Live queue of packaging requests; one click pre-fills the entire title |
| **GitLab-native** | Creates projects, commits files, tags releases, and triggers pipelines |
| **PSADT visual builder** | Drag-and-drop lifecycle actions — no PowerShell required |
| **Intune sync** | Read and push metadata to/from a live Intune Win32 app |
| **WinGet lookup** | Auto-resolve installer filename, version, and silent args from a WinGet Package ID |
| **MSI extraction** | Server-side MSI metadata extraction (ProductCode, UpgradeCode, etc.) |
| **Clone & Edit** | Load any existing GitLab project into the workbench; edit or duplicate it |
| **Live activity log** | Real-time step-by-step publish feedback streamed from the server |
| **Schema validation** | Every generated file is validated against JSON Schema before publish |

---

## 2. Architecture

```
Browser (React SPA)
    │
    ├── Vite dev server (port 5173)
    │       └── proxies /api/* → Express backend
    │
    └── Express backend (port 3001)
            ├── /api/queue              ← ServiceNow integration
            ├── /api/publish            ← GitLab commit + tag (blocking)
            ├── /api/publish/stream     ← SSE streaming publish (live feedback)
            ├── /api/projects/check     ← GitLab project existence check
            ├── /api/pipeline/*         ← Pipeline status polling + artifact download
            ├── /api/entra/groups       ← Microsoft Graph API group search
            ├── /api/intune/*           ← Intune Win32 app APIs
            ├── /api/msi-info           ← Server-side MSI metadata extraction
            └── /api/winget/*           ← WinGet manifest lookup
```

The backend holds all secrets (GitLab PAT, Azure credentials) in a `.env` file on the server host. Secrets are never returned to the browser.

---

## 3. Getting Started

### Prerequisites

- Node.js 18+
- A GitLab instance with a Personal Access Token (PAT) with `read_repository`, `write_repository`, and `api` scopes
- *(Optional)* Azure App Registration with `Group.Read.All` and `GroupMember.Read.All` permissions for Intune group lookup

### First-time setup

```bash
cd spa-title-wizard
cp server/.env.example server/.env
# Edit server/.env with your GitLab URL, PAT, and Azure credentials
npm install
npm run dev:full      # starts both Vite (5173) and Express (3001)
```

Open `http://localhost:5173` in your browser.

### Configure Settings before first use

Navigate to **⚙️ Settings** in the sidebar and verify:

1. **GitLab URL** — base URL of your GitLab instance
2. **GitLab Token** — PAT for the service account
3. **Windows Group / macOS Group** — parent GitLab group paths where titles will be created
4. **Azure Tenant / Client / Secret** — required for Intune assignment group search
5. **Entra Group Search Prefixes** — comma-separated prefixes (e.g. `EUC SPA Test,EUC SPA Prod`) used to filter the assignment group picker

> **Important:** All settings are stored in `server/.env` on the machine running the backend. Changes take effect immediately without a server restart (except `PORT`).

---

## 4. Platform Selection

When you first open the workbench (or reset to home), you are presented with a **platform selector**:

| Platform | Packaging Technology | Deployment Target |
|---|---|---|
| **Windows** | PSADT v4 + `.intunewin` | Microsoft Intune Win32 apps |
| **macOS** | PKG or DMG | Jamf Pro package catalog |

Selecting a platform switches the entire workbench into that platform's workflow — the wizard stages, field labels, generated files, and pipeline variables all adapt accordingly. The selected platform persists across browser sessions.

Once a platform is selected you land on the **Platform Landing Page**, which shows quick-action cards for all available modes.

---

## 5. Sidebar Navigation

The sidebar is the primary navigation surface. It collapses to icon-only mode when the toggle is clicked.

```
┌────────────────────────────────┐
│  SPA Workbench  [Windows]      │
│  ─────────────────────────     │
│  🏠  Home                      │
│  ⚙️  Settings                  │
│  ─────────────────────────     │
│  ➕  New Title                  │
│       ├─ Blank                 │
│       ├─ From Queue            │
│       └─ Intune Import         │
│  ✏️  Edit Title                 │
│  📋  Clone Title                │
│  ─────────────────────────     │
│  Stages (when a title is open) │
│       ├─ 📋 Project Info  ✅   │
│       ├─ 📦 Installer     ✅   │
│       ├─ ⚡ PSADT          ✅  │
│       ├─ ☁️  Intune        ⚠️  │
│       └─ 🚀 Review & Export    │
└────────────────────────────────┘
```

### Stage indicators

Each stage in the sidebar shows a real-time validation badge:

| Badge | Meaning |
|---|---|
| ✅ Green check | All required fields for this stage are complete |
| ⚠️ Warning | One or more required fields are missing or invalid |
| *(no badge)* | Stage not yet visited |

Clicking any stage name navigates directly to it. Navigation is **free** — there is no forced linear progression.

---

## 6. Title Modes

The workbench operates in one of five modes. The active mode is shown in an informational banner at the top of the **Project Info** stage.

### 6.1 New Title — Blank

Start from scratch with all fields empty.

**Entry points:** Sidebar → *New Title* → *Blank* | Landing Page → *New Blank Title*

### 6.2 New Title — From Queue

Pre-fills the wizard from a ServiceNow packaging request. Enters **New** mode — all fields can be edited. See [Section 8](#8-servicenow-queue-integration) for details.

**Entry points:** Sidebar → *New Title* → *From Queue* | Landing Page → *New from Queue*

### 6.3 Edit Title

Loads an existing GitLab project into the workbench. **Project Identity fields (Display Name, Package ID, Category) are locked** — only installer, PSADT lifecycle, Intune, and macOS configuration fields can be changed.

**Entry points:** Sidebar → *Edit Title* → [select project from picker]

A banner at the top of Project Info shows:
- The loaded ref (tag or branch, e.g. `🏷️ v134.0` or `📌 main`)
- A staleness warning if a newer tag exists since the loaded ref
- A direct link to the project in GitLab

### 6.4 Clone Title

Copies all configuration from an existing project, then **clears**:
- Package ID (re-derived from Display Name)
- Version
- Installer source path / filename
- All MSI and EXE binary metadata
- Intune linked app ID

Everything else (PSADT lifecycle actions, Intune config tabs, detection rules, macOS settings) is preserved. Ideal for creating a new title in the same application suite.

**Entry points:** Sidebar → *Clone Title* → [select source project from picker]

### 6.5 Intune Import (Windows only)

Imports a live Win32 app from Intune by App ID or display name search. The server fetches all available metadata and pre-populates the workbench fields.

**Entry points:** Sidebar → *New Title* → *Intune Import* | Landing Page → *Intune Import*

---

## 7. Wizard Stages

### 7.1 Stage 1 — Project Info

> 📋 Defines the title's identity — the core fields used across all generated files.

| Field | Required | Locked in Edit | Description |
|---|---|---|---|
| **Display Name** | ✅ | ✅ | Human-readable name, e.g. `Google Chrome` |
| **🔒 Package ID** | ✅ | ✅ | Auto-derived read-only field (kebab-case), e.g. `google-chrome`. Used as GitLab project slug. |
| **Publisher** | ✅ | — | Vendor name, e.g. `Google LLC` |
| **Version** | ✅ | ✅ | Vendor version string, e.g. `134.0.6998.89` |
| **Category** | ✅ | ✅ | Application category — determines GitLab subgroup and Jamf category |

#### Package ID derivation

The Package ID is always automatically derived from the Display Name via kebab-case conversion:
- Lowercased
- Spaces → hyphens
- Special characters stripped
- Leading/trailing hyphens removed

Example: `Google Chrome 64-bit` → `google-chrome-64-bit`

#### Duplicate detection (New mode)

As you type the Display Name, the workbench queries GitLab (600ms debounce). If a project with the derived Package ID already exists, a card appears with two options:

| Option | Action |
|---|---|
| **Load & Edit** | Switches to Edit mode and loads the existing project |
| **Proceed Anyway** | Dismisses the warning and continues in New mode |

In Clone mode, an amber warning card is shown (informational only — no action required beyond changing the Display Name to create a unique title).

---

### 7.2 Stage 2 — Installer (Windows)

> 📦 Define the installer binary and its behavior.

#### WinGet Auto-Resolve

Enter a **WinGet Package ID** (e.g. `Google.Chrome`) and click **Resolve from WinGet**. The server queries the public WinGet package manifest and auto-fills:
- Installer filename
- Silent install arguments
- App version
- MSI Product Code (if MSI type)

#### Installer source path

Provide the **full path to the installer file** on the GitLab runner's file system. The path **must contain `\Files\`** — the workbench copies the entire `Files\` folder (and `SupportFiles\` at the same level) into the PSADT staging directory.

| Example | Type |
|---|---|
| `C:\AppSource\Chrome\Files\setup.msi` | Local MSI |
| `\\server\share\Chrome\Files\ChromeSetup.exe` | Network EXE |

The installer type (MSI or EXE) is auto-detected from the file extension.

#### MSI Info Extraction

For MSI installers, click **Extract MSI Info** (with the local MSI path filled in). The server opens the MSI database and populates:

| Field | MSI Property |
|---|---|
| Product Code | `ProductCode` |
| Upgrade Code | `UpgradeCode` |
| Product Name | `ProductName` |
| Manufacturer | `Manufacturer` |
| Product Version | `ProductVersion` |
| File Name | Installer filename |

#### EXE silent args

For EXE installers, provide silent install and uninstall arguments manually (e.g. `/S`, `/quiet /norestart`).

---

### 7.3 Stage 3 — PSADT Lifecycle (Windows)

> ⚡ Visual builder for PSADT v4 lifecycle scripts — no PowerShell required.

#### The 7-phase model

| Phase | Purpose |
|---|---|
| **Variable Declaration** | Declare custom variables used across all phases |
| **Pre-Install** | Actions before the installer runs: close running processes, show user prompts, pre-clean |
| **Install** | Launch the installer. A system-managed action is pre-populated and cannot be removed |
| **Post-Install** | Post-install tasks: registry writes, service configuration, cleanup |
| **Pre-Uninstall** | Actions before removal: close processes, backup data |
| **Uninstall** | Remove the application |
| **Post-Uninstall** | Post-removal cleanup |

Each phase is displayed as a collapsible card with its action list.

#### Action cards

Each action is rendered as a card showing:
- **Type badge** (e.g. `start_msi_process`, `close_process`)
- **Editable parameters** specific to that action type (file paths, registry keys, GUIDs, timeout values)
- **🟢/🔴 Enable/Disable toggle** — disabled actions are skipped during script generation
- **Delete button** — permanently removes the action from the phase
- **Drag handle** — drag-and-drop to reorder actions within a phase

#### Adding actions

Click **+ Add Action** at the bottom of any phase to open the action picker, organized by category:

| Category | Actions |
|---|---|
| **Process Management** | `close_process`, `start_process` |
| **MSI Operations** | `start_msi_process`, `uninstall_application` |
| **Registry** | `set_registry_key`, `remove_registry_key` |
| **Prompts & Dialogs** | `show_installation_prompt`, `show_balloon_notification` |
| **File Operations** | `copy_file`, `remove_file`, `new_folder` |
| **Custom PowerShell** | Raw PowerShell block (for advanced scenarios) |

#### Script preview

At the top of the PSADT stage, a live preview shows the generated PowerShell that will be written to `Invoke-AppDeployToolkit.ps1`. It updates in real time as you add, edit, or reorder actions.

#### PSADT v3 → v4 migration

When a title is imported from a legacy PSADT v3 script via Intune Import or from a project containing a v3 script, the workbench automatically converts recognized v3 cmdlets to v4 equivalents. Unrecognized blocks are preserved as **raw PowerShell cards** with a caution indicator showing the count of unconverted lines.

---

### 7.4 Stage 4 — Intune Configuration (Windows)

> ☁️ Define all Intune Win32 app metadata, detection, requirements, and assignments.

The Intune stage is organized into tabs:

#### App Info tab

| Field | Required | Description |
|---|---|---|
| **App Name** | ✅ | Display name in the Intune Company Portal |
| **Description** | ✅ | User-facing app description |
| **Publisher** | ✅ | Vendor name |
| **App Version** | — | Synced automatically from Project Info |
| **Category** | — | Synced automatically from Project Info |
| **Information URL** | — | Link to documentation or internal wiki |
| **Privacy URL** | — | Vendor privacy policy URL |
| **Developer** | — | Developer name (often same as Publisher) |
| **Owner** | — | Internal EUC contact or team |
| **Notes** | — | Admin-only comments (not visible to end users) |
| **Featured App** | — | Toggle to feature in Company Portal |

#### Install tab

| Field | Description |
|---|---|
| **Install Command** | Auto-derived from PSADT scaffold configuration (read-only) |
| **Uninstall Command** | Auto-derived from PSADT scaffold configuration (read-only) |
| **Install Context** | System or User context |
| **Reboot Behavior** | How Intune manages reboots after install completes |
| **Max Install Time** | Minutes Intune will wait before marking install as failed |

#### Detection Rules tab

Define one or more rules to tell Intune the application is installed. All rules must pass.

| Rule Type | Parameters |
|---|---|
| **MSI** | Product Code GUID; optional version comparison operator + value |
| **File / Folder** | Folder path; filename; check type (existence, date, version, size) |
| **Registry** | Full key path (including hive); value name; comparison operator + data |
| **PowerShell Script** | Custom detection script that exits 0 = detected, non-zero = not detected |

Multiple detection rules can be added. Click **+ Add Rule** to add more.

#### Requirements tab

Minimum system requirements enforced before Intune attempts installation:

- Minimum OS version
- Disk space (MB)
- Physical memory / RAM (MB)
- Logical processor count
- CPU speed (MHz)
- Custom file-based requirement rules
- Custom registry-based requirement rules
- Custom script-based requirement rules

#### Assignments tab

Configure Intune app distribution:

| Field | Description |
|---|---|
| **Intent** | Locked to **Available** — self-service install from Company Portal |
| **Entra ID Group** | Live group picker — search by prefix defined in Settings (e.g. `EUC SPA Test`). Shows member count after selection. |
| **Allow Available Uninstall** | Enables self-service uninstall from Company Portal |

> **Note:** The group picker performs a real-time Microsoft Graph API call. Azure credentials must be configured in Settings. Groups are sorted alphabetically client-side (Graph API `$orderby` is not supported with prefix filters).

---

### 7.5 Stage 2 — Mac Installer (macOS)

> 📦 Specify the PKG or DMG installer source.

#### Source: Local file

Provide the full absolute path to a `.pkg` or `.dmg` on the machine running the SPA backend server. The server reads the file binary and uploads it to the GitLab commit.

Example: `/Users/packager/Downloads/googlechrome.pkg`

#### Source: SMB Network Share

For installers hosted on a network file share:

| Field | Example |
|---|---|
| **SMB Share URL** | `\\server\AppSource` or `smb://server/AppSource` |
| **Path within share** | `Chrome/134.0/googlechrome.pkg` |

The GitLab pipeline runner mounts the share and copies the file at build time.

#### Installer metadata

| Field | Required | Description |
|---|---|---|
| **Bundle ID** | ✅ | `CFBundleIdentifier` from `Info.plist`, e.g. `com.google.Chrome` |
| **Receipt ID** | — | `pkgutil` receipt identifier. Auto-derived from Bundle ID (lowercased). |
| **PKG Version** | — | Extracted from PKG metadata (informational) |
| **Minimum macOS Version** | ✅ | Minimum OS version requirement (default: `13.0` Ventura) |

---

### 7.6 Stage 3 — macOS Configuration

> 🍎 Configure the Jamf Pro package record and deployment scope.

| Field | Description |
|---|---|
| **Jamf Category** | Category for the package record in Jamf Pro |
| **Package Notes** | Admin notes shown in the Jamf package record. Defaults to `Deployed by SPA pipeline. Do not modify directly in Jamf.` |
| **Reboot required** | Toggle if the package requires a logout or restart |
| **Scope Group IDs** | Comma-separated Jamf smart/static group IDs for deployment scoping |

---

### 7.7 Stage — Review & Export

> 🚀 Preview all generated files, select pipeline action, and publish to GitLab.

#### Generated file tree

The left panel shows a collapsible tree of every file the workbench will commit. Clicking any file opens a **syntax-highlighted code preview**. In Edit mode, changed files show a **diff view** highlighting only modified lines.

#### Publish destination

Displays the GitLab path where files will be committed:

```
gitlab.example.com / euc/software-package-automation/windows / google-chrome
```

#### Pipeline Action selector

Choose what happens after the commit is pushed:

| Action | Behaviour |
|---|---|
| **Commit Only** | Push files and create/update version tag. No pipeline triggered. |
| **Build** | Package the installer (`.intunewin` / `.pkg`). |
| **Publish to Intune** | Build + upload Win32 app to Intune. *(Requires complete Intune config.)* |
| **Assign** | Build + Publish + apply Intune group assignments. |

Options that require incomplete fields are disabled with an explanatory tooltip.

#### Publish button

- **New title:** Creates a new GitLab project → commits all files → creates version tag → optionally triggers pipeline.
- **Edit title:** Syncs local clone → writes updated files → commits → force-updates tag → pushes → optionally triggers pipeline.

After a successful publish the button changes to **✅ Published** and the Pipeline Tracker panel appears (if a pipeline was triggered).

---

## 8. ServiceNow Queue Integration

The queue panel fetches open packaging requests from the ServiceNow API, filtered to the selected platform.

### Features

| Feature | Description |
|---|---|
| **Live search** | Filter by title name or description as you type |
| **Priority filter** | Filter by request priority (Critical, High, Moderate, Low, Planning) |
| **Category filter** | Filter by application category |
| **Platform scoping** | Only requests matching the active platform (Windows/macOS) are shown |
| **Item cards** | Show: title name, vendor, version, priority badge, category, request number |

### Selecting a request

Clicking a queue item pre-fills the wizard with:

- Display Name
- Version
- Publisher
- Category
- ServiceNow priority (stored for audit)

The workbench enters **New** mode with the `_fromQueue` flag set internally. This flag:
- Suppresses the standard GitLab duplicate-exists warning (the title is legitimately new)
- Shows a different badge (`🔒 Package ID seeded from queue`) on the Package ID field

---

## 9. Project Picker

The Project Picker is used for **Edit Title** and **Clone Title** modes. It queries GitLab for all projects in the configured group for the active platform.

### Project card information

Each project card shows:
- **Project name** and full path
- **Latest tag** (version)
- **Last activity date**
- **Description** (if set)

### Features

- **Live search** — filter by name or description as you type
- **Clear button** — clears the search input
- **Result count** — shows filtered vs. total count
- **Loading / error states** — spinner while fetching; error message on failure

### Loading a project

When a project is selected, the workbench:
1. Fetches available tags and the project's latest tag ref
2. Downloads all configuration files from that tag
3. Parses YAML and JSON config into wizard state
4. Switches to Edit or Clone mode
5. Navigates to Stage 1 — Project Info

---

## 10. GitLab Publishing & Pipeline Control

### New title flow

```
Step 1  Validate slug (kebab-case format check)
Step 2  Resolve parent group path → create subgroups if needed
Step 3  Create new GitLab project (private, no auto-README)
Step 4  Build commit actions for all generated files
Step 5  POST initial commit to main branch
Step 6  Set default branch to main
Step 7  Create version tag (e.g. v134.0)
Step 8  Clone project locally (for VS Code access)
Step 9  If pipeline action ≠ none: POST pipeline with SPA_STAGE_LIMIT variable
```

### Edit title flow

```
Step 1  Validate slug
Step 2  Resolve parent group path
Step 3  Find existing project in GitLab
Step 4  Pull / sync the local clone to latest main
Step 5  Write all updated files to the local clone
Step 6  git add -A
Step 7  git commit (skipped if no file changes; tag is still force-updated)
Step 8  git tag -f -a v<version>
Step 9  git push origin main --force
Step 10 git push origin v<version> --force
Step 11 If pipeline action ≠ none: POST pipeline with SPA_STAGE_LIMIT variable
```

### Pipeline variables

The GitLab pipeline receives:

```yaml
SPA_STAGE_LIMIT: build | publish | assign | deploy
```

The CI/CD pipeline uses this variable to determine which stages to execute and which to skip.

---

## 11. Live Publish Activity Log

When you click **Publish to GitLab**, the server streams progress events in real time via **Server-Sent Events (SSE)**. The events are rendered as a terminal-style activity log panel in the UI.

### Example output

```
📋 PUBLISH ACTIVITY                         ⏳ (live)
──────────────────────────────────────────────────────
⏳  Publishing "Google Chrome" → euc/win/...
▸   Resolving GitLab group…
✅  Group resolved: euc/software-package-automation/windows
▸   Checking if project exists in GitLab…
✅  Project exists — updating with tag v134.0
⏳  Syncing local clone…
✅  Local clone up to date
⏳  Writing 18 files to workspace…
✅  18 files written
⏳  Committing changes…
✅  Changes committed
✅  Tag v134.0 created
⏳  Pushing to origin/main…
✅  Pushed to GitLab
✅  Pipeline triggered (#4821)
✅  Published successfully
```

### Status icons

| Icon | Status |
|---|---|
| ⏳ | Current step — in progress |
| ▸ | Pending / informational |
| ✅ | Step completed successfully |
| ⚠️ | Non-fatal warning (operation continued) |
| ❌ | Fatal error (publish stopped) |

The log persists after publish completes so you have a full record. It clears when you click Publish again.

---

## 12. Pipeline Tracker

After a successful publish with a pipeline action other than *Commit Only*, the **Pipeline Tracker** panel appears automatically and begins polling the GitLab API every 8 seconds.

### Panel sections

```
🔵 Running  ● Live

  [build]           [publish]            [assign]
  ✅ package         ⏳ upload-intune      ○ assign-groups
  ✅ sign            ○ notify
```

| Feature | Description |
|---|---|
| **Overall status badge** | Color-coded: pending (grey), running (blue), success (green), failed (red), canceled (amber) |
| **Live indicator** | Pulsing dot shown while actively polling |
| **Jobs by stage** | Pipeline jobs grouped by their CI/CD stage |
| **Per-job status icons** | Created, pending, running, success, failed, canceled, skipped |
| **View log →** | Opens the GitLab job log in a new tab |
| **Download Artifact** | Appears when the `build` job succeeds; downloads the `.intunewin` / `.pkg` artifact as a ZIP |

Polling stops automatically when the pipeline reaches a terminal state (success, failed, canceled, skipped).

### Resume on navigation

If you navigate away from Review & Export and return while a pipeline is still running, the tracker automatically resumes polling from where it left off.

---

## 13. Intune Sync & Push

> Available in **Edit Title** mode when the loaded project has a linked Intune Win32 App ID.

### Sync (read from Intune)

Fetches the current metadata from the live Intune Win32 app and compares it field-by-field against the workbench state. Differences are displayed in a comparison table:

| Column | Description |
|---|---|
| **Field** | Metadata field name |
| **Intune value** | Current value in Intune |
| **Builder value** | Current value in the workbench |

### Push to Intune

Pushes workbench metadata changes directly to the live Intune app via Graph API, without triggering a pipeline rebuild. Useful for description updates, URL changes, or admin notes.

**Fields that can be pushed:**
- App Name, Description, Publisher
- Information URL, Privacy URL
- Developer, Owner, Notes
- Featured App toggle
- Allow Available Uninstall toggle
- Max installation time
- Assignment group changes

> **Caution:** Pushing modifies the **live Intune production app** immediately. A confirmation prompt is shown before any push is executed.

After a successful push, the changes are also committed to GitLab (with a `[skip ci]` commit message) to keep the repository in sync.

---

## 14. Settings

Accessed via **⚙️ Settings** in the sidebar. All settings are read from and written to `server/.env` on the machine running the backend.

### GitLab

| Setting | Sensitive | Description |
|---|---|---|
| **GitLab URL** | No | Base URL of your GitLab instance, e.g. `https://gitlab.example.com` |
| **GitLab Personal Access Token** | ✅ Yes | PAT with `read_repository`, `write_repository`, `api` scopes |
| **GitLab Group (Legacy)** | No | Flat fallback group for testing — used if platform-specific groups are not set |
| **Windows Group** | No | Parent subgroup path for Windows titles, e.g. `euc/software-package-automation/windows` |
| **macOS Group** | No | Parent subgroup path for macOS titles, e.g. `euc/software-package-automation/macos` |

### Intune / Azure

| Setting | Sensitive | Description |
|---|---|---|
| **Azure Tenant ID** | No | Microsoft Entra tenant GUID |
| **Azure Client ID** | No | App Registration client ID |
| **Azure Client Secret** | ✅ Yes | App Registration secret value |
| **Entra Group Search Prefixes** | No | Comma-separated display name prefixes for the assignment group picker, e.g. `EUC SPA Test,EUC SPA Prod` |

### Server

| Setting | Sensitive | Description |
|---|---|---|
| **Server Port** | No | Port the Express backend listens on. Default: `3001`. Requires a server restart to take effect. |

### Sensitive field behaviour

Secrets are displayed as `••••••••` and are never returned to the browser after being saved. Click the **pencil icon** to enter a new value. Click the **✓ check** to save or **✗ cancel** to discard.

---

## 15. Unsaved Work Protection

The workbench tracks a dirty flag that is set whenever a field is edited and cleared when:
- A publish completes successfully
- You navigate into a picker view (Edit Title / Clone Title)

If you attempt to navigate away with unsaved changes, a **confirmation dialog** is shown:

> *You have unsaved changes. If you continue, your current progress will be lost.*

| Button | Effect |
|---|---|
| **Continue** | Discard changes and proceed |
| **Cancel** | Dismiss dialog and stay on the current title |

> **Note:** The warning fires **only once per navigation action**. Navigating to a project picker IS the acknowledgment — selecting a project from within the picker will not trigger a second warning.

---

## 16. Validation & Step Gating

### Field-level validation

Required fields are validated in real time. Invalid fields display:
- A red border on the input
- An inline error message below the field

### Stage-level validation

Each stage in the sidebar shows a ✅ or ⚠️ badge based on whether all required fields for that stage are complete.

### Publish gating

| Condition | Effect on Publish |
|---|---|
| One or more required fields missing (any stage) | Publish button disabled; "Required fields are missing" message shown |
| Intune-specific fields missing (App Name, Description, Publisher, Detection Rules) | Build / Publish / Assign pipeline options disabled; *Commit Only* remains available |
| All fields valid | All pipeline action options unlocked |

### Free navigation

The wizard **does not enforce sequential stage completion**. You can jump to any stage at any time — partial completion is allowed. The validation gating only applies to the final publish action.

---

## 17. Generated File Structure

### Windows title

```
windows/
├── src/
│   ├── Files/                            ← Installer binary (from runner path)
│   ├── SupportFiles/                     ← Supporting files (optional, same level as Files)
│   └── Invoke-AppDeployToolkit.ps1       ← Generated PSADT v4 script
├── config/
│   └── app-config.yaml                   ← Application metadata + lifecycle phase config
├── intune/
│   ├── app-manifest.json                 ← Intune Win32 app definition (Win32LobApp)
│   ├── detection-rules.json              ← Detection rule set
│   └── requirement-rules.json            ← Requirement rule set
└── .gitlab-ci.yml                        ← Includes the SPA pipeline template via ref
```

### macOS title

```
macos/
├── src/
│   └── Files/
│       └── installer.pkg                 ← Uploaded installer binary (or reference path)
├── config/
│   └── app-config.yaml                   ← macOS packaging configuration
├── jamf/
│   ├── package-manifest.json             ← Jamf package record definition
│   └── scope-inputs.json                 ← Jamf group IDs for deployment scoping
└── .gitlab-ci.yml
```

---

## 18. Appendices

### Appendix A — Full Wizard State Flow

```
Home / Platform Selector
         │
         ▼
Platform Landing Page
         │
    ┌────┴─────────────────────────────────────────────┐
    │                                                  │
New Title                                    Edit / Clone Title
    │                                                  │
    ├── Blank                                    Project Picker
    ├── From Queue  ──── (pre-fills) ────►              │
    └── Intune Import                           ────────┘
         │                                        │
         └──────────────────────────────────────►Stage 1: Project Info
                                                          │
                                                 Stage 2: Installer / Mac Installer
                                                          │
                                                 Stage 3: PSADT / macOS Config
                                                          │
                                                 Stage 4: Intune Config (Windows only)
                                                          │
                                                 Stage 5: Review & Export
                                                          │
                                             ┌────────────┴────────────┐
                                             │                         │
                                      GitLab Publish            Local File Export
                                             │
                                      ┌──────┴──────┐
                                      │             │
                               New Project    Update Existing
                                      │             │
                               Tag Created    Tag Force-Updated
                                      │             │
                                      └──────┬──────┘
                                             │
                                      Pipeline Triggered
                                             │
                                      Pipeline Tracker
                                      (polling every 8s)
```

### Appendix B — Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| Assignment groups not appearing in picker | Azure credentials missing or expired | Verify Tenant ID, Client ID, and Client Secret in Settings |
| Publish fails with HTTP 401 | GitLab PAT expired or missing `api` scope | Regenerate PAT with correct scopes; update in Settings |
| Publish fails with HTTP 403 | Service account lacks `Developer` or `Maintainer` role on the parent group | Add the service account to the GitLab group with at least Developer access |
| MSI extraction returns empty metadata | MSI file path not accessible from the server process user | Run the server as a user with read access to the installer path |
| "Sorting not supported" Graph API error | `$orderby` incompatible with `startswith` filter | This is handled automatically — group results are sorted alphabetically client-side |
| Clone title starts with blank Package ID | Display Name was empty when clone loaded | Edit the Display Name field; the Package ID will re-derive automatically |
| Pipeline tracker shows no jobs | Pipeline was just triggered; jobs haven't registered yet | Wait one polling cycle (8 seconds); jobs will appear |
| Build artifacts not downloadable | Build job failed or produced no artifacts | Click **View log →** to inspect the job log |
| Local clone fails on first publish of new title | Git executable not on PATH for the server process | Ensure `git` is installed and accessible by the node process |
| Intune Push greyed out | No linked Intune App ID on the loaded project | The loaded GitLab project must have `intuneAppId` set in its `app-config.yaml` |
