# Bash completion for centerstage CLI

_centerstage() {
    local cur prev commands
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    commands="restart status move focus swap swap-primary resize sidebar height layout ratio gap pbp pip shrink retile save restore startup help"

    case "$prev" in
        centerstage)
            COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
            ;;
        move)
            COMPREPLY=( $(compgen -W "left center right left-primary left-secondary right-primary right-secondary" -- "$cur") )
            ;;
        focus)
            COMPREPLY=( $(compgen -W "0 1 2 3 4 5 6 7 8 9 center" -- "$cur") )
            ;;
        swap)
            COMPREPLY=( $(compgen -W "up down left right" -- "$cur") )
            ;;
        ratio|gap)
            COMPREPLY=( $(compgen -W "increase decrease + -" -- "$cur") )
            ;;
        pip)
            COMPREPLY=( $(compgen -W "tr tl br bl" -- "$cur") )
            ;;
        tr|tl|br|bl)
            COMPREPLY=( $(compgen -W "small medium large" -- "$cur") )
            ;;
        retile)
            COMPREPLY=( $(compgen -W "left center right all" -- "$cur") )
            ;;
        *)
            ;;
    esac
}

complete -F _centerstage centerstage
