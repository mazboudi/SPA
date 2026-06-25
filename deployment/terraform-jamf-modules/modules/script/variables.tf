variable "script_name" {
  type        = string
  description = "Display name for the Jamf Pro script (e.g. 'SPA - Install Chrome postinstall')."
}

variable "script_contents" {
  type        = string
  description = "Full shell script content (bash). Uploaded verbatim to Jamf Pro."
}

variable "priority" {
  type        = string
  default     = "After"
  description = "When the script runs relative to the package install: 'Before' or 'After'."

  validation {
    condition     = contains(["Before", "After"], var.priority)
    error_message = "priority must be 'Before' or 'After'."
  }
}

variable "os_requirements" {
  type        = string
  default     = ""
  description = "Optional OS version requirement string for the script record."
}

variable "info" {
  type        = string
  default     = ""
  description = "Short info string for the script record."
}

variable "notes" {
  type        = string
  default     = "Managed by SPA pipeline. Do not edit directly in Jamf."
  description = "Notes field for the script record."
}

variable "category_id" {
  type        = number
  default     = -1
  description = "Jamf category ID for the script. -1 = No category."
}
