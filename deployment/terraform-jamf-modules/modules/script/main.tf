##=============================================================================
## modules/script/main.tf
## Creates a Jamf Pro script record from an inline script string.
## Used by the SPA pipeline to upload pre/post install scripts to Jamf.
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "deploymenttheory/jamfpro"
      version = "~> 0.37"
    }
  }
}

resource "jamfpro_script" "this" {
  name              = var.script_name
  script_contents   = var.script_contents
  os_requirements   = var.os_requirements
  priority          = var.priority
  info              = var.info
  notes             = var.notes
  category_id       = var.category_id
}

output "id" {
  value       = jamfpro_script.this.id
  description = "Jamf Pro script ID."
}

output "name" {
  value       = jamfpro_script.this.name
  description = "Jamf Pro script name."
}
