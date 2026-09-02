# JASWA Helper

The helper is a Tauri Windows application: its small Rust core reads the local
game connection and its React dashboard runs on Windows' WebView2 runtime.
The installer uses WebView2's `downloadBootstrapper`, so it does not bundle a
second browser runtime when Windows already provides one.

The helper needs elevation to add its local certificate and temporary
loopback gateway entries. Tauri reduces installer size; Authenticode signing
is still essential for Windows trust and reputation.

Its installer is deliberately not produced unless both the helper executable
and installer receive a valid, timestamped Authenticode signature from a
trusted publisher certificate.

Set `JASWA_SIGNING_THUMBPRINT` to that certificate's SHA-1 thumbprint, then
run:

```powershell
npm run package
```

The packager finds the x64 `signtool.exe` from an installed Windows SDK. Set
`JASWA_SIGNTOOL_PATH` only when the SDK lives elsewhere.

The command asks Tauri to sign the helper executable, uninstaller and generated
installer, verifies the installer, then writes it to
`public/JASWA-Helper-Setup.exe`. Never distribute a manually built, unsigned
installer. A new signed release must also be scanned by Microsoft Defender and
submitted to Microsoft as a false positive if Defender blocks it.
