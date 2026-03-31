# PSADT Win32 Packaging Factory (GitLab + Intune)

This repository is a **template** (“factory”) for building and publishing **Microsoft Intune Win32 apps (.intunewin)** using **PSAppDeployToolkit (PSADT) v4**.

It is designed so every app repo created from this template is:
- deterministic (pinned toolkit + pinned build tool),
- consistent (same folder contract),
- automation-friendly (GitLab pipeline scripts reused across apps).

---

## Repo Layout (What’s What)

```text
_template-psadt-win32/
  app.json                     # app metadata contract (per app repo)
  .gitlab-ci.yml               # pipeline (validate -> build -> publish -> assign)
  README.md

  pipeline/                    # factory scripts (reused by every app)
    validate-appjson.ps1
    build-intunewin.ps1
    publish-intune.ps1
    assign-intune.ps1

  tools/
    IntuneWinAppUtil.exe        # Microsoft Win32 content prep tool (pinned)
    README.md                   # tool versions / source notes (optional)

  psadt/                        # pinned PSADT v4 template contents (do not modify)
    Invoke-AppDeployToolkit.ps1
    Invoke-AppDeployToolkit.exe
    PSAppDeployToolkit/
    PSAppDeployToolkit.Extensions/
    Files/
    SupportFiles/
    Assets/
    Config/
    Strings/

  src/                          # app-specific overlay content (edit per app)
    Files/                      # installer payload(s) go here
    SupportFiles/               # optional helper scripts/config
    Assets/                     # optional icon/banner assets
    Config/
      config.psd1               # org defaults (standardized)
    Strings/
      strings.psd1              # optional strings overrides
```

---

## Golden Rules

### ✅ Do edit (per application repo)
- `app.json`
- `src/Files/*`
- `src/SupportFiles/*` (optional)
- `src/Assets/*` (optional)
- `src/Config/config.psd1` (only if you are updating org-wide defaults)
- `src/Strings/strings.psd1` (optional)

### ❌ Do NOT edit
- anything under `psadt/PSAppDeployToolkit/` (pinned toolkit core)
- the PSADT template under `psadt/` except when upgrading toolkit versions as a controlled change

### ❌ Do NOT commit
- `out/`
- `*.intunewin`

---

## How Build Works (Staging Convention)

The build job creates a temporary **staging folder** and constructs the Win32 package content like this:

1. Copy everything from `psadt/` → `<staging>/`  
2. Overlay app content from `src/`:
   - `src/Files/*` → `<staging>/Files/`
   - `src/SupportFiles/*` → `<staging>/SupportFiles/`
   - `src/Assets/*` → `<staging>/Assets/`
3. Overlay standardized org defaults:
   - `src/Config/config.psd1` → `<staging>/Config/config.psd1`
   - `src/Strings/strings.psd1` (if present) → `<staging>/Strings/strings.psd1`

### Setup file selection (IntuneWinAppUtil `-s`)
We standardize on:
- **Setup file:** `Invoke-AppDeployToolkit.exe`

The `.intunewin` is built using:
```powershell
IntuneWinAppUtil.exe -c <staging> -s Invoke-AppDeployToolkit.exe -o out -q
```

### Output naming
The output is always renamed to:
- `out/<name>_<version>.intunewin`

Where `<name>` and `<version>` come from `app.json`.

---

## app.json Contract

`app.json` drives:
- display name / publisher / version,
- install and uninstall command lines,
- detection type (msi / registry / file),
- (optional) requirements and assignments.

Example:
```json
{
  "name": "7-Zip",
  "publisher": "Igor Pavlov",
  "description": "7-Zip x64",
  "version": "24.08",
  "install": {
    "commandLine": "Invoke-AppDeployToolkit.exe -DeploymentType Install -DeployMode Silent",
    "maxRuntimeMinutes": 60
  },
  "uninstall": {
    "commandLine": "Invoke-AppDeployToolkit.exe -DeploymentType Uninstall -DeployMode Silent"
  },
  "detection": {
    "type": "msi",
    "productCode": "{00000000-0000-0000-0000-000000000000}"
  }
}
```

Detection types supported by the factory validator:
- `msi` → `productCode`
- `registry` → `hive`, `keyPath`, `valueName`, `operator`, `value` (depending on operator)
- `file` → `path`, `fileOrFolder`, `operator`, `version` (only required for version operators)

---

## Creating a New App Repo

1. Create a new repository using this template.
2. Drop your installer payload into:
   - `src/Files/`
3. Update:
   - `app.json`
4. Commit and open a Merge Request:
   - validation + build runs
5. Tag a release (if your pipeline is configured to publish on tags):
   - publish + assign runs

---

## Upgrading PSADT (Controlled Change)

When upgrading the toolkit:
1. Download the desired PSADT v4 Template ZIP.
2. Replace the contents under `psadt/` with the new version.
3. Commit with a clear message, e.g.:
   - `chore(psadt): bump to v4.1.x`
4. Validate one test app end-to-end before broad adoption.

---

## Troubleshooting

### Build fails: missing tools/IntuneWinAppUtil.exe
Ensure the Win32 Content Prep Tool binary is present and committed:
- `tools/IntuneWinAppUtil.exe`

### Build succeeds but installer does nothing
Confirm your install command line in `app.json` uses the standard entry point:
- `Invoke-AppDeployToolkit.exe -DeploymentType Install -DeployMode Silent`

### Detection fails in Intune
Double-check `app.json` detection fields match the chosen detection type and reflect the installed state.

---

## Support / Ownership

This template is owned by the Packaging Automation team. Changes to:
- `pipeline/`
- `.gitlab-ci.yml`
- `psadt/`
- `src/Config/config.psd1`

should go through code review, as they affect every packaged application.
