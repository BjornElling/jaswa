!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\jaswa-helper.exe" 0 done
    ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup'
  done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Remove JASWA Helper's local certificate?$\r$\n$\r$\nChoose No to keep it for a later reinstallation." IDYES removeCertificate
  ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup'
  Goto done
  removeCertificate:
    ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup --jaswa-remove-certificate'
  done:
!macroend
