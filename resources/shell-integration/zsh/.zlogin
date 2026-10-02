# TermFlow zsh shell integration: ZDOTDIR shim. Sources the user's own .zlogin
# from their real ZDOTDIR (last startup file of a login shell).
__termflow_zdotdir=$ZDOTDIR
ZDOTDIR=${TERMFLOW_USER_ZDOTDIR:-$HOME}
[[ -f $ZDOTDIR/.zlogin ]] && source $ZDOTDIR/.zlogin
# .zlogin is the last startup file: leave the user ZDOTDIR in place.
unset __termflow_zdotdir
