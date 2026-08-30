'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { dataDirectory } = require('./config.cjs');

function diagnosticPath(directory = dataDirectory()) {
  return path.join(directory, 'diagnostics.log');
}

function describeError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

async function recordDiagnostic(kind, error, directory = dataDirectory()) {
  const entry = `${new Date().toISOString()} [${kind}] ${describeError(error)}\n`;
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.appendFile(diagnosticPath(directory), entry, 'utf8');
  } catch {
    /* A diagnostic must never hide the fault it was meant to record. */
  }
}

module.exports = { diagnosticPath, recordDiagnostic };
