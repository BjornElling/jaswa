'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, dialog, Menu, nativeImage, shell, Tray } = require('electron');
const { serializeProfile, suggestedExportPath, withJsonExtension } = require('./profile-export.cjs');
const { reportStartupError, start } = require('./service.cjs');

let helper;
let tray;

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

function refreshMenu() {
  const profile = helper?.profile();
  const error = helper?.status().lastError;
  const detail = error ? 'Connection needs attention' : profile ? `Snapshot ready · ${profile.source === 'live' ? 'live sync' : 'game start'}` : 'Waiting for Summoners War';
  tray.setToolTip(`JASWA Helper — ${detail}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'JASWA Helper', enabled: false },
    { label: detail, enabled: false },
    { type: 'separator' },
    { label: 'Open JASWA', click: () => void shell.openExternal('http://localhost:3000') },
    { label: 'Download JSON', enabled: Boolean(profile), click: () => void downloadJson() },
    { label: 'Quit', click: () => void helper.stop().finally(() => app.quit()) },
  ]));
}

app.whenReady().then(async () => {
  app.setAppUserModelId('dk.jaswa.helper');
  helper = await start();
  if (helper.elevationRequested) return app.quit();
  const icon = nativeImage.createFromPath(iconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.on('click', () => void shell.openExternal('http://localhost:3000'));
  refreshMenu();
  setInterval(refreshMenu, 2000);
}).catch(reportStartupError);

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', (event) => {
  if (!helper || helper.elevationRequested) return;
  event.preventDefault();
  helper.stop().finally(() => { helper = null; app.quit(); });
});
