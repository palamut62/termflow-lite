# TermFlow zsh shell integration: ZDOTDIR shim. Sources the user's own .zprofile
# from their real ZDOTDIR, then points ZDOTDIR back here for the next file.
__termflow_zdotdir=$ZDOTDIR
ZDOTDIR=${TERMFLOW_USER_ZDOTDIR:-$HOME}
[[ -f $ZDOTDIR/.zprofile ]] && source $ZDOTDIR/.zprofile
# The user file may move ZDOTDIR itself (e.g. ~/.config/zsh): follow it.
TERMFLOW_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$__termflow_zdotdir
unset __termflow_zdotdir
