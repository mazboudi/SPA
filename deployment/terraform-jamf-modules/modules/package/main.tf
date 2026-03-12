##=============================================================================
## modules/package/main.tf
## Uploads a .pkg to Jamf Pro as a package record.
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "danjamf/jamfpro"
      version = "~> 0.16"
    }
  }
}

resource "jamfpro_package" "this" {
  package_name     = var.display_name
  file_path        = var.pkg_path
  category_id      = var.category_id
  info             = var.info
  notes            = var.notes
  priority         = var.priority
  reboot_required  = var.reboot_required
  fill_user_template             = false
  fill_existing_users            = false
  boot_volume_required           = false
  allow_uninstalled              = false
  os_requirements                = ""
  required_processor             = "None"
  switch_with_package            = ""
  install_if_reported_available  = false
  reinstall_option               = "Do Not Reinstall"
  triggering_files               = ""
  send_notification              = false
}

output "id" {
  value       = jamfpro_package.this.id
  description = "Jamf Pro package ID."
}

output "name" {
  value       = jamfpro_package.this.package_name
  description = "Jamf Pro package display name."
}
