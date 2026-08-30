'use strict';

function startsWithWindows(app) {
  return app.isPackaged && app.getLoginItemSettings().openAtLogin === true;
}

function setStartsWithWindows(app, enabled) {
  if (!app.isPackaged) return false;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: app.getPath('exe'),
  });
  return startsWithWindows(app);
}

module.exports = { setStartsWithWindows, startsWithWindows };
