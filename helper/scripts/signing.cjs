'use strict';

const { existsSync, readdirSync } = require('node:fs');
const path = require('node:path');

function signTool() {
  if (process.env.JASWA_SIGNTOOL_PATH) return process.env.JASWA_SIGNTOOL_PATH;
  const root = path.join(process.env['ProgramFiles(x86)'] || '', 'Windows Kits', '10', 'bin');
  if (existsSync(root)) {
    for (const version of readdirSync(root).sort().reverse()) {
      const candidate = path.join(root, version, 'x64', 'signtool.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  return 'signtool.exe';
}

module.exports = { signTool };
