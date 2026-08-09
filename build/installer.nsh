!macro customInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Drive\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\TermFlowLite.ContextMenu"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite" "MUIVerb" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"

  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite" "MUIVerb" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"

  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite" "MUIVerb" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"

  !insertmacro TermFlowLiteSeedMenu "Software\Classes\Directory\Background\shell\TermFlowLite\ExtendedSubCommandsKey"
  !insertmacro TermFlowLiteSeedMenu "Software\Classes\Directory\shell\TermFlowLite\ExtendedSubCommandsKey"
  !insertmacro TermFlowLiteSeedMenu "Software\Classes\Drive\Background\shell\TermFlowLite\ExtendedSubCommandsKey"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Drive\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\TermFlowLite.ContextMenu"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro TermFlowLiteSeedMenu ROOT
  WriteRegStr HKCU "${ROOT}\shell\000-default" "MUIVerb" "Default Profile"
  WriteRegStr HKCU "${ROOT}\shell\000-default" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "${ROOT}\shell\000-default\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\100-powershell" "MUIVerb" "PowerShell"
  WriteRegStr HKCU "${ROOT}\shell\100-powershell\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile powershell $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\101-cmd" "MUIVerb" "Command Prompt"
  WriteRegStr HKCU "${ROOT}\shell\101-cmd\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile cmd $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\200-claude" "MUIVerb" "Claude Code"
  WriteRegStr HKCU "${ROOT}\shell\200-claude\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile claude $\"%V$\"'
  WriteRegStr HKCU "${ROOT}\shell\201-codex" "MUIVerb" "Codex"
  WriteRegStr HKCU "${ROOT}\shell\201-codex\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" --profile codex $\"%V$\"'
!macroend
