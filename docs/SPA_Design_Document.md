# Software Packaging Automation (SPA) — Design Document

**Windows (Intune Win32) and macOS (Jamf Pro)**

| Field | Value |
|-------|-------|
| **Date** | May 8, 2026 |
| **Revision** | 2.0 — Updated to reflect implemented architecture |
| **Audience** | EUC Engineering, Platform Engineering, Security, and Operations |
| **Status** | Current |

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Design Principles](#3-design-principles)
4. [Target Architecture](#4-target-architecture)
5. [Repository Architecture (Multi-Repo)](#5-repository-architecture-multi-repo)
6. [Packaging Standards](#6-packaging-standards)
7. [Schema-Driven Validation](#7-schema-driven-validation)
8. [ServiceNow Intake Integration](#8-servicenow-intake-integration)
9. [SPA Packaging Workbench (Title Wizard)](#9-spa-packaging-workbench-title-wizard)
10. [Windows Workflow — Packaging and Intune](#10-windows-workflow--packaging-and-intune)
11. [macOS Workflow — Packaging and Jamf Pro](#11-macos-workflow--packaging-and-jamf-pro)
12. [CI/CD Pipeline Architecture](#12-cicd-pipeline-architecture)
13. [Versioning, Detection, and Markers](#13-versioning-detection-and-markers)
14. [Security, Networking, and Operations](#14-security-networking-and-operations)
15. [Governance and Lifecycle](#15-governance-and-lifecycle)
16. [Appendices](#16-appendices)

---

## 1. Purpose and Scope

This design document defines the architecture, standards, and operating model for automated software packaging across Windows and macOS endpoints. The platform produces enterprise-ready packages and publishes them to deployment catalogs: **Microsoft Intune** for Windows Win32 applications and **Jamf Pro** for macOS.

### In Scope

- **ServiceNow intake integration** — service requests provide baseline title data that feeds into the packaging workbench
- Automated packaging pipelines for Windows (`.intunewin`) and macOS (`.pkg`/`.dmg`)
- Publishing to Intune and Jamf catalogs with assignments and scoping
- Versioning, detection markers, and repeatable packaging standards
- Build workers (Azure VM / VMSS for Windows; macOS build pool)
- Security controls (secrets, signing, least privilege) and operational monitoring
- Web-based packaging workbench (SPA Title Wizard) for interactive title scaffolding
- PSADT v3 → v4 automated migration and lifecycle-as-code
- Schema-driven metadata validation (JSON Schema for all config files)
- Terraform-based Jamf Pro deployment (IaC)

### Out of Scope

- ServiceNow catalog form design, SLA configuration, and ITSM workflow internals
- Vendor procurement, legal review, and software asset management processes
- Endpoint patch ring redesign not required for packaging automation

---

## 2. Goals and Non-Goals

### 2.1 Goals

- **Reduce packaging cycle time** using standard templates, schema validation, and an interactive scaffolding wizard
- **Ensure consistent** install, uninstall, detection, and repair behavior through declarative lifecycle configuration
- **Provide auditable, versioned artifacts** with deterministic builds and clear rollback paths
- **Scale packaging** through ephemeral/pooled workers while maintaining security boundaries
- **Standardize catalog publishing** and ring-based assignment patterns across Intune and Jamf
- **Enable legacy migration** by providing automated PSADT v3 → v4 conversion within the pipeline
- **Infrastructure as Code** for Jamf Pro deployments via Terraform modules

### 2.2 Non-Goals

- Replacing Intune or Jamf Pro as deployment platforms
- Building a bespoke app store beyond endpoint platform capabilities
- Performing vendor security assessments as part of the pipeline

---

## 3. Design Principles

| # | Principle |
|---|-----------|
| 1 | **Infrastructure is ephemeral; artifacts are durable.** Workers are stateless; packages and manifests are versioned and stored. |
| 2 | **Packages are deterministic and reproducible.** Version-pinned tools, frameworks, and templates ensure repeatable builds. |
| 3 | **Separation of duties.** Build, sign, and publish are distinct pipeline stages with controlled handoffs. |
| 4 | **Least privilege.** Identities are scoped to required APIs and environments only. |
| 5 | **Schema-first.** All metadata files are validated against JSON Schemas before any build or publish step executes. |
| 6 | **Standard markers and detection** prevent drift and enable automated compliance reporting. |
| 7 | **Declarative over imperative.** Lifecycle actions are defined in YAML; the pipeline generates executable scripts. |
| 8 | **Multi-repo with version pinning.** Each component is independently versioned and consumed via semantic tags. |

---

## 4. Target Architecture

The solution separates orchestration (CI/CD control plane) from build execution (workers). Pipelines run in GitLab, provision build capacity as needed, execute packaging on dedicated workers, and publish the resulting packages to Intune and Jamf.

### 4.1 Logical Components

| Layer | Component | Responsibilities |
|-------|-----------|-----------------|
| **Intake** | ServiceNow | Service request capture, ASL/DSL routing, governance decisions, packaging request generation |
| **Authoring** | SPA Packaging Workbench | Interactive title scaffolding, pre-populated from ServiceNow data, schema-validated export |
| **Control Plane** | GitLab CI/CD | Pipeline orchestration, approvals, artifacts, logs |
| **Control Plane** | GitLab Package Registry | Stores versioned framework bundles (PSADT zip, macOS tar.gz) |
| **Build Plane (Win)** | Azure VM / VMSS workers | Runs Windows packaging; produces `.intunewin`; performs validation |
| **Build Plane (macOS)** | macOS build pool | Builds/signs/notarizes `.pkg`; performs validation |
| **Publish Plane** | Intune + Microsoft Graph | Win32 app upload/update, assignment, reporting |
| **Publish Plane** | Jamf Pro (via Terraform) | Package upload, policy/scope configuration via IaC |
| **Validation** | JSON Schema (`packaging-standards`) | Validates `app.json`, `package.yaml`, Intune JSON, and lifecycle configs |

### 4.2 High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          titles/<package-id>                                │
│  app.json  │  windows/  │  macos/                                          │
│            │  package.yaml │ package.yaml                                  │
│            │  lifecycle.yaml │ src/                                         │
│            │  src/         │ jamf/                                          │
│            │  intune/      │ detection/                                     │
│                                                                            │
│            .gitlab-ci.yml  ──── includes ──────────────────────────────┐   │
└────────────────────────────────────────────────────────────────────────┘   │
                                                                             │
          ┌───────────────────────────────────────────────────────────────┐  │
          │ frameworks/gitlab-ci-templates  (CI orchestration)            │◄─┘
          │   metadata-validate  │  windows-build  │  macos-build         │
          │   windows-deploy-intune  │  macos-deploy-jamf                 │
          └──────────────┬──────────────────┬─────────────────────────────┘
                         │                  │
           ┌─────────────▼──┐  ┌────────────▼──────────────┐
           │ psadt-enterprise│  │ macos-packaging-framework │
           │ versions/4.1.0/ │  │ versions/1.0.0/           │
           │  Deploy-App.ps1 │  │  build-pkg.sh             │
           └────────┬────────┘  └──────────┬────────────────┘
                    │                       │
         ┌──────────▼────────┐  ┌───────────▼────────────────┐
         │ intune-deployment │  │ terraform-jamf-modules      │
         │ -modules          │  │  modules/package            │
         │  Publish-Win32App │  │  modules/policy             │
         │  Set-Win32Assign  │  │  modules/smart-group        │
         └───────────────────┘  └─────────────────────────────┘
                    │
         ┌──────────▼────────────────────────┐
         │ schemas/packaging-standards       │
         │  app.schema.json                  │
         │  windows-package.schema.json      │
         │  macos-package.schema.json        │
         │  lifecycle.schema.json            │
         └───────────────────────────────────┘
```

### 4.3 End-to-End Flow

1. **Request:** A service request is submitted in ServiceNow (new title or version update). The intake workflow captures software title, version, platform, publisher, and assignment group.
2. **Routing:** ServiceNow checks the Approved Software List (ASL) and Denied Software List (DSL), routes governance decisions, and produces a packaging request output (O-09) with baseline metadata.
3. **Authoring:** The packaging request data is fed into the SPA Packaging Workbench, pre-populating basic fields. A packager enriches the title with installer details, detection rules, lifecycle actions, and deployment config.
4. **Export:** The wizard exports a complete title directory (`app.json`, `package.yaml`, `lifecycle.yaml`, Intune/Jamf configs).
5. **Commit & Tag:** Packager pushes the title to its GitLab project and creates a `vX.Y.Z` tag.
6. **Pipeline:** GitLab CI runs — validates metadata against schemas, downloads framework bundles, builds the package.
7. **Publish:** Pipeline publishes to Intune (via Graph API) or Jamf Pro (via Terraform).
8. **Assign:** For Windows, assignment to Entra ID groups is a manual gate; for macOS, Terraform applies scoping.
9. **Close-loop:** Pipeline status and publish identifiers can be written back to ServiceNow to close the packaging request and update the Software List packaging status.

### 4.4 Environment Tiers

| Tier | Purpose | Promotion |
|------|---------|-----------|
| **DEV** | Packaging development and unit validation; limited scope | Automatic after validation gates |
| **TEST/UAT** | Pilot deployments to test groups; expanded validation | Automatic after build success |
| **PROD** | Approved packages published and assigned via ring-based rollout | Manual approval gate required |

---

## 5. Repository Architecture (Multi-Repo)

The platform uses a **multi-repo design** where each component is independently versioned and published. Title repos consume shared components via GitLab CI `include:` directives and version-pinned downloads.

### 5.1 Repository Map

| Repository | GitLab Path | Publishes | Consumers |
|-----------|-------------|-----------|-----------|
| **packaging-standards** | `spa-schemas/packaging-standards` | JSON schemas, schema guide | All pipelines (validation) |
| **psadt-enterprise** | `spa-frameworks/psadt-enterprise` | Versioned PSADT bundle (`.zip`) | Windows title pipelines |
| **macos-packaging-framework** | `spa-frameworks/macos-packaging-framework` | Versioned build bundle (`.tar.gz`) | macOS title pipelines |
| **gitlab-ci-templates** | `spa-frameworks/gitlab-ci-templates` | Reusable CI YAML templates | Title `.gitlab-ci.yml` |
| **intune-deployment-modules** | `spa-deployment/intune-deployment-modules` | PowerShell Graph API scripts | `windows-deploy-intune.yml` |
| **terraform-jamf-modules** | `spa-deployment/terraform-jamf-modules` | Terraform modules (Jamf Pro) | `macos-deploy-jamf.yml` |
| **spa-title-wizard** | `spa-tools/spa-title-wizard` | Vite/React web app | Packagers (browser-based) |
| **titles/\<name\>** | `software-titles/<category>/<name>` | App-specific packaging content | Pipeline consumers |

### 5.2 Title Categories

Titles are organized under category subgroups in GitLab:

| Category | Examples |
|----------|----------|
| `browsers` | google-chrome, firefox, microsoft-edge |
| `productivity` | microsoft-teams, zoom, adobe-reader |
| `developer-tools` | 7-zip, git-for-windows, vscode |
| `security` | crowdstrike, qualys-agent, sentinel-one |
| `communication` | slack, webex, cisco-jabber |
| `utilities` | forticlient-vpn, citrix-workspace |
| `endpoint-management` | jamf-connect, tanium |
| `custom` | internal/bespoke applications |

### 5.3 Version Pinning Strategy

All shared components use **semantic version tags** (`vX.Y.Z`). Consumer pipelines pin to specific versions:

```yaml
# Title .gitlab-ci.yml
include:
  - project: 'euc/software-package-automation/spa-frameworks/gitlab-ci-templates'
    ref: 'v1.0.0'       # pinned to tagged release
    file:
      - 'templates/windows-build.yml'
      - 'templates/windows-deploy-intune.yml'

variables:
  PSADT_FRAMEWORK_VERSION: "4.1.0"    # matches psadt-enterprise tag
  INTUNE_MODULES_REF: "v1.0.0"       # pin intune-deployment-modules
  TF_JAMF_MODULES_REF: "v1.0.0"      # pin terraform-jamf-modules
```

During testing, all pipelines have `main` branch fallback rules so tags are not required.

---

## 6. Packaging Standards

### 6.1 Title Repo Structure

Each title repo contains **only** app-specific content. Framework files, CI templates, and deployment modules are consumed from their respective repos at build time.

**Windows-only title:**

```
<title-id>/
├── app.json                    # Root metadata (validated against app.schema.json)
├── .gitlab-ci.yml              # Includes shared CI templates; sets variables only
├── .gitignore
└── windows/
    ├── package.yaml            # Windows build metadata (installer, detection, Intune opts)
    ├── lifecycle.yaml           # Declarative PSADT lifecycle (new titles)
    ├── src/
    │   ├── Invoke-AppDeployToolkit.ps1   # PSADT v4 overlay (or generated from lifecycle.yaml)
    │   └── Files/              # Installer binaries (not committed; sourced at build time)
    └── intune/
        ├── app.json            # Intune display metadata
        ├── assignments.json    # Entra ID group assignments
        ├── requirements.json   # OS/arch requirements
        └── supersedence.json   # (optional) supersedence relationships
```

**macOS-only title:**

```
<title-id>/
├── app.json
├── .gitlab-ci.yml
├── .gitignore
└── macos/
    ├── package.yaml            # macOS build metadata
    ├── src/
    │   ├── postinstall.sh
    │   ├── scripts/
    │   │   ├── preinstall
    │   │   └── postinstall
    │   └── Files/              # Installer .pkg binary (not committed)
    ├── jamf/
    │   ├── package-inputs.json # Jamf package record metadata
    │   ├── policy-inputs.json  # Jamf policy configuration
    │   └── scope-inputs.json   # Jamf smart group IDs
    └── detection/
        ├── extension-attribute.sh
        └── receipt-check.sh
```

**Dual-platform (`-Platform both`):** both `windows/` and `macos/` directories are generated.

### 6.2 Metadata Model — `app.json`

The root metadata file drives pipeline behavior and is validated against `app.schema.json`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ | Human-readable software name |
| `publisher` | string | ✅ | Software vendor |
| `package_id` | string | ✅ | Unique kebab-case identifier (`^[a-z0-9][a-z0-9._-]*[a-z0-9]$`) |
| `version` | string | ✅ | Vendor version string |
| `owners.team` | string | | Responsible packaging team |
| `owners.contact_email` | string | | Contact address |
| `lifecycle` | enum | | `active` / `deprecated` / `retired` (retired titles skip build) |
| `platforms.windows.enabled` | boolean | ✅ | Activate Windows build jobs |
| `platforms.windows.framework_version` | string | | Pinned PSADT framework version (e.g. `4.1.0`) |
| `platforms.macos.enabled` | boolean | ✅ | Activate macOS build jobs |
| `platforms.macos.framework_version` | string | | Pinned macOS framework version |
| `deployment.windows` | enum | | `intune` |
| `deployment.macos` | enum | | `jamf` |

### 6.3 Windows Package Metadata — `package.yaml`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | ✅ | Vendor version |
| `packaging_version` | string/int | ✅ | Internal packaging iteration |
| `installer_type` | enum | ✅ | `msi` / `exe` / `msix` / `ps1` |
| `install_command` | string | ✅ | Silent install command |
| `uninstall_command` | string | ✅ | Silent uninstall command |
| `source_filename` | string | | Installer binary filename |
| `detection_method` | enum | | `manual` (uses `detection_rules` array) or `script` |
| `detection_rules` | array | | Array of detection rules (MSI, file, or registry) |
| `detection_mode` | enum | | Legacy: `registry-marker` / `file` / `msi-product-code` / `script` |
| `max_install_time` | integer | | Max minutes before failure (5–1440, default 60) |
| `restart_behavior` | enum | | `basedOnReturnCode` / `allow` / `suppress` / `force` |
| `install_experience` | enum | | `system` / `user` |
| `return_codes` | array | | Custom return code mappings |
| `close_apps` | string | | Comma-separated process names to close |
| `supersedes` | object | | Supersedence configuration |
| `msi_information` | object | | Extracted MSI metadata (product code, version, etc.) |

### 6.4 Lifecycle Configuration — `lifecycle.yaml`

New titles use a **declarative lifecycle model**. The build pipeline reads `lifecycle.yaml` and generates the PSADT `Invoke-AppDeployToolkit.ps1` script automatically.

Supported lifecycle phases: `pre_install`, `install`, `post_install`, `pre_uninstall`, `uninstall`, `post_uninstall`, `pre_repair`, `repair`, `post_repair`.

Supported action types:
- `msi_install`, `exe_install`, `msi_uninstall`, `exe_uninstall`
- `folder_copy`, `folder_remove`
- `registry_marker`, `remove_registry_marker`
- `set_registry_key`, `remove_registry_key`
- `set_env_variable`, `remove_env_variable`
- `show_completion`, `custom_script`

Welcome/pre-phases additionally support: `close_apps`, `check_disk_space`, `allow_defer`, `show_progress`.

---

## 7. Schema-Driven Validation

All metadata files are validated against **JSON Schema (2020-12 draft)** before any build or publish step executes. Schemas are maintained in the `packaging-standards` repository.

### 7.1 Schema Inventory

| Schema | Validates | Used By |
|--------|-----------|---------|
| `app.schema.json` | `app.json` | `windows-build.yml`, `macos-build.yml` |
| `windows-package.schema.json` | `windows/package.yaml` | `windows-build.yml` |
| `macos-package.schema.json` | `macos/package.yaml` | `macos-build.yml` |
| `lifecycle.schema.json` | `windows/lifecycle.yaml` | `windows-build.yml` |
| `intune-app.schema.json` | `windows/intune/app.json` | Wizard export |
| `intune-assignments.schema.json` | `windows/intune/assignments.json` | Wizard export |
| `intune-requirements.schema.json` | `windows/intune/requirements.json` | `windows-build.yml` |
| `intune-supersedence.schema.json` | `windows/intune/supersedence.json` | Wizard export |
| `build-manifest.schema.json` | Build manifest output | Post-build validation |

### 7.2 Pipeline Validation

The build stage downloads schemas from the `packaging-standards` project via the GitLab API and validates using PowerShell's `Test-Json` (Windows) or `ajv-cli` (local validation). Validation failure halts the pipeline before any packaging occurs.

---

## 8. ServiceNow Intake Integration

> **Status:** Planned — this integration is fundamental to the target architecture but has not yet been built. This section documents the design intent and data contract.

ServiceNow is the **intake and request platform** for all software title requests — both new titles and version updates. A ServiceNow service request captures baseline metadata from the requestor and, after passing through governance checks, produces a **packaging request** that feeds directly into the SPA Packaging Workbench. A packager then enriches the request with technical packaging details before the pipeline processes it.

### 8.1 Intake-to-Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          ServiceNow                                          │
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────────────────────┐  │
│  │ Service   │───►│ ASL/DSL  │───►│ Governance│───►│ Packaging Request    │  │
│  │ Request   │    │ Lookup   │    │ Decision  │    │ (O-09)               │  │
│  │ (I-01)    │    │ (D-01/02)│    │ (D-08)    │    │                      │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┬────────────┘  │
│                                                              │               │
└──────────────────────────────────────────────────────────────┼───────────────┘
                                                               │
                                              API / Webhook / Export
                                                               │
                                                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     SPA Packaging Workbench                                   │
│                                                                              │
│  Pre-populated fields:                                                       │
│    • Software Title (displayName)     • Publisher                            │
│    • Version                          • Platform (Windows / macOS / both)    │
│    • Category                         • Assignment Group                     │
│    • ServiceNow RITM / Request ID     • Requestor info                      │
│                                                                              │
│  Packager enriches:                                                          │
│    • Installer details, detection rules, lifecycle actions                   │
│    • Intune / Jamf deployment configuration                                  │
│    • Installer source, MSI metadata, custom scripts                         │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼ Export ZIP → git push → tag → pipeline
┌──────────────────────────────────────────────────────────────────────────────┐
│                        GitLab CI/CD Pipeline                                  │
│  validate → build → publish → assign                                         │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                           Close-loop callback
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          ServiceNow                                          │
│  Update Packaging Status → "In Catalog"                                      │
│  Record Intune App ID / Jamf Policy ID                                       │
│  Close RITM                                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 ServiceNow Request Data (I-01)

The service request captures the minimum required data to route and decide. This is intentionally lightweight — technical packaging details are added by the packager in the Workbench.

| Data ID | Field | Type | Source | Required | Validation |
|---------|-------|------|--------|----------|------------|
| I-01 | Requestor Name | Lookup | Logged-on user | ✅ | Valid user |
| I-01 | Requestor Email | Lookup | Logged-on user | ✅ | Email format |
| I-01 | On Behalf Name | Lookup | ServiceNow | ✅ | Valid user |
| I-01 | On Behalf Email | Lookup | ServiceNow | ✅ | Email format |
| I-01 | Platform | Choice | User | ✅ | Windows / Mac |
| I-01 | Software Title | Lookup | Software List | ✅ | Match friendly name |
| I-01 | Version | Text | User | ✅ | Version string |
| I-01 | Publisher | Text | Software List | | Auto-populated from ASL |
| I-01 | Assignment Group | Reference | User / manager | | Entra ID group or Jamf smart group |
| I-01 | Business Justification | Text | User | | Free text |
| I-01 | Appeal Prior Denial | Choice | User | ✅ | Yes / No |

### 8.3 Governance Routing (Decisions)

ServiceNow routes the request through a series of structured decisions before generating a packaging request:

| Decision | Purpose | Outputs |
|----------|---------|---------|
| **D-01: ASL Lookup** | Check if the title is already on the Approved Software List | O-01: Approved Software Metadata |
| **D-02: DSL Check** | Check if the title is on the Denied Software List | O-02: Denied Metadata / O-03: Net New Packet |
| **D-08: Risk/Legal/Cyber Governance** | Formal risk and compliance review (for net-new titles) | O-04: Deny / O-05: Approve |
| **D-03: License Check** | Determine if a license is required before packaging | O-07: License Approval Evidence |
| **D-05: Packaging Status** | Check if the title is already packaged or in-progress | O-08: Packaging State |
| **D-06: Duplicate Check** | Prevent duplicate packaging work | O-09: Packaging Request |

### 8.4 Packaging Request Payload (O-09)

The packaging request output (O-09) is the data contract between ServiceNow and the SPA Workbench. This payload pre-populates the wizard's initial fields:

```json
{
  "source": "servicenow",
  "ritm_number": "RITM0012345",
  "request_type": "new_title",
  "software_title": "Notepad++",
  "publisher": "Notepad++ Team",
  "version": "8.7.1",
  "platform": "windows",
  "category": "developer-tools",
  "assignment_group": "SG-EUC-DevTools-Pilot",
  "assignment_group_id": "a1b2c3d4-...",
  "requestor": {
    "name": "Jane Doe",
    "email": "jane.doe@company.com"
  },
  "asl_status": "approved",
  "license_required": false,
  "governance_decision": "O-05",
  "packaging_status": "not_started",
  "notes": "Requested for development team standardization"
}
```

### 8.5 Workbench Pre-Population Mapping

When the Workbench receives a ServiceNow payload, fields are mapped to wizard state:

| ServiceNow Field | Wizard Field | Notes |
|-----------------|-------------|-------|
| `software_title` | `displayName` | Also auto-derives `packageId` (kebab-case) |
| `publisher` | `publisher` | |
| `version` | `version` | |
| `platform` | `platform` | Maps to `windows` / `macos` / `both` |
| `category` | `category` | Also auto-maps `jamfCategory` |
| `assignment_group_id` | `assignments[0].groupId` | Pre-fills the first Intune assignment or Jamf scope group |
| `ritm_number` | `appNotes` | Embedded for traceability: "RITM: RITM0012345" |
| `request_type` | `wizardMode` | `new_title` → new / `update` → version bump |

### 8.6 Integration Patterns

The ServiceNow ↔ SPA integration supports multiple delivery patterns (to be selected during implementation):

| Pattern | Mechanism | Pros | Cons |
|---------|-----------|------|------|
| **URL-based deep link** | ServiceNow generates a URL with query parameters; packager clicks to open Workbench with pre-filled data | Simple; no middleware | Data in URL; limited payload size |
| **Webhook → API** | ServiceNow sends a webhook to a lightweight API that stores the request; Workbench fetches by RITM | Decoupled; supports larger payloads | Requires a thin API layer |
| **ServiceNow → GitLab** | ServiceNow creates a GitLab issue or triggers a pipeline with metadata; packager pulls from there | Native GitLab integration | Less interactive for packager |
| **Shared data store** | ServiceNow writes to a shared store (Azure Table, SharePoint List); Workbench reads | Auditable; no direct coupling | Requires shared infrastructure |

> **Recommended:** Start with **URL-based deep link** for simplicity (MVP), then evolve to **Webhook → API** for production scale and close-loop status updates.

### 8.7 Close-Loop Status Updates

After the pipeline completes, status should be written back to ServiceNow to close the loop:

| Event | ServiceNow Update |
|-------|-------------------|
| Pipeline build succeeds | Packaging Status → `Packaged` |
| Intune publish succeeds | Record Intune App ID; Packaging Status → `In Catalog` |
| Jamf deploy succeeds | Record Jamf Policy ID; Packaging Status → `In Catalog` |
| Assignment complete | Close RITM; notify requestor |
| Pipeline failure | Packaging Status → `Failed`; alert packaging team |

### 8.8 Software List as Master Data

The ServiceNow **Approved Software List (ASL)** serves as the authoritative source for software title master data. It is not a byproduct of intake — it is the product catalog.

| Field | Purpose | Key Values | Downstream Impact |
|-------|---------|------------|-------------------|
| Platform | Target OS | Windows, Mac | Pipeline selection |
| Software Title | Identify application | | ASL / DSL lookup |
| Publisher | Vendor identification | | Match confidence |
| Version | Vendor version | | Packaging & detection |
| Status | Approval state | Approved / Denied / Exception | Assignment gating |
| Classification | Processing rules | Open Source / Internal | Legal & APM requirements |
| Licensed | License required | Yes / No | License workflow |
| Packaging Status | Lifecycle state | Not Started / Pending / In Catalog | Routing |
| Risk ID | Governance linkage | External ID | Audit traceability |

---

## 9. SPA Packaging Workbench (Title Wizard)

The **SPA Packaging Workbench** is a browser-based React application (Vite + JSX) that provides an interactive wizard for scaffolding new titles or refactoring existing PSADT packages.

### 9.1 Capabilities

| Feature | Description |
|---------|-------------|
| **New Title** | Step-by-step wizard: Basic Info → Platform → Installer → Detection → PSADT Lifecycle → Intune/Jamf Config → Review & Export |
| **Refactor Existing** | Upload a PSADT `.ps1` script → parse metadata → choose Passthrough or Convert to Lifecycle |
| **MSI Metadata Extraction** | Client-side MSI binary parsing extracts ProductCode, ProductVersion, UpgradeCode, Manufacturer |
| **PSADT v3/v4 Detection** | Parser identifies script version and extracts variables, metadata, and lifecycle actions |
| **Lifecycle Editor** | Visual action editor for all 9 PSADT lifecycle phases with drag-and-drop reordering |
| **Schema-Validated Export** | Generates a downloadable `.zip` containing all title files, validated against JSON schemas |
| **Intune Configuration** | Full Intune Win32 app config: assignments, requirements, supersedence, dependencies, return codes |
| **Jamf Configuration** | Jamf policy, package, scope, self-service, and extension attribute configuration |

### 9.2 Wizard Steps

| Step | ID | Platform | Purpose |
|------|----|----------|---------|
| 1 | `basic` | All | Package ID, display name, publisher, version, category |
| 2 | `platform` | All | Windows, macOS, or both |
| 3 | `installer` | Windows | Installer type, source file, MSI metadata, install/uninstall commands |
| 4 | `detection` | Windows | Detection method (manual rules or custom script), rule builder |
| 5 | `psadt` | Windows | Lifecycle phase editor with typed actions |
| 6 | `intune` | Windows | Intune app metadata, assignments, requirements, supersedence |
| 7 | `macos` | macOS | Bundle ID, receipt ID, Jamf category, scope groups, self-service |
| 8 | `review` | All | File tree preview, generated content review, ZIP download |

> **Note:** In refactor mode, the PSADT Lifecycle step appears before Installer and Detection, since parsed script data pre-populates those fields.

### 9.3 Refactor Workflow

When a packager uploads an existing PSADT script:

1. **Parse:** The client-side parser detects v3 (`Deploy-Application.ps1`) or v4 (`Invoke-AppDeployToolkit.ps1`) and extracts metadata and variables.
2. **Choose Mode:**
   - **Passthrough:** Script is committed as-is; only metadata (display name, version, publisher) is extracted for Intune configuration.
   - **Convert to Lifecycle:** All lifecycle actions are extracted into `lifecycle.yaml` for full editing control; the original script is archived as a `.bak` reference file.
3. **Edit:** Wizard steps are pre-populated with parsed data; packager reviews and adjusts.
4. **Export:** Complete title directory is generated and downloaded.

### 9.4 Technology Stack

| Component | Technology |
|-----------|-----------|
| Framework | React 19 + Vite |
| Styling | Vanilla CSS (dark theme, glassmorphism) |
| State Management | Custom `useWizardState` hook |
| Export | JSZip (client-side ZIP generation) |
| MSI Parsing | Client-side binary parser (`parseMsi.js`) |
| PSADT Parsing | Regex-based parser (`parsePsadt.js`) — supports v3 and v4 |

---

## 10. Windows Workflow — Packaging and Intune

### 10.1 Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: build  (automatic)                                                   │
│   windows_build                                                             │
│     ✓ Validate app.json + windows/package.yaml against JSON Schemas        │
│     ✓ Download & cache PSADT framework bundle (psadt-enterprise zip)       │
│     ✓ Generate Invoke-AppDeployToolkit.ps1 from lifecycle.yaml (if present)│
│     ✓ OR: Convert v3 Deploy-Application.ps1 → v4 (if refactored title)    │
│     ✓ Build staging area (framework + title overlays)                      │
│     ✓ Run IntuneWinAppUtil.exe → produces .intunewin                      │
│     ✓ Write out/build.env (dotenv artifact)                                │
└──────────────────────────── dotenv injection ──────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: publish  (automatic)                                                 │
│   windows_publish_intune                                                    │
│     ✓ Download intune-deployment-modules scripts                           │
│     ✓ Resolve-DetectionRules.ps1 → detection rule objects for Graph API    │
│     ✓ Resolve-Requirements.ps1 → requirement rule objects                  │
│     ✓ Publish-Win32App.ps1 → app created/updated in Intune via Graph      │
│     ✓ Write out/app.env (APP_ID=<guid>)                                    │
└──────────────────────────── dotenv injection ──────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: assign  (▶ MANUAL — operator triggers in GitLab UI)                 │
│   windows_assign_intune                                                     │
│     ✓ Set-Win32Assignments.ps1 → Entra ID groups assigned                  │
│     ✓ Set-Win32Supersedence.ps1 (optional, if supersedence.json exists)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Build Stage Detail

1. **Validate metadata** — `app.json` and `windows/package.yaml` are validated against downloaded JSON Schemas using PowerShell `Test-Json`.
2. **Download PSADT framework** — The versioned bundle is downloaded from the GitLab Package Registry and cached on the runner.
3. **Script generation** — Three paths:
   - **`lifecycle.yaml` present (new titles):** `Build-PsadtFromLifecycle.ps1` generates `Invoke-AppDeployToolkit.ps1` from the declarative config.
   - **`Deploy-Application.ps1` present (refactored v3):** Pipeline installs `PSAppDeployToolkit.Tools`, runs `Test-ADTCompatibility`, then `Convert-ADTDeployment` to produce a v4 script. On success, the v4 script is committed back and the v3 script is removed (one-time graduation).
   - **`Invoke-AppDeployToolkit.ps1` present:** Used directly (passthrough or manually authored v4).
4. **Build staging area** — Framework template → staging directory; title's `.ps1` overlay, `Files/`, `Assets/`, `Config/`, `Strings/` are copied in.
5. **Run IntuneWinAppUtil.exe** — Entry point is `Invoke-AppDeployToolkit.exe`; output is a deterministically-named `.intunewin` file.
6. **Write dotenv** — `out/build.env` contains `INTUNEWIN_PATH`, `VENDOR_VERSION`, `PACKAGE_ID`, `PACKAGING_VERSION`, `INTUNEWIN_SHA256`, etc.

### 10.3 Publish Stage Detail

1. **Download deployment scripts** from `intune-deployment-modules` via GitLab API.
2. **Resolve detection rules** — `Resolve-DetectionRules.ps1` reads `windows/package.yaml` and generates Graph API-compatible detection rule objects. Supports MSI product code, registry, file, and custom script detection.
3. **Resolve requirements** — `Resolve-Requirements.ps1` reads `windows/intune/requirements.json`.
4. **Publish Win32 app** — `Publish-Win32App.ps1` authenticates to Microsoft Graph (`DeviceManagementApps.ReadWrite.All`), creates/updates the Win32 app, uploads the `.intunewin` content, and commits the content version.

### 10.4 Assign Stage Detail

- **Manual gate** — Operator clicks ▶ in GitLab UI to trigger.
- `Set-Win32Assignments.ps1` reads `windows/intune/assignments.json` and assigns the app to Entra ID groups with intent (required/available), filter mode, and notification settings.
- `Set-Win32Supersedence.ps1` (optional) sets supersedence relationships if `supersedence.json` exists.

### 10.5 Data Flow (dotenv artifacts)

```
windows_build
  writes ──► out/build.env
             ├── INTUNEWIN_PATH=out/7-zip_26.00_1.intunewin
             ├── VENDOR_VERSION=26.00
             ├── PACKAGE_ID=7-zip
             └── …
                    │  GitLab dotenv injection
                    ▼
windows_publish_intune
  reads  ──► $env:INTUNEWIN_PATH
  writes ──► out/app.env
             └── APP_ID=<intune-app-guid>
                    │  GitLab dotenv injection
                    ▼
windows_assign_intune
  reads  ──► $env:APP_ID
```

### 10.6 Intune Deployment Modules

| Script | Purpose |
|--------|---------|
| `IntuneDeployment.psm1` | Shared module: YAML parser, Graph auth, helper functions |
| `Publish-Win32App.ps1` | Creates/updates Win32 app in Intune via Graph API |
| `Upload-Win32Content.ps1` | Handles `.intunewin` content upload and encryption |
| `Update-Win32App.ps1` | Updates existing app metadata |
| `Resolve-DetectionRules.ps1` | Translates `package.yaml` detection config → Graph objects |
| `Resolve-Requirements.ps1` | Translates `requirements.json` → Graph requirement objects |
| `Set-Win32Assignments.ps1` | Assigns app to Entra ID groups |
| `Set-Win32Supersedence.ps1` | Configures supersedence relationships |
| `Build-PsadtFromLifecycle.ps1` | Generates PSADT script from `lifecycle.yaml` |
| `Build-DeployApplication.ps1` | PSADT script builder (template engine) |

---

## 11. macOS Workflow — Packaging and Jamf Pro

### 11.1 Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: build  (automatic)                                                   │
│   macos_build                                                               │
│     ✓ Validate app.json + macos/package.yaml                               │
│     ✓ Download macos-packaging-framework bundle                            │
│     ✓ Run build-pkg.sh → produces .pkg in out/                             │
│     ✓ Write out/build.env (PKG_PATH, PKG_FILENAME, PKG_SHA256)            │
└──────────────────────────── dotenv injection ──────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: deploy  (automatic on tag / manual on branch)                       │
│   macos_deploy_jamf                                                         │
│     ✓ Clone terraform-jamf-modules                                         │
│     ✓ Build-JamfTerraform.sh generates Terraform config from jamf/*.json   │
│     ✓ terraform init (GitLab HTTP backend for state)                       │
│     ✓ terraform plan → terraform apply                                     │
│     ✓ Category + Package + Policy created/updated in Jamf Pro              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Jamf Deployment via Terraform

The macOS deploy stage uses the **Jamf Pro Terraform provider** for infrastructure-as-code deployment. The `terraform-jamf-modules` repo provides reusable modules:

| Module | Resource | Purpose |
|--------|----------|---------|
| `category` | `jamfpro_category` | Ensures Jamf category exists |
| `package` | `jamfpro_package` | Uploads `.pkg`/`.dmg` and creates package record |
| `policy` | `jamfpro_policy` | Creates install policy with triggers and frequency |
| `smart-group` | `jamfpro_smart_computer_group` | Scoping for phased rollouts |
| `extension-attribute` | `jamfpro_script` | Version reporting EA |

Terraform state is stored in the **GitLab HTTP backend** (per-project state), enabling stateful management of Jamf resources across pipeline runs.

### 11.3 macOS Package Configuration — `macos/package.yaml`

| Field | Description |
|-------|-------------|
| `vendor_version` | Application version |
| `packaging_version` | Internal iteration counter |
| `source_type` | `pkg`, `dmg`, or `zip` |
| `source_filename` | Installer filename in `src/Files/` |
| `receipt_id` | macOS installer receipt ID |
| `bundle_id` | Application bundle identifier |
| `minimum_os` | Minimum macOS version |
| `architecture` | `universal`, `arm64`, or `x86_64` |
| `jamf_category` | Jamf Pro category name |
| `post_install_script` | Optional post-install script reference |

### 11.4 Jamf Configuration Files

| File | Purpose |
|------|---------|
| `jamf/package-inputs.json` | Package name, category, notes for Terraform |
| `jamf/policy-inputs.json` | Policy name, trigger (recurring_checkin/startup), frequency, self-service |
| `jamf/scope-inputs.json` | Smart group IDs for targeting |
| `detection/extension-attribute.sh` | Jamf EA for version inventory reporting |
| `detection/receipt-check.sh` | Receipt-based detection script |


---

## 12. CI/CD Pipeline Architecture

### 12.1 CI Template Inventory

| Template | Stage | Platform | Purpose |
|----------|-------|----------|---------|
| `metadata-validate.yml` | validate | Any | Schema validation of `app.json` and platform `package.yaml` |
| `windows-build.yml` | build | Windows | PSADT staging, IntuneWinAppUtil packaging |
| `windows-deploy-intune.yml` | publish + assign | Windows | Graph API publish, content upload, group assignment |
| `macos-build.yml` | build | macOS | `.pkg` build via `build-pkg.sh` |
| `macos-deploy-jamf.yml` | deploy | macOS | Terraform-based Jamf deployment |
| `release.yml` | release | Any | Tag-triggered release creation for framework repos |

### 12.2 Pipeline Trigger Rules

| Trigger | Effect |
|---------|--------|
| Push to `main` branch | All stages run (testing mode); assign/deploy are manual |
| Push `vX.Y.Z` tag | Full production pipeline; assign is manual gate |
| `WINDOWS_ENABLED: "true"` | Windows jobs activate |
| `MACOS_ENABLED: "true"` | macOS jobs activate |
| `lifecycle == "retired"` in `app.json` | Build exits gracefully (skip) |

### 12.3 Required CI Variables

Set at the GitLab **group level** (inherited by all title repos):

| Variable | Platform | Protected | Description |
|----------|----------|-----------|-------------|
| `GITLAB_READ_TOKEN` | Both | Yes | `read_api` + `read_registry` scope |
| `GITLAB_RELEASE_TOKEN` | Both | Yes | `api` scope (for release creation) |
| `SCHEMAS_PROJECT_ID` | Both | No | `packaging-standards` project ID |
| `PSADT_PROJECT_ID` | Windows | No | `psadt-enterprise` project ID |
| `INTUNE_MODULES_PROJECT_ID` | Windows | No | `intune-deployment-modules` project ID |
| `AZURE_TENANT_ID` | Windows | No | Microsoft Entra tenant ID |
| `AZURE_CLIENT_ID` | Windows | No | App registration client ID |
| `AZURE_CLIENT_SECRET` | Windows | Yes | App registration client secret |
| `MACOS_FRAMEWORK_PROJECT_ID` | macOS | No | `macos-packaging-framework` project ID |
| `TF_JAMF_MODULES_PROJECT_ID` | macOS | No | `terraform-jamf-modules` project ID |
| `JAMF_URL` | macOS | No | Jamf Pro base URL |
| `JAMF_CLIENT_ID` | macOS | No | Jamf API client ID |
| `JAMF_CLIENT_SECRET` | macOS | Yes | Jamf API client secret |

### 12.4 Runner Configuration

| Runner | Tag | Executor | Requirements |
|--------|-----|----------|-------------|
| **Windows** | `[Windows]` | shell (pwsh) | PowerShell 7.4+, .NET 4.8, IntuneWinAppUtil.exe |
| **macOS** | `[macOS]` | shell | Xcode CLI, Terraform 1.5+ |
| **Linux** | `[Linux]` | Docker (`alpine:3.19`) | Terraform validate, utility jobs |

### 12.5 Framework Bundle Caching

The Windows runner caches the PSADT framework bundle by version using GitLab's CI cache mechanism:

```yaml
cache:
  key: psadt-framework-$PSADT_FRAMEWORK_VERSION
  paths:
    - psadt-framework-$PSADT_FRAMEWORK_VERSION/
  policy: pull-push
```

For **VMSS deployments** (future), Azure Blob Storage will be configured as the shared cache backend.

---

## 13. Versioning, Detection, and Markers

### 13.1 Version Model

Every application package carries two versions:

| Version | Definition | Format | Purpose |
|---------|-----------|--------|---------|
| **Vendor/App Version** (`version.app`) | Vendor's published software version | SemVer-like `MAJOR.MINOR.PATCH` | Identifies the software release |
| **Packaging Release** (`version.release`) | Enterprise packaging iteration | Integer starting at 1 | Allows re-packaging without corrupting update logic |
| **Build/Trace** (optional) | Pipeline/build identifier | Pipeline IID or commit SHA | Audit and reproducibility |

**Display Version:** `{version.app} (r{version.release})` — e.g., `24.09.0 (r3)`

### 13.2 Incrementing Rules

| Scenario | version.app | version.release |
|----------|-------------|-----------------|
| New vendor release | Changes | Reset to `1` |
| Packaging-only change (wrapper, detection, signing, args) | Unchanged | Increment |
| Rebuild with no behavioral change | Unchanged | Unchanged |

### 13.3 Tag Convention

Tags follow: `vX.Y.Z` or `vX.Y.Z-N` where `-N` is the packaging release:

```bash
# New vendor version
git tag v134.0.6998.89 && git push --tags

# Re-packaging without vendor version change
git tag v134.0.6998.89-2 && git push --tags
```

### 13.4 Artifact Naming Standard

```
<package_id>_<version.app>_<version.release>.<ext>
```

Examples: `7-zip_26.00_1.intunewin`, `google-chrome_134.0.6998.89_2.pkg`

### 13.5 Detection and Markers

#### Windows — Registry Marker

| Field | Value |
|-------|-------|
| **Path** | `HKLM\Software\<Company>\Packages\<appId>\` |
| **AppVersion** (string) | Vendor version (`version.app`) |
| **Release** (string/DWORD) | Packaging release (`version.release`) |
| **Optional** | Build, Commit, PipelineId, InstalledOn |

Detection policy: Intune Win32 detection validates marker values for AppVersion and Release. MSI product code/version may serve as an additional signal, but the marker is authoritative.

#### macOS — Plist Marker

| Field | Value |
|-------|-------|
| **Path** | `/Library/Application Support/<Company>/Packages/<appId>.plist` |
| **AppVersion** | Vendor version |
| **Release** | Packaging release |
| **Optional** | Build, Commit, PipelineId, InstalledOn |

A Jamf Extension Attribute reads this plist and reports `AppVersion (rRelease)` for inventory and compliance. Smart Groups and Policy scoping use the EA values as the authoritative detection mechanism.

### 13.6 Detection Methods (Windows)

The platform supports multiple detection strategies, configured in `package.yaml`:

| Method | `detection_method` / `detection_rules.type` | Description |
|--------|----------------------------------------------|-------------|
| **MSI Product Code** | `msi` | Uses MSI ProductCode GUID + version comparison |
| **Registry** | `registry` | Checks specific registry key/value (hive, key_path, value_name, operator) |
| **File** | `file` | Checks file existence, version, size, or modified date |
| **Custom Script** | `script` (`detection_method: script`) | Runs a PowerShell detection script |
| **Registry Marker** | `registry-marker` (legacy `detection_mode`) | Uses the standard SPA registry marker |

---

## 14. Security, Networking, and Operations

### 14.1 Identity and Secrets

- Secrets are stored in GitLab CI/CD protected variables (masked where applicable); never baked into images or repositories.
- Microsoft Graph access uses an **Entra ID App Registration** with `DeviceManagementApps.ReadWrite.All` (application permission).
- Jamf Pro access uses **API Roles and Clients** (OAuth) scoped to: Create/Update/Delete Packages, Policies, Smart Computer Groups, Categories.
- Future: Prefer **short-lived auth** (OIDC federation) and managed identity for worker access to Azure resources.
- All publish operations (Graph API calls, Terraform applies) and secret access events are audited.

### 14.2 Network and Proxy

Workers require outbound access to:
- GitLab instance (API + Package Registry)
- `login.microsoftonline.com` and `graph.microsoft.com` (Intune/Graph)
- Jamf Pro URL
- Artifact repositories

Route egress via corporate proxy/firewall controls; maintain explicit allowlists. Install corporate root/intermediate CAs on workers for TLS inspection.

### 14.3 Observability

- **Centralize logs:** Pipeline logs, worker logs, packaging logs, and publish API responses.
- **Build manifest:** Each build emits a manifest including: inputs, hashes, tool versions, publish identifiers.
- **KPIs:** Cycle time, success rate, rollback rate, failure causes.

### 14.4 Rollback and Recovery

- Maintain prior versions in Intune and Jamf with assignment history.
- Rollback by reverting assignment rings first; only remove content as a secondary step.
- Manual approval gate halts promotions to broad rings.

---

## 15. Governance and Lifecycle

### 15.1 Roles and Responsibilities

| Role | Responsibilities |
|------|-----------------|
| **Packaging Engineer** | Maintains package sources/templates; performs troubleshooting; owns `app.json` accuracy |
| **Platform Engineer** | Maintains VMSS/macOS build pool, images, access, and monitoring |
| **EUC Operations** | Owns rollout rings, communications, and monitoring of deployments |
| **Security** | Approves signing and secret handling; reviews least privilege |
| **Change Management** | Approves production promotions where required |

### 15.2 Promotion Controls

| Transition | Gate | Evidence |
|-----------|------|----------|
| DEV → TEST | Automatic | Schema validation + build success |
| TEST → PROD | Manual approval | Test evidence + rollback plan |

All promotions and assignments are logged with approver identity and timestamp.

### 15.3 Title Lifecycle States

| State | Behavior |
|-------|----------|
| `active` | Full pipeline — build, publish, assign |
| `deprecated` | Pipeline runs with warnings; no new assignments recommended |
| `retired` | Build stage exits gracefully; no packaging occurs |

---

## 16. Appendices

### Appendix A: Intune Detection Script (PowerShell)

Registry marker validation — used as an Intune Win32 custom detection script:

```powershell
# Intune Win32 Detection Script - Registry Marker Validation
# Returns exit code 0 when installed (match), otherwise 1.
$ErrorActionPreference = "Stop"

# --- Configure per app/package ---
$CompanyKeyRoot      = "HKLM:\Software\Company\Packages"
$APP_ID              = "igor.7zip.win64"
$EXPECTED_APP_VERSION = "24.09.0"
$EXPECTED_RELEASE    = "3"
# --------------------------------

try {
    $appKeyPath = Join-Path -Path $CompanyKeyRoot -ChildPath $APP_ID
    if (-not (Test-Path -Path $appKeyPath)) { exit 1 }

    $props = Get-ItemProperty -Path $appKeyPath -ErrorAction Stop
    $installedAppVersion = [string]$props.AppVersion
    $installedRelease    = [string]$props.Release

    if (($installedAppVersion -eq $EXPECTED_APP_VERSION) -and
        ($installedRelease -eq $EXPECTED_RELEASE)) {
        exit 0
    }
    exit 1
}
catch {
    exit 1  # Any exception means "not detected"
}
```

### Appendix B: Jamf Extension Attribute (Bash)

Plist marker reporting — returns `AppVersion (rRelease)` or `Not Installed`:

```bash
#!/bin/bash
# Jamf Extension Attribute - Packaging Marker Reader
COMPANY_DIR="/Library/Application Support/Company/Packages"
APP_ID="google.chrome"  # set per app
PLIST_PATH="${COMPANY_DIR}/${APP_ID}.plist"

if [ ! -f "$PLIST_PATH" ]; then
  echo "<result>Not Installed</result>"
  exit 0
fi

APP_VERSION=$(/usr/bin/defaults read "$PLIST_PATH" AppVersion 2>/dev/null)
RELEASE=$(/usr/bin/defaults read "$PLIST_PATH" Release 2>/dev/null)

if [ -z "$APP_VERSION" ] || [ -z "$RELEASE" ]; then
  echo "<result>Not Installed</result>"
  exit 0
fi

echo "<result>${APP_VERSION} (r${RELEASE})</result>"
exit 0
```

### Appendix C: Build Manifest (Recommended Fields)

| Category | Fields |
|----------|--------|
| **Identity** | AppId, DisplayName, Vendor, Platform |
| **Version** | AppVersion, Release, PackageId, BuildNumber, Git commit SHA |
| **Tooling** | PSADT version, IntuneWinAppUtil version, scripts/modules versions |
| **Integrity** | SHA-256 hashes of installer, wrapper, `.intunewin`/`.pkg` |
| **Publishing** | Intune app ID, content version ID, Jamf package ID, Jamf policy ID |
| **Deployment** | Assignments/scopes applied, environment tier |

### Appendix D: Scaffolding Tools

#### CLI: `New-Title.ps1`

PowerShell script for scaffolding titles from the command line:

```powershell
pwsh -File scripts/New-Title.ps1 `
  -PackageId   "notepad-plus-plus" `
  -DisplayName "Notepad++" `
  -Publisher   "Notepad++ Team" `
  -Version     "8.7.1" `
  -Category    developer-tools `
  -Platform    windows `
  -InstallerType  exe `
  -DetectionMode  registry-marker `
  -GitLabGroup euc/software-package-automation
```

#### Web: SPA Packaging Workbench

Browser-based wizard at `spa-title-wizard/` — run locally with:

```bash
cd spa-title-wizard && npm install && npm run dev
```

### Appendix E: Installer Binary Distribution

Installer binaries (`.msi`, `.pkg`, etc.) **must NOT be committed to git**. Recommended patterns:

| Option | How |
|--------|-----|
| **GitLab Package Registry** | Upload per-title/version via Generic Package API; reference as `source_url:` |
| **S3 / Azure Blob** | Store binaries in a bucket; pass pre-signed URL as CI variable |
| **Shared NAS** | Mount network share on runner; reference by UNC path |
| **CI artifact from upstream pipeline** | Pass artifacts via GitLab downstream trigger |
| **Pre-staged on runner** | Set `WINDOWS_INSTALLER_SOURCE` CI variable to local path |

---

*Document generated from the SPA codebase on May 8, 2026. Supersedes the earlier draft at `docs/Packaging_Automation_Design_Document (1).docx`.*
