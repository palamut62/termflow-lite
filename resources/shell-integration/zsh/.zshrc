# TermFlow zsh shell integration (ZDOTDIR shim). The user's own .zshrc runs
# first; nothing is written to their dotfiles.
#
# Emits OSC 133 semantic-prompt sequences (A prompt start, B input start,
# C output start, D;<exit> finished) and OSC 7 for the current directory.
__termflow_zdotdir=$ZDOTDIR
ZDOTDIR=${TERMFLOW_USER_ZDOTDIR:-$HOME}
[[ -f $ZDOTDIR/.zshrc ]] && source $ZDOTDIR/.zshrc
# The user file may move ZDOTDIR itself (e.g. ~/.config/zsh): follow it.
TERMFLOW_USER_ZDOTDIR=$ZDOTDIR
# Interactive non-login shells never read .zlogin: restore the user ZDOTDIR now.
[[ -o login ]] && ZDOTDIR=$__termflow_zdotdir
unset __termflow_zdotdir

if [[ -z $TERMFLOW_SHELL_INTEGRATION_DONE ]]; then
  TERMFLOW_SHELL_INTEGRATION_DONE=1
  typeset -gi __termflow_in_command=0

  __termflow_precmd() {
    local exit_code=$?
    if (( __termflow_in_command )); then
      print -n "\e]133;D;${exit_code}\a"
    fi
    __termflow_in_command=0
    print -n "\e]7;file://${HOST}${PWD}\a"
    # Prompt themes may rebuild PS1 every time: re-apply the markers.
    if [[ $PS1 != *'133;A'* ]]; then
      PS1=$'%{\e]133;A\a%}'"$PS1"$'%{\e]133;B\a%}'
    fi
    return $exit_code
  }

  __termflow_preexec() {
    __termflow_in_command=1
    print -n "\e]133;C\a"
  }

  # Ours first, so $? is read before any other hook clobbers it.
  precmd_functions=(__termflow_precmd $precmd_functions)
  preexec_functions+=(__termflow_preexec)
fi
