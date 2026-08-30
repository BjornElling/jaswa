'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const watchedCollections = Object.freeze({
  unit_list: 'unit_id',
  runes: 'rune_id',
  artifacts: 'artifact_id',
  relics: 'relic_id',
  rune_craft_item_list: 'craft_item_id',
});
const profileActivityTimeoutMs = 10_000;

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function identifier(value, key) { return isRecord(value) && (typeof value[key] === 'string' || typeof value[key] === 'number') ? String(value[key]) : undefined; }

function mergeCollection(current, incoming, key) {
  const byId = new Map((Array.isArray(current) ? current : []).map((item) => [identifier(item, key), item]).filter(([id]) => id));
  for (const item of incoming) {
    const id = identifier(item, key);
    if (id) byId.set(id, item);
  }
  return [...byId.values()];
}

function removeCollectionItems(current, identifiers, key) {
  const removed = new Set((Array.isArray(identifiers) ? identifiers : []).map(String));
  return (Array.isArray(current) ? current : []).filter((item) => !removed.has(identifier(item, key)));
}

function firstRecord(value) { return isRecord(value) ? value : undefined; }

class ProfileStore {
  constructor(now = () => Date.now()) {
    this.profile = null;
    this.updatedAt = null;
    this.source = null;
    this.lastActivityAt = null;
    this.revision = 0;
    this.sessionId = 0;
    this.instanceId = crypto.randomUUID();
    this.now = now;
  }

  markActivity() {
    const activityAt = this.now();
    /* A snapshot from a previous game session must not be served as the next
       session's first import before the new login response arrives. */
    if (this.profile && this.lastActivityAt !== null && activityAt - this.lastActivityAt > profileActivityTimeoutMs) this.clear();
    this.lastActivityAt = activityAt;
  }

  isConnected() {
    return Boolean(this.profile && this.lastActivityAt !== null && this.now() - this.lastActivityAt <= profileActivityTimeoutMs);
  }

  clear() {
    this.profile = null;
    this.updatedAt = null;
    this.source = null;
    this.lastActivityAt = null;
  }

  acceptSnapshot(profile) {
    if (!isRecord(profile) || !Array.isArray(profile.unit_list) || !Array.isArray(profile.runes)) return false;
    this.profile = structuredClone(profile);
    this.updatedAt = new Date().toISOString();
    this.source = 'game-start';
    /* A login can arrive after a quiet previous session. Marking activity after
       replacing the snapshot would otherwise clear the freshly captured data. */
    this.lastActivityAt = this.now();
    this.sessionId += 1;
    this.revision += 1;
    return true;
  }

  applyUpdate(response, request = {}) {
    if (!this.profile || !isRecord(response)) return false;
    let changed = false;
    for (const [collection, key] of Object.entries(watchedCollections)) {
      const incoming = response[collection];
      if (!Array.isArray(incoming)) continue;
      const next = mergeCollection(this.profile[collection], incoming, key);
      if (!isDeepStrictEqual(next, this.profile[collection])) {
        this.profile[collection] = next;
        changed = true;
      }
    }
    const directItems = [
      ['rune', 'runes', 'rune_id'],
      ['artifact', 'artifacts', 'artifact_id'],
      ['relic', 'relics', 'relic_id'],
      ['rune_craft_item', 'rune_craft_item_list', 'craft_item_id'],
      ['unit_info', 'unit_list', 'unit_id'],
    ];
    for (const [responseKey, collection, identifierKey] of directItems) {
      const item = firstRecord(response[responseKey]);
      if (!item) continue;
      const next = mergeCollection(this.profile[collection], [item], identifierKey);
      if (!isDeepStrictEqual(next, this.profile[collection])) {
        this.profile[collection] = next;
        changed = true;
      }
    }
    const command = isRecord(request) && typeof request.command === 'string' ? request.command : '';
    const deletions = command === 'SellRune' || command === 'SellRune_v2'
      ? [['runes', 'rune_id', request.rune_id_list]]
      : command === 'SellArtifacts'
        ? [['artifacts', 'artifact_id', request.artifact_ids]]
        : command === 'SellRuneCraftItem'
          ? [['rune_craft_item_list', 'craft_item_id', request.craft_id_list]]
          : [];
    for (const [collection, identifierKey, removed] of deletions) {
      const next = removeCollectionItems(this.profile[collection], removed, identifierKey);
      if (!isDeepStrictEqual(next, this.profile[collection])) {
        this.profile[collection] = next;
        changed = true;
      }
    }
    if (!changed) return false;
    this.updatedAt = new Date().toISOString();
    this.source = 'live';
    this.revision += 1;
    this.markActivity();
    return true;
  }

  status() {
    return {
      hasProfile: Boolean(this.profile),
      profileReady: this.isConnected(),
      instanceId: this.instanceId,
      revision: this.revision,
      sessionId: this.sessionId,
      source: this.source,
    };
  }

  read() {
    return this.profile
      ? { updatedAt: this.updatedAt, instanceId: this.instanceId, revision: this.revision, sessionId: this.sessionId, source: this.source, data: structuredClone(this.profile) }
      : null;
  }
}

module.exports = { ProfileStore, mergeCollection, profileActivityTimeoutMs, removeCollectionItems };
