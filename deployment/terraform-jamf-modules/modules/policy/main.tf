##=============================================================================
## modules/policy/main.tf
## Creates a Jamf Pro policy to install a package.
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "deploymenttheory/jamfpro"
      version = "~> 0.37"
    }
  }
}

resource "jamfpro_policy" "this" {
  name                        = var.policy_name
  enabled                     = var.enabled
  trigger_checkin             = contains(var.triggers, "checkin")
  trigger_enrollment_complete = contains(var.triggers, "enrollment")
  trigger_login               = contains(var.triggers, "login")
  trigger_startup             = contains(var.triggers, "startup")
  trigger_other               = contains(var.triggers, "custom") ? var.custom_trigger : ""
  frequency                   = var.frequency
  category_id                 = var.category_id
  site_id                     = -1

  # Scope — target computers, groups, buildings, departments, segments
  scope {
    all_computers = var.scope_all_computers

    computer_group_ids = var.scope_group_ids
    building_ids       = var.scope_building_ids
    department_ids     = var.scope_department_ids

    dynamic "limitations" {
      for_each = length(var.scope_network_segment_ids) > 0 ? [1] : []
      content {
        network_segment_ids = var.scope_network_segment_ids
      }
    }

    dynamic "exclusions" {
      for_each = (length(var.exclusion_group_ids) > 0 || length(var.exclusion_building_ids) > 0 || length(var.exclusion_department_ids) > 0 || length(var.exclusion_network_segment_ids) > 0) ? [1] : []
      content {
        computer_group_ids  = var.exclusion_group_ids
        building_ids        = var.exclusion_building_ids
        department_ids      = var.exclusion_department_ids
        network_segment_ids = var.exclusion_network_segment_ids
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

    dynamic "scripts" {
      for_each = var.preinstall_script_id > 0 ? [1] : []
      content {
        id         = var.preinstall_script_id
        priority   = "Before"
        parameter4 = var.script_parameter4
        parameter5 = var.script_parameter5
      }
    }

    dynamic "scripts" {
      for_each = var.postinstall_script_id > 0 ? [1] : []
      content {
        id         = var.postinstall_script_id
        priority   = "After"
        parameter4 = var.script_parameter4
        parameter5 = var.script_parameter5
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

    # Files & Processes
    files_processes {
      search_for_process = var.search_for_process
      kill_process       = var.kill_process
      run_command        = var.run_command
    }

    # User Interaction
    user_interaction {
      message_start          = var.message_start
      allow_users_to_defer   = var.allow_users_to_defer
      allow_deferral_minutes = var.allow_deferral_minutes
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
    self_service_category {
      id         = var.self_service_category_id
      display_in = var.self_service_enabled
      feature_in = false
    }
  }
}

output "id" {
  value       = jamfpro_policy.this.id
  description = "Jamf Pro policy ID."
}
