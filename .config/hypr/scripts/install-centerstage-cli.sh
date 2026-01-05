#!/bin/bash
# Install centerstage CLI to ~/.local/bin

set -e

SCRIPT_DIR="$HOME/.config/hypr/scripts"
BIN_DIR="$HOME/.local/bin"
COMPLETION_DIR="$HOME/.local/share/bash-completion/completions"

echo "Installing centerstage CLI..."

# Create directories if needed
mkdir -p "$BIN_DIR"
mkdir -p "$COMPLETION_DIR"

# Make main script executable
chmod +x "$SCRIPT_DIR/centerstage"

# Create symlink
ln -sf "$SCRIPT_DIR/centerstage" "$BIN_DIR/centerstage"
echo "Installed: $BIN_DIR/centerstage"

# Install bash completions
ln -sf "$SCRIPT_DIR/centerstage-completion.bash" "$COMPLETION_DIR/centerstage"
echo "Installed: $COMPLETION_DIR/centerstage"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo "NOTE: Add ~/.local/bin to your PATH by adding this to ~/.bashrc:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
fi

echo ""
echo "Done! Restart your shell or run:"
echo "  source $SCRIPT_DIR/centerstage-completion.bash"
echo ""
echo "Then try: centerstage <TAB>"
