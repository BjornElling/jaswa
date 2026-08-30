!include LogicLib.nsh

!macro customInstall
  ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" "--jaswa-installed"
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "JASWA Helper was installed, but Windows could not start it. Open JASWA Helper from the Start menu to try again."
  ${EndIf}
!macroend

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
