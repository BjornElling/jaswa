'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, dialog, Menu, nativeImage, shell, Tray } = require('electron');
const { serializeProfile, suggestedExportPath, withJsonExtension } = require('./profile-export.cjs');
const { diagnosticPath, recordDiagnostic } = require('./diagnostics.cjs');
const { AdministratorPermissionError, CertificateInstallationDeclinedError, CertificateInstallationError, GatewayPortError, PortUnavailableError, cleanup, reportStartupError, start } = require('./service.cjs');
const { setStartsWithWindows, startsWithWindows } = require('./startup.cjs');

let helper;
let tray;
let quitting = false;
const uninstallerName = 'Uninstall JASWA Helper.exe';

function iconPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'favicon.ico') : path.join(__dirname, '..', '..', 'public', 'favicon.ico');
}

async function downloadJson() {
  const content = serializeProfile(helper?.profile());
  if (!content) return;
  try {
    const result = await dialog.showSaveDialog({
      title: 'Download JSON',
      defaultPath: suggestedExportPath(app.getPath('downloads')),
      filters: [{ name: 'JSON files', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return;
    await fs.writeFile(withJsonExtension(result.filePath), content, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The file could not be written.';
    dialog.showErrorBox('Could not download JSON', `JASWA Helper could not save the JSON file.\n\n${detail}`);
  }
}

async function openLogFile(file, title) {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, '', 'utf8');
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The file could not be opened.';
    dialog.showErrorBox(`Could not open ${title}`, `JASWA Helper could not open its ${title}.\n\n${detail}`);
  }
}

async function openTrafficLog() {
  const log = helper?.trafficLog;
  if (!log) return;
  /* The newest lines are still queued while recording. Flush first, or the
     user opens the file and finds the exchange they just made missing. */
  await log.flush();
  await openLogFile(log.file(), 'traffic log');
}

/* Recording is deliberately a decision, not a switch. It writes the account
   data the game sent — monsters, runes, artifacts — in the clear, so the user
   should know what the file holds before it exists. */
async function confirmTrafficLogging() {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Log all traffic',
    message: 'Record everything Summoners War sends to this computer?',
    detail: 'This writes each decoded exchange to a file on this computer, for investigating what the helper can read. It includes your account data and is never uploaded. Recording starts a new file and stops when you switch it off or quit.',
    buttons: ['Cancel', 'Start recording'],
    defaultId: 0,
    cancelId: 0,
  });
  return result.response === 1;
}

async function setTrafficLogging(wanted) {
  const log = helper?.trafficLog;
  if (!log) return;
  if (wanted && !await confirmTrafficLogging()) return refreshMenu();
  log.setEnabled(wanted);
  if (!wanted) await log.flush();
  refreshMenu();
}

async function uninstallHelper() {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Uninstall JASWA Helper',
    message: 'Uninstall JASWA Helper?',
    detail: 'This removes the helper program from Windows. Your game data in JASWA stays in the browser.',
    buttons: ['Cancel', 'Uninstall'],
    defaultId: 0,
    cancelId: 0,
  });
  if (result.response !== 1) return;

  await helper?.stop();
  const error = await shell.openPath(path.join(path.dirname(app.getPath('exe')), uninstallerName));
  if (error) {
    dialog.showErrorBox('Could not start uninstall', `JASWA Helper could not start its uninstaller.\n\n${error}`);
    return;
  }
  app.quit();
}

function refreshMenu() {
  const status = helper?.status();
  const trafficStatus = helper?.trafficLog?.status();
  const error = status?.lastError;
  const detail = error ? 'Connection needs attention' : status?.profileReady ? `Snapshot ready · ${status.source === 'live' ? 'live sync' : 'game start'}` : status?.restartRequired ? 'Restart Summoners War to connect' : 'Waiting for Summoners War';
  tray.setToolTip(`JASWA Helper — ${detail}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'JASWA Helper', enabled: false },
    { label: detail, enabled: false },
    { type: 'separator' },
    { label: 'Open JASWA', click: () => void shell.openExternal('http://localhost:3000') },
    { label: 'Download JSON', enabled: Boolean(status?.hasProfile), click: () => void downloadJson() },
    { label: 'Open diagnostic log', click: () => void openLogFile(diagnosticPath(), 'diagnostic log') },
    { type: 'separator' },
    {
      /* A log that stopped writing looks identical to a quiet game, so the
         count, the limit and any write failure belong on the label itself. */
      label: !trafficStatus?.enabled ? 'Log all traffic'
        : trafficStatus.lastError ? 'Log all traffic — could not write'
          : trafficStatus.full ? `Log all traffic — limit reached (${trafficStatus.entries})`
            : `Log all traffic — recording (${trafficStatus.entries})`,
      type: 'checkbox',
      checked: Boolean(trafficStatus?.enabled),
      click: (item) => void setTrafficLogging(item.checked),
    },
    /* The recording stays readable after it is switched off — that is when a
       user goes looking for it — so this follows the file, not the switch. */
    { label: 'Open traffic log', enabled: Boolean(trafficStatus?.entries || trafficStatus?.recorded), click: () => void openTrafficLog() },
    {
      label: 'Start JASWA Helper with Windows',
      type: 'checkbox',
      checked: startsWithWindows(app),
      enabled: app.isPackaged,
      click: (item) => {
        try { setStartsWithWindows(app, item.checked); refreshMenu(); }
        catch (error) {
          const detail = error instanceof Error ? error.message : 'Windows could not change the startup setting.';
          dialog.showErrorBox('Could not change startup', `JASWA Helper could not update its startup setting.\n\n${detail}`);
        }
      },
    },
    { type: 'separator' },
    { label: 'Uninstall JASWA Helper', enabled: app.isPackaged, click: () => void uninstallHelper() },
    { label: 'Quit', click: () => void helper.stop().finally(() => app.quit()) },
  ]));
}

async function showStartupFailure(error) {
  await reportStartupError(error);
  const detail = error instanceof Error ? error.message : String(error);
  if (error instanceof AdministratorPermissionError) {
    dialog.showErrorBox('Administrator permission was not granted', `JASWA Helper needs administrator permission to prepare its local connection, so setup stopped before the helper could appear in the taskbar. Run the JASWA Helper installer again and approve the Windows prompt.\n\n${detail}\n\nDetails were saved locally in:\n\n${diagnosticPath()}`);
  } else if (error instanceof CertificateInstallationDeclinedError) {
    dialog.showErrorBox('Certificate installation was cancelled', `JASWA Helper cannot run without its local certificate, so setup stopped before the helper could appear in the taskbar. Run the JASWA Helper installer again and choose Install certificate.\n\nDetails were saved locally in:\n\n${diagnosticPath()}`);
  } else if (error instanceof CertificateInstallationError) {
    dialog.showErrorBox('Could not install the JASWA Helper certificate', `JASWA Helper cannot run without its local certificate, so setup stopped before the helper could appear in the taskbar.\n\n${detail}\n\nDetails were saved locally in:\n\n${diagnosticPath()}`);
  } else if (error instanceof GatewayPortError || error instanceof PortUnavailableError) {
    dialog.showErrorBox('A local port is already in use', `${detail}\n\nClose the other program and open JASWA Helper from the Start menu again.\n\nDetails were saved locally in:\n\n${diagnosticPath()}`);
  } else {
    dialog.showErrorBox('JASWA Helper could not start', `The helper stopped before it could appear in the taskbar.\n\n${detail}\n\nDetails were saved locally in:\n\n${diagnosticPath()}`);
  }
  quitting = true;
  app.exit(1);
}

async function confirmCertificateInstallation() {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Install the JASWA Helper certificate',
    message: 'JASWA Helper needs to install its local certificate.',
    detail: 'This lets it read Summoners War safely on this computer. The helper cannot run without it.',
    buttons: ['Cancel setup', 'Install certificate'],
    defaultId: 1,
    cancelId: 0,
  });
  return result.response === 1;
}

async function showInstallationSuccess() {
  await dialog.showMessageBox({
    type: 'info',
    title: 'JASWA Helper is running',
    message: 'JASWA Helper is ready.',
    detail: 'It is running in the taskbar notification area, near the clock. Select its icon to open JASWA or see its status.',
    buttons: ['Got it'],
    defaultId: 0,
  });
}

async function handleRuntimeFailure(kind, error) {
  await recordDiagnostic(kind, error);
  const detail = error instanceof Error ? error.message : String(error);
  if (tray) {
    tray.displayBalloon({ title: 'JASWA Helper needs attention', content: `A runtime error was saved to the diagnostic log.\n\n${detail}` });
    refreshMenu();
  }
}

/* Cleanup is a one-shot command the installer and uninstaller run, sometimes
   while a helper is still live. It must never take or wait for the lock. */
const cleanupRequested = process.argv.includes('--jaswa-cleanup');
/* Two helpers would fight over the hosts file and the local ports, and the
   loser used to linger as a broken tray icon. Hand the request to the instance
   that is already running instead.

   Electron scopes this lock per user, and elevation moves the relaunch into the
   administrator's session, so the lock cannot span the UAC step. The elevated
   instance is the one that keeps running, so it is the one that takes the lock;
   the unelevated launcher only survives until UAC is answered and would
   otherwise deny its own elevated continuation. */
const elevatedRelaunch = process.argv.some((argument) => argument.startsWith('--jaswa-upstream-map='));
if (!cleanupRequested && !app.requestSingleInstanceLock() && !elevatedRelaunch) app.exit(0);

app.on('second-instance', (_event, argv) => {
  if (argv.includes('--jaswa-installed')) void showInstallationSuccess();
  else void shell.openExternal('http://localhost:3000');
});

app.whenReady().then(async () => {
  app.setAppUserModelId('dk.jaswa.helper');
  if (cleanupRequested) {
    /* The installer and uninstaller wait on this run and have no interface for
       a dialog. Record what failed and exit non-zero rather than blocking
       setup behind a message box nobody is watching for. */
    try { await cleanup({ removeCertificate: process.argv.includes('--jaswa-remove-certificate') }); }
    catch (error) { await recordDiagnostic('cleanup failure', error); return app.exit(1); }
    return app.exit(0);
  }
  helper = await start({ confirmCertificateInstallation });
  if (helper.elevationRequested) return app.quit();
  const icon = nativeImage.createFromPath(iconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.on('click', () => void shell.openExternal('http://localhost:3000'));
  refreshMenu();
  if (process.argv.includes('--jaswa-installed')) await showInstallationSuccess();
  setInterval(refreshMenu, 2000);
}).catch(showStartupFailure);

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', (event) => {
  if (quitting || !helper || helper.elevationRequested) return;
  event.preventDefault();
  quitting = true;
  helper.stop().finally(() => { helper = null; app.quit(); });
});

process.on('uncaughtException', (error) => void handleRuntimeFailure('uncaught exception', error));
process.on('unhandledRejection', (error) => void handleRuntimeFailure('unhandled rejection', error));
