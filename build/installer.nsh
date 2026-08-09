!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite" "" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TermFlowLite\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" $\"%V$\"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite" "" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\shell\TermFlowLite\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" $\"%1$\"'

  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite" "" "Open in TermFlow Lite"
  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite" "Icon" "$INSTDIR\TermFlow Lite.exe,0"
  WriteRegStr HKCU "Software\Classes\Drive\Background\shell\TermFlowLite\command" "" '$\"$INSTDIR\TermFlow Lite.exe$\" $\"%V$\"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\TermFlowLite"
  DeleteRegKey HKCU "Software\Classes\Drive\Background\shell\TermFlowLite"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
