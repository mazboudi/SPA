##=============================================================================
## modules/smart-group/main.tf
## Creates a Jamf Pro smart computer group (v2 API).
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "deploymenttheory/jamfpro"
      version = "~> 0.37"
    }
  }
}

resource "jamfpro_smart_computer_group_v2" "this" {
  name    = var.name
  site_id = var.site_id

  dynamic "criteria" {
    for_each = var.criteria
    content {
      name          = criteria.value.name
      priority      = criteria.value.priority
      and_or        = criteria.value.and_or
      search_type   = criteria.value.search_type
      value         = criteria.value.value
      opening_paren = try(criteria.value.opening_paren, false)
      closing_paren = try(criteria.value.closing_paren, false)
    }
  }
}

output "id" {
  value       = jamfpro_smart_computer_group_v2.this.id
  description = "Jamf Pro smart group ID."
}

output "name" {
  value       = jamfpro_smart_computer_group_v2.this.name
  description = "Jamf Pro smart group name."
}
