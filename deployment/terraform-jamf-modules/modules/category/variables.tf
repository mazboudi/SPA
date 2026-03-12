variable "name" {
  type        = string
  description = "Jamf Pro category name (e.g. 'Browsers')."
}

variable "priority" {
  type        = number
  default     = 9
  description = "Category priority in Jamf Pro (1-20). Lower is higher priority."
}
