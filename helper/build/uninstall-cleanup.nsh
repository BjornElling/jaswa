!include LogicLib.nsh

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Remove JASWA Helper's local certificate?\n\nChoose No to keep it for a later reinstallation." IDYES removeCertificate
    nsExec::ExecToLog '"$INSTDIR\JASWA Helper.exe" --jaswa-cleanup'
    Goto cleanupComplete
  removeCertificate:
    nsExec::ExecToLog '"$INSTDIR\JASWA Helper.exe" --jaswa-cleanup --jaswa-remove-certificate'
  cleanupComplete:
  ${endIf}
!macroend
