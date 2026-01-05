# Bash completion for centerstage CLI

_centerstage() {
    local cur prev commands
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    commands="restart status move focus swap swap-primary resize sidebar height layout ratio gap pbp pip shrink retile save restore help"

    case "$prev" in
        centerstage)
            COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
            ;;
        move)
            COMPREPLY=( $(compgen -W "left center right left-primary left-secondary" -- "$cur") )
            ;;
        focus)
            COMPREPLY=( $(compgen -W "left center right" -- "$cur") )
            ;;
        swap)
            COMPREPLY=( $(compgen -W "left right" -- "$cur") )
            ;;
        height)
            COMPREPLY=( $(compgen -W "up down" -- "$cur") )
            ;;
        layout)
            COMPREPLY=( $(compgen -W "single split obsidian-grid" -- "$cur") )
            ;;
        ratio|gap)
            COMPREPLY=( $(compgen -W "+ - 0.3 0.4 0.5 0.6 0.7" -- "$cur") )
            ;;
        retile)
            COMPREPLY=( $(compgen -W "left center right all" -- "$cur") )
            ;;
        *)
            ;;
    esac
}

complete -F _centerstage centerstage
