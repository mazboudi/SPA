variable "profile_name" {
  type        = string
  description = "Name of the macOS Configuration Profile in Jamf Pro."
}

variable "description" {
  type        = string
  default     = "Managed by SPA pipeline."
  description = "Description of the macOS Configuration Profile."
}

variable "category_id" {
  type        = number
  default     = -1
  description = "Category ID to assign to the Configuration Profile. -1 = No category."
}

variable "payload" {
  type        = string
  description = "The XML (plist) payload of the mobileconfig profile."
}

variable "scope_all_computers" {
  type        = bool
  default     = false
  description = "Scope the profile to all computers if true."
}

variable "scope_group_ids" {
  type        = list(number)
  default     = []
  description = "List of Jamf computer group IDs to scope this profile to."
}

variable "exclusion_group_ids" {
  type        = list(number)
  default     = []
  description = "List of Jamf computer group IDs to exclude from this profile's scope."
}
