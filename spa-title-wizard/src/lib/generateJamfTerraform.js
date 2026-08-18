/**
 * generateJamfTerraform.js
 *
 * JavaScript port of Build-JamfTerraform.sh.
 * Generates Terraform main.tf + variables.tf content from the SPA wizard state,
 * using the same logic and input field names as generateScaffolding.js.
 *
 * Returns: { 'tf-deploy/main.tf': string, 'tf-deploy/variables.tf': string }
 * Intended to be piped through downloadZip.js for local download.
 */

/**
 * Build a HCL list literal from an array of values.
 * e.g. [1, 2] → '[1, 2]'   [] → '[]'   ['checkin'] → '["checkin"]'
 */
function hclList(arr, quote = false) {
  if (!arr || arr.length === 0) return '[]';
  const items = arr.map(v => quote ? `"${v}"` : String(v));
  return `[${items.join(', ')}]`;
}

/** Escape a string for use inside a Terraform double-quoted string. */
function tfStr(v) {
  return (v || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\${/g, '\\${');
}

/**
 * Generate Terraform main.tf + variables.tf from wizard state.
 *
 * @param {object} s  — wizard state (same shape as generateScaffolding receives)
 * @returns {{ 'tf-deploy/main.tf': string, 'tf-deploy/variables.tf': string }}
 */
export function generateJamfTerraform(s) {
  // ── Derive values (mirrors generateScaffolding.js field reads) ─────────────
  const pkgName       = `${s.displayName || 'Unknown'} ${s.version || ''}`.trim();
  const pkgCategoryId = s.jamfCategoryId || '-1';
  const pkgNotes      = s.macPackageNotes || 'Deployed by SPA pipeline. Do not modify directly in Jamf.';
  const pkgOsReqs     = s.macMinOs ? `macOS ${s.macMinOs}` : '';
  const pkgReboot     = !!(s.macRebootRequired);

  const policyName    = `SPA - Install ${s.displayName || 'Unknown'}`;
  const policyFreq    = s.macPolicyFrequency || 'Ongoing';
  const policyEnabled = true;
  const policyRecon   = true;

  const isSelfService = !!s.macSelfService;
  const ssDisplayName = isSelfService ? (s.displayName || '') : '';
  const ssDescription = isSelfService ? (s.macSelfServiceDescription || '') : '';
  const ssCategoryId  = isSelfService && s.selfServiceCategoryId
    ? parseInt(s.selfServiceCategoryId, 10)
    : -1;

  const triggers = Array.isArray(s.macPolicyTriggers) && s.macPolicyTriggers.length
    ? s.macPolicyTriggers
    : ['checkin'];
  const customTrigger = triggers.includes('custom') ? (s.macPolicyCustomTrigger || '') : '';

  const scopeIds = s.scopeGroupIds
    ? s.scopeGroupIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const scopeBuildings = s.scopeBuildingIds
    ? s.scopeBuildingIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const scopeDepartments = s.scopeDepartmentIds
    ? s.scopeDepartmentIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const scopeSegments = s.scopeNetworkSegmentIds
    ? s.scopeNetworkSegmentIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];

  const exclusionIds = s.exclusionGroupIds
    ? s.exclusionGroupIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const exclusionBuildings = s.exclusionBuildingIds
    ? s.exclusionBuildingIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const exclusionDepartments = s.exclusionDepartmentIds
    ? s.exclusionDepartmentIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const exclusionSegments = s.exclusionNetworkSegmentIds
    ? s.exclusionNetworkSegmentIds.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n))
    : [];

  const killProcess          = !!s.macKillProcess;
  const searchForProcess     = s.macSearchForProcess || '';
  const runCommand           = s.macRunCommand || '';
  const allowUsersToDefer    = !!s.macAllowUsersToDefer;
  const allowDeferralMinutes = parseInt(s.macAllowDeferralMinutes, 10) || 0;
  const messageStart         = s.macMessageStart || '';
  const scriptParameter4     = s.macScriptParameter4 || '';
  const scriptParameter5     = s.macScriptParameter5 || '';

  const hasProfile           = !!(s.macEnableProfile && s.macProfileContents);
  const profileName          = s.macProfileName || `SPA - ${s.displayName} Configuration Profile`;
  const profileDesc          = s.macProfileDescription || 'Managed by SPA pipeline.';
  const profileCategoryId    = s.macProfileCategoryId || '-1';

  const receiptId      = s.receiptId || '';
  const hasValidReceipt = receiptId && receiptId !== 'com.vendor.todo';

  const hasPreinstall  = !!(s.macEnablePreInstall  && s.macPreInstallScript);
  const hasPostinstall = !!(s.macEnablePostInstall && s.macPostInstallScript);
  const preScriptName  = hasPreinstall  ? `SPA - ${s.displayName} preinstall`  : '';
  const postScriptName = hasPostinstall ? `SPA - ${s.displayName} postinstall` : '';
  const gitLabHost = s.gitLabHost || 'gitlab.onefiserv.net';
  const gitLabGroup = s.gitLabMacGroup || s.gitLabGroup || '';
  const tfJamfModulesProject = s.tfJamfModulesProject || `${gitLabGroup}/spa-deployment/terraform-jamf-modules`;
  const modulesRef = s.tfJamfModulesRef || 'main';

  const getModuleSource = (moduleName) => {
    return s.macExportRemoteModules
      ? `git::https://${gitLabHost}/${tfJamfModulesProject}.git//modules/${moduleName}?ref=${modulesRef}`
      : `file://./terraform-jamf-modules/modules/${moduleName}`;
  };

  // ── Build main.tf ──────────────────────────────────────────────────────────
  const lines = [
    '##=============================================================================',
    '## Auto-generated by SPA wizard — mirrors Build-JamfTerraform.sh output',
    '## Review before applying. Module source paths use relative references.',
    '##=============================================================================',
    '',
    'terraform {',
    '  required_version = ">= 1.5.0"',
    '  required_providers {',
    '    jamfpro = {',
    '      source  = "deploymenttheory/jamfpro"',
    '      version = "~> 0.37"',
    '    }',
    '  }',
    '  backend "http" {} # GitLab-managed Terraform state',
    '}',
    '',
    'provider "jamfpro" {',
    '  jamfpro_instance_fqdn                = var.jamf_instance_url',
    '  client_id                            = var.jamf_client_id',
    '  client_secret                        = var.jamf_client_secret',
    '  auth_method                          = "oauth2"',
    '  jamfpro_load_balancer_lock           = false',
    '  token_refresh_buffer_period_seconds  = 5',
    '  mandatory_request_delay_milliseconds = 100',
    '}',
    '',
    '# ── Package ──────────────────────────────────────────────────────────────────',
    'module "package" {',
    `  source              = "${getModuleSource('package')}"`,
    `  package_name        = "${tfStr(pkgName)}"`,
    '  package_file_source = var.package_file_path',
    `  category_id         = "${tfStr(pkgCategoryId)}"`,
    `  notes               = "${tfStr(pkgNotes)}"`,
    `  os_requirements     = "${tfStr(pkgOsReqs)}"`,
    `  reboot_required     = ${pkgReboot}`,
    '}',
    '',
    '# ── Policy ───────────────────────────────────────────────────────────────────',
    'module "policy" {',
    `  source                        = "${getModuleSource('policy')}"`,
    `  policy_name                   = "${tfStr(policyName)}"`,
    '  package_id                    = module.package.id',
    '  category_id                   = -1',
    `  enabled                       = ${policyEnabled}`,
    `  frequency                     = "${tfStr(policyFreq)}"`,
    `  triggers                      = ${hclList(triggers, true)}`,
    `  custom_trigger                = "${tfStr(customTrigger)}"`,
    `  scope_group_ids               = ${hclList(scopeIds)}`,
    `  scope_building_ids            = ${hclList(scopeBuildings)}`,
    `  scope_department_ids          = ${hclList(scopeDepartments)}`,
    `  scope_network_segment_ids     = ${hclList(scopeSegments)}`,
    `  exclusion_group_ids           = ${hclList(exclusionIds)}`,
    `  exclusion_building_ids        = ${hclList(exclusionBuildings)}`,
    `  exclusion_department_ids      = ${hclList(exclusionDepartments)}`,
    `  exclusion_network_segment_ids = ${hclList(exclusionSegments)}`,
    `  run_recon_after_install       = ${policyRecon}`,
    `  reboot_required               = ${pkgReboot}`,
    `  kill_process                  = ${killProcess}`,
    `  search_for_process            = "${tfStr(searchForProcess)}"`,
    `  run_command                   = "${tfStr(runCommand)}"`,
    `  allow_users_to_defer          = ${allowUsersToDefer}`,
    `  allow_deferral_minutes        = ${allowDeferralMinutes}`,
    `  message_start                 = "${tfStr(messageStart)}"`,
    `  script_parameter4             = "${tfStr(scriptParameter4)}"`,
    `  script_parameter5             = "${tfStr(scriptParameter5)}"`,
    `  preinstall_script_id          = ${hasPreinstall ? 'module.preinstall_script.id' : '-1'}`,
    `  postinstall_script_id         = ${hasPostinstall ? 'module.postinstall_script.id' : '-1'}`,
    `  self_service_enabled          = ${isSelfService}`,
    `  self_service_display_name     = "${tfStr(ssDisplayName)}"`,
    `  self_service_description  = "${tfStr(ssDescription)}"`,
    `  self_service_category_id  = ${ssCategoryId}`,
    '}',
    '',
    '# ── Outputs ──────────────────────────────────────────────────────────────────',
    'output "package_id" {',
    '  value = module.package.id',
    '}',
    '',
    'output "policy_id" {',
    '  value = module.policy.id',
    '}',
  ];

  // ── Extension Attribute (conditional) ─────────────────────────────────────
  if (hasValidReceipt) {
    const eaName = `SPA - ${pkgName} Version`;
    lines.push(
      '',
      '# ── Extension Attribute ──────────────────────────────────────────────────────',
      'module "extension_attribute" {',
      `  source     = "${getModuleSource('extension-attribute')}"`,
      `  name       = "${tfStr(eaName)}"`,
      `  receipt_id = "${tfStr(receiptId)}"`,
      '}',
      '',
      'output "extension_attribute_id" {',
      '  value = module.extension_attribute.id',
      '}',
    );
  }

  // ── Pre-install script module (conditional) ────────────────────────────────
  if (hasPreinstall) {
    lines.push(
      '',
      '# ── Pre-install Script ────────────────────────────────────────────────────────',
      'module "preinstall_script" {',
      `  source          = "${getModuleSource('script')}"`,
      `  script_name     = "${tfStr(preScriptName)}"`,
      '  script_contents = file("macos/jamf/preinstall.sh")',
      '  priority        = "Before"',
      '  notes           = "Managed by SPA pipeline."',
      '}',
      '',
      'output "preinstall_script_id" {',
      '  value = module.preinstall_script.id',
      '}',
    );
  }

  // ── Post-install script module (conditional) ───────────────────────────────
  if (hasPostinstall) {
    lines.push(
      '',
      '# ── Post-install Script ───────────────────────────────────────────────────────',
      'module "postinstall_script" {',
      `  source          = "${getModuleSource('script')}"`,
      `  script_name     = "${tfStr(postScriptName)}"`,
      '  script_contents = file("macos/jamf/postinstall.sh")',
      '  priority        = "After"',
      '  notes           = "Managed by SPA pipeline."',
      '}',
      '',
      'output "postinstall_script_id" {',
      '  value = module.postinstall_script.id',
      '}',
    );
  }

  // ── Configuration Profile module (conditional) ─────────────────────────────
  if (hasProfile) {
    lines.push(
      '',
      '# ── Configuration Profile ─────────────────────────────────────────────────────',
      'module "configuration_profile" {',
      `  source              = "${getModuleSource('configuration-profile')}"`,
      `  profile_name        = "${tfStr(profileName)}"`,
      `  description         = "${tfStr(profileDesc)}"`,
      `  category_id         = ${profileCategoryId}`,
      '  payload             = file("macos/jamf/profile.mobileconfig")',
      '  scope_all_computers = false',
      `  scope_group_ids     = ${hclList(scopeIds)}`,
      `  exclusion_group_ids = ${hclList(exclusionIds)}`,
      '}',
      '',
      'output "configuration_profile_id" {',
      '  value = module.configuration_profile.id',
      '}',
    );
  }


  const mainTf = lines.join('\n') + '\n';

  // ── Build variables.tf ─────────────────────────────────────────────────────
  const variablesTf = `variable "jamf_instance_url" {
  type        = string
  description = "Jamf Pro instance FQDN (e.g. 'yourinstance.jamfcloud.com')."
}

variable "jamf_client_id" {
  type        = string
  sensitive   = true
  description = "Jamf Pro API client ID."
}

variable "jamf_client_secret" {
  type        = string
  sensitive   = true
  description = "Jamf Pro API client secret."
}

variable "package_file_path" {
  type        = string
  description = "Path to the .pkg or .dmg to upload."
}
`;

  const files = {
    'tf-deploy/main.tf': mainTf,
    'tf-deploy/variables.tf': variablesTf,
  };

  if (hasPreinstall) {
    files['macos/jamf/preinstall.sh'] = s.macPreInstallScript;
  }
  if (hasPostinstall) {
    files['macos/jamf/postinstall.sh'] = s.macPostInstallScript;
  }
  if (hasProfile) {
    files['macos/jamf/profile.mobileconfig'] = s.macProfileContents;
  }

  return files;
}
