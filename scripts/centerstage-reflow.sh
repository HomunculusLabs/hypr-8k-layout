#!/bin/bash
# Reflow all zones on one workspace together (used after window closures).
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
source "$HOME/.config/hypr/scripts/centerstage-plan.sh"
WORKSPACE="${1:-}"
[[ "$WORKSPACE" =~ ^[1-3]$ ]] || exit 1
centerstage_begin || exit 1
for zone in left center right; do
    centerstage_plan_zone "$zone" "$WORKSPACE" || exit 1
done
centerstage_commit
