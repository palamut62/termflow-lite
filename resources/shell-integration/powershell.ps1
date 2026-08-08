# TermFlow shell integration for Windows PowerShell 5.1 and PowerShell 7 (pwsh).
#
# Dot-sourced into the session TermFlow itself starts (via -NoExit -Command);
# it is NEVER written to $PROFILE, so nothing survives the session.
#
# Emits the standard OSC 133 "semantic prompt" sequences plus the VS Code
# OSC 633;E command-line report:
#   ESC ] 133 ; A BEL   prompt start
#   ESC ] 133 ; B BEL   command input start
#   ESC ] 133 ; C BEL   command output start (about to execute)
#   ESC ] 133 ; D ; <exitcode> BEL   command finished
#
# Everything is wrapped in try/catch: a broken integration must never break the
# user's shell.

if ($env:TERMFLOW_SHELL_INTEGRATION -eq 'done') { return }
$env:TERMFLOW_SHELL_INTEGRATION = 'done'

try {
  $Global:__TermFlowESC = [char]27
  $Global:__TermFlowBEL = [char]7

  # Keep the user's own prompt intact and wrap it.
  $Global:__TermFlowOriginalPrompt = $function:Prompt

  function Global:__TermFlow-Escape([string]$value) {
    if ($null -eq $value) { return '' }
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in $value.ToCharArray()) {
      $code = [int]$c
      if ($c -eq '\') { [void]$sb.Append('\\') }
      elseif ($c -eq ';' -or $code -lt 32 -or $code -eq 127) {
        [void]$sb.Append('\x' + $code.ToString('X2'))
      } else { [void]$sb.Append($c) }
    }
    return $sb.ToString()
  }

  function Global:Prompt {
    # $? and $LASTEXITCODE must be read first: anything below clobbers them.
    $succeeded = $?
    $lastExit = $global:LASTEXITCODE
    if ($null -eq $lastExit) { $lastExit = 0 }
    $exitCode = if ($lastExit -ne 0) { $lastExit } elseif ($succeeded) { 0 } else { 1 }

    $esc = $Global:__TermFlowESC
    $bel = $Global:__TermFlowBEL
    $out = ''
    try {
      if ($Global:__TermFlowSawCommand -or $Global:__TermFlowNoHook) {
        $out += "$esc]133;D;$exitCode$bel"
        $Global:__TermFlowSawCommand = $false
      }
      $out += "$esc]133;A$bel"
    } catch { }

    $userPrompt = ''
    try { $userPrompt = [string](& $Global:__TermFlowOriginalPrompt) } catch { $userPrompt = "PS $(Get-Location)> " }
    $out += $userPrompt
    $out += "$esc]133;B$bel"

    # Restore the pipeline state the user's next command expects.
    $global:LASTEXITCODE = $lastExit
    return $out
  }

  # PSReadLine (present in both 5.1 and 7 by default) calls
  # PSConsoleHostReadLine to read the command line. Wrapping it gives an exact
  # "user pressed Enter, execution starts now" hook for OSC 133;C.
  if (Test-Path Function:\PSConsoleHostReadLine) {
    $Global:__TermFlowOriginalReadLine = $function:PSConsoleHostReadLine
    function Global:PSConsoleHostReadLine {
      $command = & $Global:__TermFlowOriginalReadLine
      try {
        $esc = $Global:__TermFlowESC
        $bel = $Global:__TermFlowBEL
        $Global:__TermFlowSawCommand = $true
        $payload = "$esc]633;E;$(__TermFlow-Escape $command)$bel$esc]133;C$bel"
        [Console]::Write($payload)
      } catch { }
      return $command
    }
  } else {
    # No PSReadLine: without a read hook there is no reliable pre-exec point,
    # so command boundaries fall back to prompt-to-prompt (D still carries the
    # real exit code).
    $Global:__TermFlowNoHook = $true
  }
} catch {
  # Integration failed to install — the shell keeps working unchanged.
}
