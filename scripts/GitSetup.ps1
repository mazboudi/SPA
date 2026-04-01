$SPA_DIR     = "C:\path\to\SPA"   # ← update to your local workspace path
$GITLAB_BASE = "https://gitlab.example.com/software-packaging-automation"

# local folder path  →  GitLab project path (under the root group)
$repos = [ordered]@{
    "schemas\packaging-standards"          = "spa-schemas/packaging-standards"
    "frameworks\psadt-enterprise"          = "spa-frameworks/psadt-enterprise"
    "frameworks\macos-packaging-framework" = "spa-frameworks/macos-packaging-framework"
    "frameworks\gitlab-ci-templates"       = "spa-frameworks/gitlab-ci-templates"
    "deployment\intune-deployment-modules" = "spa-deployment/intune-deployment-modules"
    "deployment\terraform-jamf-modules"    = "spa-deployment/terraform-jamf-modules"
    "titles\google-chrome"                 = "software-titles/google-chrome"
}

foreach ($localPath in $repos.Keys) {
    $remotePath = $repos[$localPath]
    $fullLocal  = Join-Path $SPA_DIR $localPath
    $remoteUrl  = "$GITLAB_BASE/$remotePath.git"

    Write-Host "`nPushing: $localPath  ->  $remoteUrl" -ForegroundColor Cyan

    Push-Location $fullLocal
    git init -b main
    git add -A
    git commit -m "chore: initial commit"
    git remote add origin $remoteUrl
    git push -u origin main
    Pop-Location
}

Write-Host "`nAll repos pushed." -ForegroundColor Green