##=============================================================================
## modules/category/main.tf
## Creates a Jamf Pro category for software packaging.
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "deploymenttheory/jamfpro"
      version = "~> 0.37"
    }
  }
}

resource "jamfpro_category" "this" {
  name     = var.name
  priority = var.priority
}

output "id" {
  value       = jamfpro_category.this.id
  description = "The Jamf Pro category ID."
}

output "name" {
  value       = jamfpro_category.this.name
  description = "The Jamf Pro category name."
}
