variable "display_name" {
  type        = string
  description = "Display name for the Jamf Pro package (e.g. 'Google Chrome 134.0')."
}

variable "pkg_path" {
  type        = string
  description = "Absolute path to the .pkg file to upload."
}

variable "category_id" {
  type        = number
  description = "Jamf Pro category ID from the category module output."
}

variable "info" {
  type        = string
  default     = ""
  description = "Optional info field for the package."
}

variable "notes" {
  type        = string
  default     = "Deployed by SPA pipeline"
  description = "Notes field for the package record."
}

variable "priority" {
  type        = number
  default     = 10
  description = "Package installation priority (1-20)."
}

variable "reboot_required" {
  type        = bool
  default     = false
  description = "Whether a reboot is required after installation."
}
