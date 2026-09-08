!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\jaswa-helper.exe" 0 done
    MessageBox MB_ICONINFORMATION|MB_OKCANCEL "JASWA Helper will close while this update is installed. Click OK to continue." IDOK closeHelper
    Abort
  closeHelper:
    nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /T /IM jaswa-helper.exe'
    Pop $0
    Pop $1
    ${If} $0 != 0
    ${AndIf} $0 != 128
      MessageBox MB_ICONSTOP "JASWA Helper could not be closed for this update. Close it and retry."
      Abort
    ${EndIf}
    ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup' $0
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "JASWA Helper could not clean up its local redirect. Close the helper and retry."
      Abort
    ${EndIf}
  done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_ICONINFORMATION|MB_OKCANCEL "JASWA Helper will close before it is removed. Click OK to continue." IDOK closeHelper
  Abort
  closeHelper:
  nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /T /IM jaswa-helper.exe'
  Pop $0
  Pop $1
  ${If} $0 != 0
  ${AndIf} $0 != 128
    MessageBox MB_ICONSTOP "JASWA Helper could not be closed for removal. Close it and retry."
    Abort
  ${EndIf}
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Remove JASWA Helper's local certificate?$\r$\n$\r$\nChoose No to keep it for a later reinstallation." IDYES removeCertificate
  ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup' $0
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "JASWA Helper could not clean up its local redirect. Close the helper and retry."
      Abort
    ${EndIf}
  Goto done
  removeCertificate:
    ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup --jaswa-remove-certificate' $0
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "JASWA Helper could not remove its local certificate or redirect. Close the helper and retry."
      Abort
    ${EndIf}
  done:
!macroend
