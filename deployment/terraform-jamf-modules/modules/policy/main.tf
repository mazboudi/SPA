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
  name            = var.policy_name
  enabled         = var.enabled
  trigger_checkin = var.trigger == "RECURRING_CHECK_IN"
  trigger_other   = var.trigger == "EVENT" ? "USER_INITIATED" : ""
  frequency       = var.frequency
  category_id     = var.category_id
  site_id         = -1

  # Scope — target computer groups
  scope {
    all_computers = var.scope_all_computers

    computer_group_ids = var.scope_group_ids

    dynamic "exclusions" {
      for_each = length(var.exclusion_group_ids) > 0 ? [1] : []
      content {
        computer_group_ids = var.exclusion_group_ids
      }
    }
  }

  # Package payload
  payloads {
    packages {
      distribution_point = "default"
      package {
        id                          = var.package_id
        action                      = "Install"
        fill_user_template          = false
        fill_existing_user_template = false
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

    # Reboot
    reboot {
      message                        = var.reboot_message
      specify_startup                = "Standard Restart"
      startup_disk                   = "Current Startup Disk"
      no_user_logged_in              = var.reboot_required ? "Restart" : "Do not restart"
      user_logged_in                 = var.reboot_required ? "Restart" : "Do not restart"
      minutes_until_reboot           = var.reboot_required ? 5 : 0
      start_reboot_timer_immediately = false
      file_vault_2_reboot            = false
    }
  }

  # Self Service
  self_service {
    use_for_self_service            = var.self_service_enabled
    self_service_display_name       = var.self_service_display_name
    install_button_text             = "Install"
    reinstall_button_text           = "Reinstall"
    self_service_description        = var.self_service_description
    force_users_to_view_description = false
    feature_on_main_page            = false
  }
}

output "id" {
  value       = jamfpro_policy.this.id
  description = "Jamf Pro policy ID."
}
