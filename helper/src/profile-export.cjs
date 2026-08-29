'use strict';

const path = require('node:path');

const excludedKeys = new Set(['session_key', 'session_key_node']);

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

function removeExcludedKeys(value) {
  if (Array.isArray(value)) return value.map(removeExcludedKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !excludedKeys.has(key))
    .map(([key, entry]) => [key, removeExcludedKeys(entry)]));
}

function serializeProfile(profile) {
  if (!isRecord(profile) || !isRecord(profile.data)) return null;
  return `${JSON.stringify(removeExcludedKeys(profile.data), null, 2)}\n`;
}

function suggestedExportPath(downloadsPath, date = new Date()) {
  return path.join(downloadsPath, `SummonersWar-${date.toISOString().slice(0, 10)}.json`);
}

function withJsonExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.json' ? filePath : `${filePath}.json`;
}

module.exports = { serializeProfile, suggestedExportPath, withJsonExtension };
