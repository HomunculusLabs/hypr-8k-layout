# If not running interactively, don't do anything (leave this at the top of this file)
[[ $- != *i* ]] && return

# All the default Omarchy aliases and functions
# (don't mess with these directly, just overwrite them here!)
source ~/.local/share/omarchy/default/bash/rc

# Add your own exports, aliases, and functions here.
#
# Make an alias for invoking commands you use constantly
# alias p='python'

# opencode
export PATH=/home/t3rpz/.opencode/bin:$PATH

# Custom aliases for productivity
alias ll='ls -la --color=auto'
alias la='ls -A --color=auto'
alias l='ls -CF --color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

# System monitoring aliases
alias sysinfo='fastfetch'
alias weather='curl -s "https://wttr.in/?format=3"'
alias weather-detailed='curl -s "https://wttr.in"'
alias top='btop'
alias htop='btop'

# Development aliases
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gd='git diff'
alias gco='git checkout'
alias glog='git log --oneline --graph --decorate'

# Wallpaper management aliases
alias wallpaper-random='wallpaper random'
alias wallpaper-list='wallpaper list'
alias wallpaper-current='wallpaper current'

# Hyprland aliases
alias hypr-reload='hyprctl reload'
alias hypr-config='ghostty ~/.config/hypr/hyprland.conf'
alias waybar-config='ghostty ~/.config/waybar/config.jsonc'

# Quick directory navigation
alias dev='cd ~/Work'
alias config='cd ~/.config'
alias downloads='cd ~/Downloads'

# Useful functions
mkcd() {
    mkdir -p "$1" && cd "$1"
}

extract() {
    if [ -f "$1" ]; then
        case "$1" in
            *.tar.bz2)   tar xjf "$1"     ;;
            *.tar.gz)    tar xzf "$1"     ;;
            *.bz2)       bunzip2 "$1"     ;;
            *.rar)       unrar x "$1"     ;;
            *.gz)        gunzip "$1"      ;;
            *.tar)       tar xf "$1"      ;;
            *.tbz2)      tar xjf "$1"     ;;
            *.tgz)       tar xzf "$1"     ;;
            *.zip)       unzip "$1"       ;;
            *.Z)         uncompress "$1"  ;;
            *.7z)        7z x "$1"        ;;
            *)           echo "'$1' cannot be extracted via extract()" ;;
        esac
    else
        echo "'$1' is not a valid file"
    fi
}

# Quick search function
search() {
    find . -name "*$1*" 2>/dev/null
}

# System cleanup function
cleanup() {
    echo "Cleaning package cache..."
    sudo pacman -Scc --noconfirm
    echo "Cleaning temporary files..."
    rm -rf ~/.cache/*
    echo "Cleanup complete!"
}
