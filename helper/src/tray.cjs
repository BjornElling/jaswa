'use strict';

const path = require('node:path');
const { app, Menu, nativeImage, shell, Tray } = require('electron');
const { reportStartupError, start } = require('./index.cjs');

let helper;
let tray;

function iconPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'favicon.ico') : path.join(__dirname, '..', '..', 'public', 'favicon.ico');
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
