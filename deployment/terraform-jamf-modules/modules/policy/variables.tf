variable "policy_name" {
  type        = string
  description = "Jamf Pro policy name (e.g. 'Install Google Chrome')."
}

variable "package_id" {
  type        = number
  description = "Jamf Pro package ID from the package module output."
}

variable "category_id" {
  type        = number
  default     = -1
  description = "Jamf Pro category ID for the policy. -1 = No category."
}

variable "scope_group_ids" {
  type        = list(number)
  default     = []
  description = "List of Jamf smart group IDs to scope this policy to."
}

variable "trigger" {
  type        = string
  default     = "RECURRING_CHECK_IN"
  description = "Policy trigger: 'RECURRING_CHECK_IN' or 'EVENT'."
  validation {
    condition     = contains(["RECURRING_CHECK_IN", "EVENT"], var.trigger)
    error_message = "trigger must be 'RECURRING_CHECK_IN' or 'EVENT'."
  }
}

variable "frequency" {
  type        = string
  default     = "Once per computer"
  description = "Policy frequency: 'Once per computer', 'Once per user per computer', 'Always', etc."
}

variable "run_recon_after_install" {
  type        = bool
  default     = true
  description = "Whether to run inventory update (recon) after the package installs."
}

variable "self_service_enabled" {
  type        = bool
  default     = false
  description = "Whether to make this policy available in Jamf Self Service."
}
