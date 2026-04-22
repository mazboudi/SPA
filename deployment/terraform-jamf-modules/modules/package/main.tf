##=============================================================================
## modules/package/main.tf
## Uploads a .pkg/.dmg to Jamf Pro as a package record via Cloud DP.
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
  package_name        = var.package_name
  package_file_source = var.package_file_source
  category_id         = var.category_id
  info                = var.info
  notes               = var.notes
  priority            = var.priority

  # Required boolean flags
  reboot_required       = var.reboot_required
  fill_user_template    = false
  fill_existing_users   = false
  os_install            = false
  suppress_updates      = false
  suppress_from_dock    = false
  suppress_eula         = false
  suppress_registration = false

  # Optional
  os_requirements = var.os_requirements

  timeouts {
    create = var.upload_timeout
  }
}

output "id" {
  value       = jamfpro_package.this.id
  description = "Jamf Pro package ID."
}

output "name" {
  value       = jamfpro_package.this.package_name
  description = "Jamf Pro package display name."
}
