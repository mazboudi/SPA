##=============================================================================
## modules/configuration-profile/main.tf
## Creates a macOS Configuration Profile (mobileconfig) in Jamf Pro.
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "deploymenttheory/jamfpro"
      version = "~> 0.37"
    }
  }
}

resource "jamfpro_macos_configuration_profile_plist" "this" {
  name        = var.profile_name
  description = var.description
  category_id = var.category_id
  payloads    = var.payload

  # Scoping profile
  scope {
    all_computers      = var.scope_all_computers
    computer_group_ids = var.scope_group_ids

    dynamic "exclusions" {
      for_each = length(var.exclusion_group_ids) > 0 ? [1] : []
      content {
        computer_group_ids = var.exclusion_group_ids
      }
    }
  }
}

output "id" {
  value       = jamfpro_macos_configuration_profile_plist.this.id
  description = "The Jamf Pro macOS Configuration Profile ID."
}

output "name" {
  value       = jamfpro_macos_configuration_profile_plist.this.name
  description = "The Jamf Pro macOS Configuration Profile name."
}

