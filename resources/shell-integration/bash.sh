# TermFlow shell integration for Git Bash / bash.
#
# Passed as `bash --rcfile <this file> -i`, so it replaces ~/.bashrc for the
# session TermFlow starts and nothing is written to the user's dotfiles. The
# user's own startup files are sourced first so their prompt/aliases still work.
# Login shells ignore --rcfile, so TermFlow starts a non-login shell and sets
# TERMFLOW_BASH_LOGIN=1; the login files are then sourced here instead.
#
# Emits the standard OSC 133 semantic-prompt sequences:
#   \033]133;A\007   prompt start
#   \033]133;B\007   command input start
#   \033]133;C\007   command output start (PS0, printed right before execution)
#   \033]133;D;$?\007 command finished (PROMPT_COMMAND, carries the exit code)
#   \033]7;file://host/path\007 current directory

if [ "$TERMFLOW_BASH_LOGIN" = "1" ]; then
  unset TERMFLOW_BASH_LOGIN
  if [ -f /etc/profile ]; then . /etc/profile; fi
  if [ -f "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then . "$HOME/.bash_login"
  elif [ -f "$HOME/.profile" ]; then . "$HOME/.profile"
  fi
else
  if [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc; fi
  if [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi
fi

if [ -z "$TERMFLOW_SHELL_INTEGRATION_DONE" ]; then
  TERMFLOW_SHELL_INTEGRATION_DONE=1

  # Git Bash reports MSYS paths (/c/Users/...): translate drive paths to
  # C:/Users/... and skip MSYS-only paths (/usr, /etc) that Windows can't open.
  __termflow_report_cwd() {
    local path=$PWD drive
    if [ -n "$MSYSTEM" ]; then
      case "$path" in
        /[a-zA-Z] | /[a-zA-Z]/*)
          drive=${path:1:1}
          path="/${drive^^}:${path:2}"
          ;;
        *) return 0 ;;
      esac
    fi
    printf '\033]7;file://%s%s\007' "${HOSTNAME:-localhost}" "$path"
  }

  __termflow_precmd() {
    local __termflow_exit=$?
    printf '\033]133;D;%s\007' "$__termflow_exit"
    __termflow_report_cwd
    return $__termflow_exit
  }

  # Prompt frameworks (starship, oh-my-posh, ...) rebuild PS1 inside
  # PROMPT_COMMAND, so the markers are re-applied as the very last step.
  __termflow_wrap_ps1() {
    local __termflow_exit=$?
    case "$PS1" in
      *'133;A'*) ;;
      *) PS1='\[\033]133;A\007\]'"$PS1"'\[\033]133;B\007\]' ;;
    esac
    return $__termflow_exit
  }

  # Prepend ours so the exit code is read before any other hook clobbers $?.
  if [ -n "$PROMPT_COMMAND" ]; then
    PROMPT_COMMAND="__termflow_precmd; $PROMPT_COMMAND; __termflow_wrap_ps1"
  else
    PROMPT_COMMAND="__termflow_precmd; __termflow_wrap_ps1"
  fi

  # \[ \] mark the sequences as zero-width so readline keeps line wrapping sane.
  PS1='\[\033]133;A\007\]'"$PS1"'\[\033]133;B\007\]'
  PS0='\033]133;C\007'
fi
