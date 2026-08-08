# TermFlow shell integration for Git Bash / bash.
#
# Passed as `bash --rcfile <this file> -i`, so it replaces ~/.bashrc for the
# session TermFlow starts and nothing is written to the user's dotfiles. The
# user's own startup files are sourced first so their prompt/aliases still work.
#
# Emits the standard OSC 133 semantic-prompt sequences:
#   \033]133;A\007   prompt start
#   \033]133;B\007   command input start
#   \033]133;C\007   command output start (PS0, printed right before execution)
#   \033]133;D;$?\007 command finished (PROMPT_COMMAND, carries the exit code)

if [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc; fi
if [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi

if [ -z "$TERMFLOW_SHELL_INTEGRATION_DONE" ]; then
  TERMFLOW_SHELL_INTEGRATION_DONE=1

  __termflow_precmd() {
    local __termflow_exit=$?
    printf '\033]133;D;%s\007' "$__termflow_exit"
    return $__termflow_exit
  }

  # Prepend ours so the exit code is read before any other hook clobbers $?.
  if [ -n "$PROMPT_COMMAND" ]; then
    PROMPT_COMMAND="__termflow_precmd; $PROMPT_COMMAND"
  else
    PROMPT_COMMAND="__termflow_precmd"
  fi

  # \[ \] mark the sequences as zero-width so readline keeps line wrapping sane.
  PS1='\[\033]133;A\007\]'"$PS1"'\[\033]133;B\007\]'
  PS0='\033]133;C\007'

  export PROMPT_COMMAND PS1 PS0
fi
