#!/bin/bash
# Retile one zone on a managed workspace in a single compositor update.
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
source "$HOME/.config/hypr/scripts/centerstage-plan.sh"

ZONE="${1:-center}"
WORKSPACE="${2:-1}"
[[ "$ZONE" =~ ^(left|center|right)$ && "$WORKSPACE" =~ ^[1-3]$ ]] || exit 1
centerstage_begin || exit 1
centerstage_plan_zone "$ZONE" "$WORKSPACE" || exit 1
centerstage_commit
