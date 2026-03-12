# Software Packaging Automation (SPA)

A **multi-repo packaging automation platform** that builds, signs, and deploys software titles to:

- **Windows** → Microsoft Intune (via Microsoft Graph API)
- **macOS** → Jamf Pro (via Terraform + Jamf Pro provider)

All pipelines are triggered by a `vX.Y.Z` git tag on a title repo and consume shared, versioned framework components from separate repos.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        titles/<package-id>                              │
│  app.json  │  windows/  │  macos/                                       │
│            │  package.yaml │ package.yaml                               │
│            │  src/         │ src/                                        │
│            │  intune/      │ jamf/                                       │
│                                                                         │
│            .gitlab-ci.yml  ──── includes ──────────────────────────────┐│
└─────────────────────────────────────────────────────────────────────────┘│
                                                                           │
          ┌──────────────────────────────────────────────────────────────┐ │
          │ frameworks/gitlab-ci-templates  (CI orchestration)           │◄┘
          │   metadata-validate  │  windows-build  │  macos-build        │
          │   windows-deploy-intune  │  macos-deploy-jamf                │
          └───────────────┬──────────────────┬────────────────────────────┘
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
          │ schemas/packaging-standards        │
          │  app.schema.json                   │
          │  windows-package.schema.json       │
          │  macos-package.schema.json         │
          └────────────────────────────────────┘
```

---

## Pipeline Flow

Every title pipeline is triggered by pushing a `vX.Y.Z` tag:

```
git tag v134.0.6998.89-1
git push --tags
```

### Stages

| Stage | Job | Platform | Gate |
|-------|-----|----------|------|
| `validate` | `metadata_validate` | Any | Auto |
| `build` | `windows_build` | Windows runner | Auto (if `WINDOWS_ENABLED=true`) |
| `build` | `macos_build` | macOS runner | Auto (if `MACOS_ENABLED=true`) |
| `publish` | `windows_publish_intune` | Windows runner | Auto on tag |
| `deploy` | `macos_deploy_jamf` | macOS runner | Auto on tag |
| `assign` | `windows_assign_intune` | Windows runner | **Manual approval** |

---

## Repo Map

| Repo | Path in workspace | Publishes |
|------|-------------------|-----------|
| `packaging-standards` | `schemas/packaging-standards` | JSON schemas, schema guide |
| `psadt-enterprise` | `frameworks/psadt-enterprise` | Versioned PSADT bundle (.zip) |
| `macos-packaging-framework` | `frameworks/macos-packaging-framework` | Versioned build bundle (.tar.gz) |
| `gitlab-ci-templates` | `frameworks/gitlab-ci-templates` | Reusable CI YAML templates |
| `intune-deployment-modules` | `deployment/intune-deployment-modules` | PowerShell Graph API scripts |
| `terraform-jamf-modules` | `deployment/terraform-jamf-modules` | Terraform modules (Jamf Pro) |
| `titles/google-chrome` | `titles/google-chrome` | Example title (reference implementation) |

---

## Title Repo Structure

Each title repo contains **only** app-specific content:

```
<title-id>/
├── app.json                    # Root metadata (validated against app.schema.json)
├── .gitlab-ci.yml              # includes shared CI templates; sets variables only
├── windows/
│   ├── package.yaml            # Windows build metadata (installer, detection, Intune opts)
│   ├── src/
│   │   ├── Deploy-Application.ps1   # PSADT overlay (app-specific install logic)
│   │   └── Files/              # Installer binaries (not committed; sourced at build time)
│   └── intune/
│       ├── app.json            # Intune display metadata
│       ├── assignments.json    # AAD group IDs and intents
│       ├── requirements.json   # OS/arch requirements
│       └── supersedence.json   # (optional) supersedence relationships
└── macos/
    ├── package.yaml            # macOS build metadata (receipt, bundle_id, scripts)
    ├── src/
    │   ├── Files/              # Installer binaries (not committed; sourced at build time)
    │   └── postinstall.sh      # Custom post-install (optional)
    └── jamf/
        ├── package-inputs.json # Jamf package record metadata
        ├── policy-inputs.json  # Jamf policy configuration
        └── scope-inputs.json   # Jamf smart group IDs
```

---

## Required CI Variables

Set these at the GitLab **group level** (inherited by all title repos):

### Common

| Variable | Description | Protected |
|----------|-------------|-----------|
| `GITLAB_READ_TOKEN` | Token with `read_api` + `read_registry` | Yes |
| `SCHEMAS_PROJECT_ID` | Project ID of `packaging-standards` | No |
| `PSADT_PROJECT_ID` | Project ID of `psadt-enterprise` | No |
| `MACOS_FRAMEWORK_PROJECT_ID` | Project ID of `macos-packaging-framework` | No |
| `INTUNE_MODULES_PROJECT_ID` | Project ID of `intune-deployment-modules` | No |
| `TF_JAMF_MODULES_PROJECT_ID` | Project ID of `terraform-jamf-modules` | No |

### Windows / Intune

| Variable | Description | Protected |
|----------|-------------|-----------|
| `AZURE_TENANT_ID` | Microsoft Entra tenant ID | No |
| `AZURE_CLIENT_ID` | App registration client ID | No |
| `AZURE_CLIENT_SECRET` | App registration client secret | **Yes** |
| `INTUNE_WIN_UTIL_URL` | Download URL for `IntuneWinAppUtil.exe` | No |

### macOS / Jamf

| Variable | Description | Protected |
|----------|-------------|-----------|
| `JAMF_URL` | Jamf Pro base URL | No |
| `JAMF_CLIENT_ID` | Jamf API client ID | No |
| `JAMF_CLIENT_SECRET` | Jamf API client secret | **Yes** |

---

## Tag Convention

Tags follow semver: `vX.Y.Z` where:
- **X** = major architecture or breaking change
- **Y** = minor feature or vendor version bump
- **Z** = patch / re-packaging iteration

Recommended practice for title repos:

```
# New vendor version
git tag v134.0.6998.89 && git push --tags

# Re-packaging without vendor version change (bump packaging_version in package.yaml)
git tag v134.0.6998.89-2 && git push --tags
```

---

## Local Validation

```bash
# Install ajv-cli (Node.js required)
npm install -g ajv-cli

# Validate google-chrome title
ajv validate -s schemas/packaging-standards/schemas/app.schema.json \
             -d titles/google-chrome/app.json

ajv validate -s schemas/packaging-standards/schemas/windows-package.schema.json \
             -d titles/google-chrome/windows/package.yaml

ajv validate -s schemas/packaging-standards/schemas/macos-package.schema.json \
             -d titles/google-chrome/macos/package.yaml

# Validate shell scripts (macOS/Linux)
bash -n frameworks/macos-packaging-framework/versions/1.0.0/build-pkg.sh

# Validate PowerShell syntax
pwsh -Command "
  [System.Management.Automation.Language.Parser]::ParseFile(
    'frameworks/psadt-enterprise/versions/4.1.0/Deploy-Application.ps1',
    [ref]\$null, [ref]\$errors
  )
  if (\$errors) { \$errors | ForEach-Object { Write-Error \$_ } }
  else { Write-Host 'Syntax OK' }
"
```

---

## Splitting into Separate GitLab Repos

This workspace is a monorepo **template**. When ready to deploy, split each top-level folder into its own GitLab project, then:

1. Update the `include: project:` path in each title's `.gitlab-ci.yml`
2. Set `PSADT_PROJECT_ID`, `MACOS_FRAMEWORK_PROJECT_ID`, etc. at the group level
3. Tag `psadt-enterprise` `v4.1.0` and `macos-packaging-framework` `v1.0.0` — the title pipelines will download their bundles from the Package Registry entries created by those tags

---

## See Also

- [`schemas/packaging-standards/docs/schema-guide.md`](schemas/packaging-standards/docs/schema-guide.md) — Schema field reference
- [`frameworks/gitlab-ci-templates/templates/release.yml`](frameworks/gitlab-ci-templates/templates/release.yml) — CI variable reference
- [`deployment/intune-deployment-modules/docs/deployment-overview.md`](deployment/intune-deployment-modules/docs/deployment-overview.md) — Intune module docs
