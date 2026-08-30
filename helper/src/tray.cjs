'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, dialog, Menu, nativeImage, shell, Tray } = require('electron');
const { serializeProfile, suggestedExportPath, withJsonExtension } = require('./profile-export.cjs');
const { diagnosticPath, recordDiagnostic } = require('./diagnostics.cjs');
const { cleanup, reportStartupError, start } = require('./service.cjs');
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

async function openDiagnosticLog() {
  const file = diagnosticPath();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, '', 'utf8');
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The diagnostic log could not be opened.';
    dialog.showErrorBox('Could not open diagnostic log', `JASWA Helper could not open its diagnostic log.\n\n${detail}`);
  }
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
  const error = status?.lastError;
  const detail = error ? 'Connection needs attention' : status?.profileReady ? `Snapshot ready · ${status.source === 'live' ? 'live sync' : 'game start'}` : 'Waiting for Summoners War';
  tray.setToolTip(`JASWA Helper — ${detail}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'JASWA Helper', enabled: false },
    { label: detail, enabled: false },
    { type: 'separator' },
    { label: 'Open JASWA', click: () => void shell.openExternal('http://localhost:3000') },
    { label: 'Download JSON', enabled: Boolean(status?.hasProfile), click: () => void downloadJson() },
    { label: 'Open diagnostic log', click: () => void openDiagnosticLog() },
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
  dialog.showErrorBox('JASWA Helper could not start', `The helper stopped before it could appear in the taskbar. Details were saved locally in:\n\n${diagnosticPath()}`);
  quitting = true;
  app.exit(1);
}

async function handleRuntimeFailure(kind, error) {
  await recordDiagnostic(kind, error);
  const detail = error instanceof Error ? error.message : String(error);
  if (tray) {
    tray.displayBalloon({ title: 'JASWA Helper needs attention', content: `A runtime error was saved to the diagnostic log.\n\n${detail}` });
    refreshMenu();
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId('dk.jaswa.helper');
  if (process.argv.includes('--jaswa-cleanup')) {
    await cleanup();
    return app.quit();
  }
  helper = await start();
  if (helper.elevationRequested) return app.quit();
  const icon = nativeImage.createFromPath(iconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.on('click', () => void shell.openExternal('http://localhost:3000'));
  refreshMenu();
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
