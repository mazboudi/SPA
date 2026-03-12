##=============================================================================
## modules/policy/main.tf
## Creates a Jamf Pro policy to install a package.
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "danjamf/jamfpro"
      version = "~> 0.16"
    }
  }
}

resource "jamfpro_policy" "this" {
  name              = var.policy_name
  enabled           = true
  trigger_checkin   = var.trigger == "RECURRING_CHECK_IN"
  trigger_other     = var.trigger == "EVENT" ? "USER_INITIATED" : ""
  frequency         = var.frequency

  # Category
  category {
    id   = var.category_id
    name = ""
  }

  # Scope — targets specific computer smart groups
  scope {
    all_computers = false

    dynamic "computer_group" {
      for_each = var.scope_group_ids
      content {
        id   = computer_group.value
        name = ""
      }
    }
  }

  # Package payload
  package_configuration {
    distribution_point = "default"
    dynamic "package" {
      for_each = [var.package_id]
      content {
        id             = package.value
        name           = ""
        action         = "Install"
        fill_user_template  = false
        fill_existing_users = false
      }
    }
  }

  # Maintenance
  maintenance {
    recon                       = var.run_recon_after_install
    reset_name                  = false
    install_all_cached_packages = false
    heal                        = false
    prebindings                 = false
    permissions                 = false
    byhost                      = false
    system_cache                = false
    user_cache                  = false
    verify                      = false
  }

  self_service {
    use_for_self_service = var.self_service_enabled
  }
}

output "id" {
  value       = jamfpro_policy.this.id
  description = "Jamf Pro policy ID."
}
