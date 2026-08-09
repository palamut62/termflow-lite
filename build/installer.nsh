!macro customInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Drive\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\TermFlowLite.ContextMenu"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.000-default"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.100-powershell"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.101-cmd"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.200-claude"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.201-codex"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite" "MUIVerb" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite" "SubCommands" ""

  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite" "MUIVerb" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite" "SubCommands" ""

  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite" "MUIVerb" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite" "SubCommands" ""

  !insertmacro TermFlowLiteSeedMenu "Software\Classes\Directory\Background\shell\TermFlowLite"
  !insertmacro TermFlowLiteSeedMenu "Software\Classes\Directory\shell\TermFlowLite"
  !insertmacro TermFlowLiteSeedMenu "Software\Classes\Drive\Background\shell\TermFlowLite"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Drive\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\TermFlowLite.ContextMenu"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.000-default"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.100-powershell"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.101-cmd"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.200-claude"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\TermFlowLite.201-codex"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro TermFlowLiteSeedMenu ROOT
  WriteRegStr HKCU "${ROOT}\shell\000-default" "MUIVerb" "Default Profile"
  WriteRegStr HKCU "${ROOT}\shell\000-default" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "${ROOT}\shell\000-default\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\100-powershell" "MUIVerb" "PowerShell"
  WriteRegExpandStr HKCU "${ROOT}\shell\100-powershell" "Icon" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe,0"
  WriteRegStr HKCU "${ROOT}\shell\100-powershell\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile powershell $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\101-cmd" "MUIVerb" "Command Prompt"
  WriteRegExpandStr HKCU "${ROOT}\shell\101-cmd" "Icon" "%SystemRoot%\System32\cmd.exe,0"
  WriteRegStr HKCU "${ROOT}\shell\101-cmd\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile cmd $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\200-claude" "MUIVerb" "Claude Code"
  WriteRegStr HKCU "${ROOT}\shell\200-claude" "Icon" "$INSTDIR\resources\resources\menu-icons\claude.ico"
  WriteRegStr HKCU "${ROOT}\shell\200-claude\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile claude $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\201-codex" "MUIVerb" "Codex"
  WriteRegStr HKCU "${ROOT}\shell\201-codex" "Icon" "$INSTDIR\resources\resources\menu-icons\codex.ico"
  WriteRegStr HKCU "${ROOT}\shell\201-codex\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile codex $\"%V$\"'
!macroend
