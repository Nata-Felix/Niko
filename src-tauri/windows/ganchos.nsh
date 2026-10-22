!macro EncerrarProcessosDoNiko
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM niko.exe`
  Pop $0
  Sleep 800
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro EncerrarProcessosDoNiko
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro EncerrarProcessosDoNiko
!macroend
