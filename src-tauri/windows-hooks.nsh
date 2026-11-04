!macro NSIS_HOOK_PREUNINSTALL
  ; Both names are reserved exclusively for this application.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SCULPY Companion"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "sculpy-desktop-companion"
!macroend
