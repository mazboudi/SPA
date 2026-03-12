variable "name" {
  type        = string
  description = "Smart group name (e.g. 'SPA - Google Chrome - Target')."
}

variable "site_id" {
  type        = number
  default     = -1
  description = "Jamf Pro site ID. -1 = Full Jamf Pro."
}

variable "criteria" {
  type = list(object({
    name          = string
    priority      = number
    and_or        = string
    search_type   = string
    value         = string
    opening_paren = optional(bool, false)
    closing_paren = optional(bool, false)
  }))
  default     = []
  description = "List of smart group criteria objects."
}
