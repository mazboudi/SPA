# test-federated-auth

Minimal test project to validate Azure Workload Identity Federation from GitLab CI/CD.

## What This Tests

1. **OIDC Token Inspection** — Decodes the GitLab-issued JWT and prints its claims so you can verify they match your Azure Federated Credential configuration
2. **Token Exchange** — Exchanges the OIDC JWT for an Azure AD access token using `client_assertion` (no client secret)
3. **Graph API Call** — Makes a test call to list Win32 apps from Intune to confirm end-to-end auth

## Setup Steps

### 1. Verify Azure Federated Credential

In Azure Portal → App Registrations → **Gitlab_CI_CD** → Certificates & secrets → Federated credentials:

| Field | Expected Value |
|---|---|
| **Issuer** | `https://gitlab.onefiserv.net` (your GitLab instance URL) |
| **Subject identifier** | Depends on your config — see note below |
| **Audience** | `https://gitlab.onefiserv.net` |

> **Subject identifier** can be configured as:
> - `project_path:<group>/<project>:<ref_type>:<ref>` (most restrictive)
> - `project_path:<group>/<project>` (any branch/tag in that project)  
> - Use the `inspect_oidc_token` job output to see the exact `sub` claim

### 2. Set CI/CD Variables

At the **group level** (so all title repos inherit them) or at this test project:

| Variable | Value | Protected | Masked |
|---|---|---|---|
| `AZURE_TENANT_ID` | Your Entra tenant ID | No | No |
| `AZURE_CLIENT_ID` | Gitlab_CI_CD app client ID | No | No |

**No `AZURE_CLIENT_SECRET` needed!**

### 3. Push This Repo

```bash
cd test-federated-auth
git init
git add .
git commit -m "test: federated auth validation"
git remote add origin https://gitlab.onefiserv.net/<your-group>/test-federated-auth.git
git push -u origin main
```

### 4. Check Pipeline Output

The pipeline runs automatically. Check each job:

- **inspect_oidc_token** — Shows JWT claims. Compare `sub` and `aud` with your Azure federated credential config
- **exchange_for_graph_token** — If this fails, the issuer/subject/audience don't match

### 5. Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| `AADSTS70021: No matching federated identity record found` | Subject mismatch | Compare the `sub` claim from job 1 with Azure config |
| `AADSTS700016: Application not found` | Wrong `AZURE_CLIENT_ID` | Verify the client ID matches the app registration |
| `AADSTS700024: Client assertion is not within its valid time range` | Token expired | Re-run the pipeline (tokens are short-lived) |
| `403 Forbidden` on Graph call | Missing API permissions | Grant `DeviceManagementApps.ReadWrite.All` (Application) + admin consent |

## After Testing

Once this pipeline passes, you know:
- ✅ GitLab OIDC → Azure federated auth works
- ✅ The app has correct Graph API permissions
- ✅ Ready to update the production CI templates

Delete this test project when done.
