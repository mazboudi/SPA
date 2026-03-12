# SPA — GitLab Integration Guide

Step-by-step instructions for taking this workspace and wiring it into real GitLab repositories, configuring runners, and running the first end-to-end pipeline.

---

## 1. Prerequisites

| Tool | Min version | Required on |
|------|------------|-------------|
| GitLab (self-managed or SaaS) | 16.x+ | — |
| GitLab Runner | 16.x+ | All runners |
| PowerShell (pwsh) | 7.4+ | Windows runner |
| .NET Framework 4.8 | — | Windows runner |
| macOS 12+ | — | macOS runner |
| Terraform | 1.5+ | macOS runner OR use `hashicorp/terraform` Docker image |
| Python 3 | 3.9+ | macOS runner (standard on macOS 12+) |
| `pkgbuild`, `productbuild` | — | macOS runner (standard on macOS Xcode CLT) |

---

## 2. Create GitLab Group & Projects

Create a top-level GitLab **group**, e.g. `euc-packaging`, then create these projects under it:

```
euc-packaging/
  schemas/packaging-standards
  frameworks/psadt-enterprise
  frameworks/macos-packaging-framework
  frameworks/gitlab-ci-templates
  deployment/intune-deployment-modules
  deployment/terraform-jamf-modules
  titles/google-chrome          ← (repeat for every title)
```

> **Tip:** Use the GitLab UI, API, or Terraform (`gitlablabs/gitlab` provider) to bulk-create the projects.

---

## 3. Push Each Repo Folder

From your local workspace, push each folder as its own git repo:

```bash
SPA_DIR="/Users/wissammazboudi/Documents/workspace/gravity/SPA"
GITLAB_BASE="https://gitlab.example.com/euc-packaging"

declare -A REPOS=(
  ["schemas/packaging-standards"]="schemas/packaging-standards"
  ["frameworks/psadt-enterprise"]="frameworks/psadt-enterprise"
  ["frameworks/macos-packaging-framework"]="frameworks/macos-packaging-framework"
  ["frameworks/gitlab-ci-templates"]="frameworks/gitlab-ci-templates"
  ["deployment/intune-deployment-modules"]="deployment/intune-deployment-modules"
  ["deployment/terraform-jamf-modules"]="deployment/terraform-jamf-modules"
  ["titles/google-chrome"]="titles/google-chrome"
)

for local_path in "${!REPOS[@]}"; do
  remote_path="${REPOS[$local_path]}"
  echo "Pushing $local_path -> $GITLAB_BASE/$remote_path"
  cd "$SPA_DIR/$local_path"
  git init -b main
  git add -A
  git commit -m "chore: initial commit"
  git remote add origin "$GITLAB_BASE/$remote_path.git"
  git push -u origin main
  cd "$SPA_DIR"
done
```

---

## 4. Configure GitLab Runners

### Windows Runner (PSADT builds + Intune deployment)

```powershell
# On the Windows runner machine
gitlab-runner register `
  --url https://gitlab.example.com `
  --token <RUNNER_TOKEN> `
  --executor shell `
  --shell pwsh `
  --tag-list Windows `
  --description "SPA Windows Build Runner"
```

**Runner machine requirements:**
- PowerShell 7.4+ (`winget install Microsoft.PowerShell`)
- .NET 4.8 (PSADT runtime dependency)
- Execution policy: `Set-ExecutionPolicy -Scope MachinePolicy -ExecutionPolicy RemoteSigned -Force`
- Windows Defender exclusions on the runner builds directory and `%TEMP%\psadt_stage_*`
- Outbound network: `login.microsoftonline.com`, `graph.microsoft.com`, GitLab instance

#### VMSS — Future Configuration (not yet enabled)

When you move to VMSS, add the following to `config.toml` in the VMSS base image.
This enables Azure Blob Storage as a shared cache backend so the framework bundle
is shared across all VMSS instances rather than re-downloaded per node.

<!--
  Enable when Azure Blob Storage account and VMSS are ready.

  [[runners]]
    [runners.cache]
      Type = "azure"
      Shared = true
      [runners.cache.azure]
        AccountName   = "yourstorageaccount"
        AccountKey    = "<storage-account-key-or-SAS>"
        ContainerName = "gitlab-runner-cache"
-->

### macOS Runner (.pkg builds + Jamf deployment)

```bash
gitlab-runner register \
  --url https://gitlab.example.com \
  --token <RUNNER_TOKEN> \
  --executor shell \
  --tag-list macOS \
  --description "SPA macOS Build Runner"
```

**Runner machine requirements:**
- Xcode Command Line Tools (`xcode-select --install`)
- Terraform 1.5+ (`brew install terraform`)
- Optional: `yq` (`brew install yq`)
- Network access to Jamf Pro URL and GitLab API

### Linux Runner (Terraform validate, utility jobs)

```bash
gitlab-runner register \
  --url https://gitlab.example.com \
  --token <RUNNER_TOKEN> \
  --executor docker \
  --docker-image alpine:3.19 \
  --tag-list Linux \
  --description "SPA Linux Utility Runner"
```

---

## 5. Collect GitLab Project IDs

After creating the projects, get their numeric IDs:

```bash
curl --header "PRIVATE-TOKEN: <token>" \
  "https://gitlab.example.com/api/v4/projects/euc-packaging%2Fframeworks%2Fpsadt-enterprise" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
```

| Variable | Project |
|----------|---------|
| `PSADT_PROJECT_ID` | `euc-packaging/frameworks/psadt-enterprise` |
| `MACOS_FRAMEWORK_PROJECT_ID` | `euc-packaging/frameworks/macos-packaging-framework` |
| `INTUNE_MODULES_PROJECT_ID` | `euc-packaging/deployment/intune-deployment-modules` |
| `TF_JAMF_MODULES_PROJECT_ID` | `euc-packaging/deployment/terraform-jamf-modules` |
| `SCHEMAS_PROJECT_ID` | `euc-packaging/schemas/packaging-standards` |

---

## 6. Create the App Registration (Intune)

In Microsoft Entra:

1. **App registrations → New registration** — name: `SPA-IntuneAutomation`
2. **API permissions → Add → Microsoft Graph → Application:**
   - `DeviceManagementApps.ReadWrite.All`
3. **Grant admin consent**
4. **Certificates & secrets → New client secret** — copy value immediately
5. Note the **Application (client) ID** and **Directory (tenant) ID**

---

## 7. Create the Jamf Pro API Client

In Jamf Pro **Settings → API Roles and Clients:**

1. **New Role:** `SPA Pipeline`  
   Privileges: Create/Update/Delete Packages, Policies, Smart Computer Groups, Categories
2. **New API Client** → assign role → copy Client ID and Secret

---

## 8. Set GitLab Group-Level CI Variables

In **`euc-packaging` group → Settings → CI/CD → Variables:**

| Variable | Protected | Masked |
|----------|-----------|--------|
| `GITLAB_RELEASE_TOKEN` (api scope) | ✅ | ✅ |
| `GITLAB_READ_TOKEN` (read_api + read_registry) | ✅ | ✅ |
| `PSADT_PROJECT_ID` | ❌ | ❌ |
| `MACOS_FRAMEWORK_PROJECT_ID` | ❌ | ❌ |
| `INTUNE_MODULES_PROJECT_ID` | ❌ | ❌ |
| `TF_JAMF_MODULES_PROJECT_ID` | ❌ | ❌ |
| `SCHEMAS_PROJECT_ID` | ❌ | ❌ |
| `SCHEMA_VERSION` (`main` or tag) | ❌ | ❌ |
| `AZURE_TENANT_ID` | ❌ | ❌ |
| `AZURE_CLIENT_ID` | ❌ | ❌ |
| `AZURE_CLIENT_SECRET` | ✅ | ✅ |

| `JAMF_URL` | ❌ | ❌ |
| `JAMF_CLIENT_ID` | ❌ | ❌ |
| `JAMF_CLIENT_SECRET` | ✅ | ✅ |

> Protected variables require **protected tags**. Add `v*` as a protected tag pattern in every project's **Settings → Repository → Protected tags**.

---

## 9. Initial Publish Sequence

**Order matters** — frameworks must be published before titles can consume them.

### Step 1 — Publish `psadt-enterprise`

```bash
cd frameworks/psadt-enterprise
git tag v4.1.0 && git push origin v4.1.0
```

Pipeline: syntax check → zip bundle → upload to Package Registry → create release `v4.1.0`

### Step 2 — Publish `macos-packaging-framework`

```bash
cd frameworks/macos-packaging-framework
git tag v1.0.0 && git push origin v1.0.0
```

Pipeline: shell syntax check → tar.gz bundle → upload → create release `v1.0.0`

### Step 3 — Tag `intune-deployment-modules`

```bash
cd deployment/intune-deployment-modules
git tag v1.0.0 && git push origin v1.0.0
```

Pipeline: PS syntax check → create release `v1.0.0` *(scripts fetched from git at runtime — no binary upload needed)*

### Step 4 — Tag `terraform-jamf-modules`

```bash
cd deployment/terraform-jamf-modules
git tag v1.0.0 && git push origin v1.0.0
```

Pipeline: `terraform validate` all modules → create release `v1.0.0`

### Step 5 — Tag `gitlab-ci-templates`

```bash
cd frameworks/gitlab-ci-templates
git tag v1.0.0 && git push origin v1.0.0
```

Pipeline: YAML lint → job name checks → create release `v1.0.0`

### Step 6 — Update title include paths

In `titles/google-chrome/.gitlab-ci.yml`, update the `include:` block:

```yaml
include:
  - project: 'euc-packaging/frameworks/gitlab-ci-templates'
    ref: 'v1.0.0'
    file:
      - 'templates/metadata-validate.yml'
      - 'templates/windows-build.yml'
      - 'templates/windows-deploy-intune.yml'
      - 'templates/macos-build.yml'
      - 'templates/macos-deploy-jamf.yml'
```

Commit and push to `main`.

### Step 7 — Tag the title

```bash
# Drop installer binaries first (not committed to git)
# cp GoogleChromeEnterprise64.msi titles/google-chrome/windows/src/Files/
# cp GoogleChrome.pkg              titles/google-chrome/macos/src/Files/

cd titles/google-chrome
git tag v134.0.6998.89-1 && git push origin v134.0.6998.89-1
```

Full pipeline:

```
validate → windows_build + macos_build → windows_publish_intune + macos_deploy_jamf → windows_assign_intune (manual)
```

---

## 10. Adding a New Title

```bash
# Clone google-chrome as template
cp -r titles/google-chrome titles/your-app

# Edit metadata files
vi titles/your-app/app.json
vi titles/your-app/windows/package.yaml
vi titles/your-app/macos/package.yaml
# ...update intune/ and jamf/ inputs...

# Create GitLab project: euc-packaging/titles/your-app
# Push and tag
cd titles/your-app
git init -b main && git add -A
git commit -m "chore: initial title commit"
git remote add origin https://gitlab.example.com/euc-packaging/titles/your-app.git
git push -u origin main
git tag v<vendor-version>-1 && git push origin v<vendor-version>-1
```

Set `WINDOWS_ENABLED: "false"` or `MACOS_ENABLED: "false"` in `.gitlab-ci.yml` for single-platform titles.

---

## 11. Upgrading a Framework Version

### PSADT (e.g. 4.1.0 → 4.2.0)

```bash
# New version directory
cp -r frameworks/psadt-enterprise/versions/4.1.0 \
       frameworks/psadt-enterprise/versions/4.2.0

# Drop in new upstream PSADT runtime
cp -r /path/to/psadt-4.2.0-runtime/* \
       frameworks/psadt-enterprise/versions/4.2.0/PSAppDeployToolkit/

# Update manifest.json version field
# Commit + tag
git tag v4.2.0 && git push origin v4.2.0
```

Existing titles continue using `PSADT_FRAMEWORK_VERSION: "4.1.0"` until you opt them in.

---

## 12. Installer Binary Distribution

Installer binaries (`.msi`, `.pkg`, `GoogleChromeEnterprise64.msi`, etc.) **must NOT be committed to git** — they are too large and change frequently.

Recommended patterns:

| Option | How |
|--------|-----|
| **GitLab Package Registry** | Upload per-title/version via the Generic Package API; reference the URL in `package.yaml` as `source_url:` and download in a custom `pre_build` hook |
| **S3 / Azure Blob** | Store binaries in a bucket; pass a pre-signed URL to the build runner as a CI variable |
| **Shared NAS** | Mount a network share on runner machines; reference by UNC path in `source_filename:` |
| **CI artifact from upstream pipeline** | If you have a software download pipeline, pass artifacts via GitLab's downstream trigger |

The recommended approach for the SPA pipeline is to add a `source_url:` field to `package.yaml` and have `windows-build.yml`/`macos-build.yml` download the binary at build time using `Invoke-WebRequest` or `curl` with a pre-authorised URL.
