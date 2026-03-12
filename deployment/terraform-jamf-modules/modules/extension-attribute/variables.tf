variable "name" {
  type        = string
  description = "Extension attribute name (e.g. 'SPA - Google Chrome Version')."
}

variable "description" {
  type        = string
  default     = "Reports installed application version. Managed by SPA pipeline."
}

variable "receipt_id" {
  type        = string
  description = "macOS pkgutil receipt ID (e.g. 'com.google.chrome')."
}
