##=============================================================================
## modules/extension-attribute/main.tf
## Creates a Jamf Pro computer extension attribute for version tracking.
##=============================================================================

terraform {
  required_providers {
    jamfpro = {
      source  = "danjamf/jamfpro"
      version = "~> 0.16"
    }
  }
}

resource "jamfpro_computer_extension_attribute" "this" {
  name              = var.name
  description       = var.description
  data_type         = "String"
  input_type        = "script"
  enabled           = true

  # Shell script to detect and report the installed version
  # Uses detect-receipt.sh pattern — reads from pkgutil
  script_contents   = <<-SCRIPT
    #!/bin/bash
    RECEIPT="${var.receipt_id}"
    VERSION=$(pkgutil --pkg-info "$RECEIPT" 2>/dev/null | awk '/version:/{print $2}')
    if [[ -n "$VERSION" ]]; then
      echo "<result>$VERSION</result>"
    else
      echo "<result>NOT INSTALLED</result>"
    fi
  SCRIPT
}

output "id" {
  value       = jamfpro_computer_extension_attribute.this.id
  description = "Jamf Pro extension attribute ID."
}
