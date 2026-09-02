# JASWA Helper

The helper is a Tauri Windows application: its small Rust core reads the local
game connection and its React dashboard runs on Windows' WebView2 runtime.
The installer uses WebView2's `downloadBootstrapper`, so it does not bundle a
second browser runtime when Windows already provides one.

The helper needs elevation to add its local certificate and temporary
loopback gateway entries. Tauri reduces installer size; Authenticode signing
is still essential for Windows trust and reputation.

## Running it locally

```powershell
npm start
```

`npm start` is the only supported way to run a development build. It starts the
Vite dev server and the Rust core together, because a debug binary loads its
dashboard from `http://localhost:1420` rather than from the executable.

Launching a binary built by `cargo` on its own therefore shows WebView2's
`ERR_CONNECTION_REFUSED` page instead of the dashboard — a window that looks
broken while the Rust core behind it is serving normally.

`--release` does not change that, which is the surprising part: `tauri build`
embeds the dashboard by passing `TAURI_CONFIG` without `devUrl`, and a bare
`cargo build` never sets it. Build a standalone helper with `npm run build`
(or `npx tauri build --no-bundle` to skip the installer), never with `cargo`
directly.

Stopping the helper from Task Manager skips its cleanup, which leaves the
loopback gateway entries in the Windows hosts file. A running game then has
nowhere to reach until a helper takes those ports back, so quit it from its
tray icon and start the replacement promptly.

## Tests

```powershell
npm test
```

This runs `verify:command-contract` and then the Rust tests. The contract check
guards the boundary neither compiler can see: the dashboard renders whatever a
command returns as text, so a command answering with an object unmounts the
dashboard and empties the window.

`npm run verify:dashboard-flow` drives that flow in a real browser — it accepts
the traffic warning and checks the window still holds its controls. It needs
`npm run frontend:dev` running and Playwright from the repository root, so it
stays out of `npm test` and is run when the dashboard changes.

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
