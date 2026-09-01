# JASWA Helper native build

The helper is a single native Windows executable. It uses Windows for its
notification-area menu, elevation, certificate store and installer; Electron,
Chromium and Node are not part of the distributed program.

Build the release installer with `npm run package` from `helper/`. It requires
the Rust stable toolchain, a supported Windows C/C++ linker, and NSIS in
`PATH` (or `NSIS_MAKENSIS` set to `makensis.exe`).

`cargo test --manifest-path native/Cargo.toml` tests the protocol boundary,
profile ownership/update rules and local traffic-recording contract.
