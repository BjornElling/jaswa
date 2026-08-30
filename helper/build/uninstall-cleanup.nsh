!include LogicLib.nsh

/* The helper owns machine-wide state: a hosts-file block that points the game's
   gateway names at loopback. A hard taskkill of a running instance, an upgrade,
   or a failed install must never leave that block behind, because the game
   cannot reach its servers while it is there. Every path therefore runs the
   helper's own cleanup before the new files land. */
!macro jaswaCleanup executable
  ${If} ${FileExists} "${executable}"
    nsExec::ExecToLog '"${executable}" --jaswa-cleanup'
    Pop $0
  ${EndIf}
!macroend

!macro customInit
  /* electron-builder stops a running instance with taskkill, so the helper's
     own shutdown never runs. Clean up with the outgoing build while it is still
     on disk; reinstalling over a running helper otherwise strands the block. */
  !insertmacro jaswaCleanup "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend

!macro customInstall
  /* StdUtils.ExecShellAsUser reports a status string ("ok", "error", "timeout",
     "unsupported"), never a numeric exit code, and it only says whether the
     shell accepted the request. Anything about how the helper itself fared has
     to come from the helper, which reports its own startup failures. */
  ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--jaswa-installed"
  ${If} $0 != "ok"
    MessageBox MB_OK|MB_ICONEXCLAMATION "JASWA Helper was installed, but Windows could not start it. Open JASWA Helper from the Start menu to try again."
  ${EndIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Remove JASWA Helper's local certificate?$\n$\nChoose No to keep it for a later reinstallation." IDYES removeCertificate
    nsExec::ExecToLog '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --jaswa-cleanup'
    Pop $0
    Goto cleanupComplete
  removeCertificate:
    nsExec::ExecToLog '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --jaswa-cleanup --jaswa-remove-certificate'
    Pop $0
  cleanupComplete:
  ${else}
    /* An upgrade keeps the certificate, but the outgoing instance was killed
       without running its own shutdown, so its hosts block still has to go. */
    !insertmacro jaswaCleanup "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${endIf}
!macroend
