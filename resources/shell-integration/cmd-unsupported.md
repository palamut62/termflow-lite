# Why cmd.exe has no shell integration

CMD is deliberately marked **unsupported** for OSC 133 shell integration.

`cmd.exe` can print an escape sequence from its prompt (`PROMPT $E]133;A$E\`
works on modern Windows builds), so the *prompt start* half is technically
reachable. The other half is not:

- There is no pre-exec / post-exec hook. `PROMPT` is expanded only when the
  prompt is drawn, so `133;C` (output start) can never be emitted at the moment
  a command actually starts.
- `%ERRORLEVEL%` is expanded when the prompt string is *set*, not when it is
  printed, so `133;D;<exitcode>` would always report a stale code. There is no
  supported way to make the prompt re-evaluate it per command.
- DOSKEY macros cannot wrap arbitrary command lines, so there is no injection
  point either.

The result would be a badge that lies about exit codes — worse than no badge.
CMD therefore keeps its current, untouched spawn path even when shell
integration is enabled; use PowerShell, pwsh or Git Bash instead.
