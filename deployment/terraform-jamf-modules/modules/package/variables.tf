variable "package_name" {
  type        = string
  description = "Display name for the Jamf Pro package (e.g. 'Google Chrome 134.0')."
}

variable "package_file_source" {
  type        = string
  description = "Path to the .pkg or .dmg file, or an HTTP(S) URL."
}

variable "category_id" {
  type        = string
  default     = "-1"
  description = "Jamf Pro category ID. Use '-1' for no category."
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

variable "os_requirements" {
  type        = string
  default     = ""
  description = "Comma-separated OS requirements (e.g. 'macOS 13.0, macOS 14.0')."
}

variable "upload_timeout" {
  type        = string
  default     = "90m"
  description = "Terraform create timeout for package upload."
}
