Unicode true
RequestExecutionLevel admin
Name "JASWA Helper"
OutFile "..\..\public\JASWA-Helper-Setup.exe"
InstallDir "$PROGRAMFILES64\JASWA Helper"
ShowInstDetails nevershow
ShowUninstDetails nevershow

Section "Install"
  IfFileExists "$INSTDIR\jaswa-helper.exe" 0 +2
    ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup'
  SetOutPath "$INSTDIR"
  File "target\release\jaswa-helper.exe"
  CreateDirectory "$SMPROGRAMS\JASWA Helper"
  CreateShortcut "$SMPROGRAMS\JASWA Helper\JASWA Helper.lnk" "$INSTDIR\jaswa-helper.exe"
  CreateShortcut "$SMPROGRAMS\JASWA Helper\Uninstall JASWA Helper.lnk" "$INSTDIR\Uninstall JASWA Helper.exe"
  WriteUninstaller "$INSTDIR\Uninstall JASWA Helper.exe"
  ExecShell "open" "$INSTDIR\jaswa-helper.exe" "--jaswa-installed"
SectionEnd

Section "Uninstall"
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Remove JASWA Helper's local certificate?$\r$\n$\r$\nChoose No to keep it for a later reinstallation." IDYES removeCertificate
  ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup'
  Goto cleanupComplete
removeCertificate:
  ExecWait '"$INSTDIR\jaswa-helper.exe" --jaswa-cleanup --jaswa-remove-certificate'
cleanupComplete:
  Delete "$INSTDIR\jaswa-helper.exe"
  Delete "$INSTDIR\Uninstall JASWA Helper.exe"
  Delete "$SMPROGRAMS\JASWA Helper\JASWA Helper.lnk"
  Delete "$SMPROGRAMS\JASWA Helper\Uninstall JASWA Helper.lnk"
  RMDir "$SMPROGRAMS\JASWA Helper"
  RMDir "$INSTDIR"
SectionEnd
