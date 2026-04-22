#!/usr/bin/env bash
# =============================================================================
# extension-attribute.sh — Jamf Extension Attribute
# Returns the installed version of Google Chrome Test for inventory reporting.
# Upload this script to Jamf Pro > Settings > Extension Attributes.
# =============================================================================

APP_PATH="/Applications/TODO.app"  # TODO: Update with actual app path
PLIST_KEY="CFBundleShortVersionString"

if [[ -d "$APP_PATH" ]]; then
    version=$(defaults read "$APP_PATH/Contents/Info" "$PLIST_KEY" 2>/dev/null)
    if [[ -n "$version" ]]; then
        echo "<result>$version</result>"
    else
        echo "<result>Installed (version unknown)</result>"
    fi
else
    echo "<result>Not Installed</result>"
fi
