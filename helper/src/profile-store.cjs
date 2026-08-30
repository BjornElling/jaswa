'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function identifier(value, key) { return isRecord(value) && (typeof value[key] === 'string' || typeof value[key] === 'number') ? String(value[key]) : undefined; }

/* Gateway replies are deltas, and their wrapper names vary by game action.
   Keep the last complete record and overlay a delta, so a placement-only reply
   cannot erase the monster's runes or base data from the local snapshot. */
function mergeRecord(current, incoming) {
  return isRecord(current) ? { ...current, ...incoming } : incoming;
}

function mergeCollection(current, incoming, key) {
  const byId = new Map((Array.isArray(current) ? current : []).map((item) => [identifier(item, key), item]).filter(([id]) => id));
  for (const item of incoming) {
    const id = identifier(item, key);
    if (id) byId.set(id, mergeRecord(byId.get(id), item));
  }
  return [...byId.values()];
}

function normalizedCollection(items, key) {
  return mergeCollection([], Array.isArray(items) ? items : [], key);
}

function removeCollectionItems(current, identifiers, key) {
  const removed = new Set((Array.isArray(identifiers) ? identifiers : []).map(String));
  return (Array.isArray(current) ? current : []).filter((item) => !removed.has(identifier(item, key)));
}

const trackedEntities = Object.freeze([
  {
    collection: 'unit_list', identifierKey: 'unit_id', directKeys: new Set(['unit_info', 'unit']),
    isCandidate: (value) => Object.hasOwn(value, 'unit_master_id') || Object.hasOwn(value, 'building_id') || Object.hasOwn(value, 'unit_level') || Object.hasOwn(value, 'runes') || Object.hasOwn(value, 'artifacts') || Object.hasOwn(value, 'relics'),
  },
  {
    collection: 'runes', identifierKey: 'rune_id', directKeys: new Set(['rune']),
    isCandidate: (value) => Object.hasOwn(value, 'set_id') || Object.hasOwn(value, 'slot_no') || Object.hasOwn(value, 'upgrade_curr') || Object.hasOwn(value, 'pri_effect') || Object.hasOwn(value, 'sec_effect'),
  },
  {
    collection: 'artifacts', identifierKey: 'artifact_id', directKeys: new Set(['artifact']),
    isCandidate: (value) => Object.hasOwn(value, 'set_id') || Object.hasOwn(value, 'slot_no') || Object.hasOwn(value, 'upgrade_curr') || Object.hasOwn(value, 'pri_effect') || Object.hasOwn(value, 'sec_effect'),
  },
  {
    collection: 'relics', identifierKey: 'relic_id', directKeys: new Set(['relic']),
    isCandidate: (value) => Object.hasOwn(value, 'set_id') || Object.hasOwn(value, 'slot_no') || Object.hasOwn(value, 'upgrade_curr') || Object.hasOwn(value, 'pri_effect') || Object.hasOwn(value, 'sec_effect'),
  },
  {
    collection: 'rune_craft_item_list', identifierKey: 'craft_item_id', directKeys: new Set(['rune_craft_item', 'craft']),
    isCandidate: (value) => Object.hasOwn(value, 'craft_type') || Object.hasOwn(value, 'craft_type_id'),
  },
]);

function responseEntities(value, parentKey, result = [], seen = new Set(), insideUnit = false) {
  if (Array.isArray(value)) {
    for (const entry of value) responseEntities(entry, parentKey, result, seen, insideUnit);
    return result;
  }
  if (!isRecord(value) || seen.has(value)) return result;
  seen.add(value);
  for (const entity of trackedEntities) {
    if (!insideUnit && identifier(value, entity.identifierKey) && (entity.directKeys.has(parentKey) || entity.isCandidate(value))) result.push([entity, value]);
  }
  const isUnit = Boolean(identifier(value, 'unit_id')) && trackedEntities[0].isCandidate(value);
  for (const [key, entry] of Object.entries(value)) responseEntities(entry, key, result, seen, insideUnit || isUnit);
  return result;
}

function collectionItems(profile, collection) {
  return Array.isArray(profile[collection]) ? profile[collection] : [];
}

function itemFromAccount(profile, entity, itemId) {
  const matches = (item) => identifier(item, entity.identifierKey) === itemId;
  const direct = collectionItems(profile, entity.collection).find(matches);
  if (direct) return direct;
  for (const unit of collectionItems(profile, 'unit_list')) {
    const equipped = collectionItems(unit, entity.collection).find(matches);
    if (equipped) return equipped;
  }
  return undefined;
}

function isKnownAccountEntity(profile, entity, item) {
  const id = identifier(item, entity.identifierKey);
  return Boolean(id && itemFromAccount(profile, entity, id));
}

function isRtaCommand(request) {
  const command = isRecord(request) && typeof request.command === 'string' ? request.command : '';
  return /rtpvp|world_?arena/i.test(command);
}

function moveEquipment(profile, entity, itemId, unitId) {
  const item = itemFromAccount(profile, entity, itemId);
  if (!item) return false;
  let changed = false;
  for (const unit of collectionItems(profile, 'unit_list')) {
    const unitKey = identifier(unit, 'unit_id');
    const current = collectionItems(unit, entity.collection);
    const withoutItem = removeCollectionItems(current, [itemId], entity.identifierKey);
    if (unitKey === unitId) {
      const next = mergeCollection(withoutItem, [item], entity.identifierKey);
      if (!isDeepStrictEqual(next, current)) { unit[entity.collection] = next; changed = true; }
    } else if (!isDeepStrictEqual(withoutItem, current)) { unit[entity.collection] = withoutItem; changed = true; }
  }
  const inventory = collectionItems(profile, entity.collection);
  const nextInventory = unitId === undefined
    ? mergeCollection(inventory, [item], entity.identifierKey)
    : removeCollectionItems(inventory, [itemId], entity.identifierKey);
  if (!isDeepStrictEqual(nextInventory, inventory)) { profile[entity.collection] = nextInventory; changed = true; }
  return changed;
}

function requestIdentifiers(value, identifierKey, result = []) {
  if (Array.isArray(value)) {
    for (const entry of value) requestIdentifiers(entry, identifierKey, result);
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const aliases = identifierKey === 'craft_item_id' ? ['craft_id', 'craft_id_list', 'craft_ids'] : [];
      if (key === identifierKey || key === `${identifierKey}s` || key === `${identifierKey}_list` || key === `${identifierKey.replace(/_id$/, '')}_ids` || aliases.includes(key)) {
        if (Array.isArray(entry)) result.push(...entry.map(String));
        else if (typeof entry === 'string' || typeof entry === 'number') result.push(String(entry));
      }
      requestIdentifiers(entry, identifierKey, result);
    }
  }
  return result;
}

class ProfileStore {
  constructor() {
    this.profile = null;
    this.updatedAt = null;
    this.source = null;
    this.revision = 0;
    this.sessionId = 0;
    this.instanceId = crypto.randomUUID();
  }

  isConnected() {
    return Boolean(this.profile);
  }

  clear() {
    this.profile = null;
    this.updatedAt = null;
    this.source = null;
  }

  acceptSnapshot(profile) {
    if (!isRecord(profile) || !Array.isArray(profile.unit_list) || !Array.isArray(profile.runes)) return false;
    const wizardId = identifier(profile, 'wizard_id');
    /* Login is the sole authoritative inventory response. Its root owner ID
       lets us reject any units the game happens to include for another player,
       while identifier-based normalization also prevents a malformed reply
       from creating a second copy of a roster item. */
    this.profile = {
      ...structuredClone(profile),
      unit_list: normalizedCollection(profile.unit_list
        .filter((unit) => !wizardId || identifier(unit, 'wizard_id') === wizardId), 'unit_id'),
      runes: normalizedCollection(profile.runes, 'rune_id'),
      artifacts: normalizedCollection(profile.artifacts, 'artifact_id'),
      relics: normalizedCollection(profile.relics, 'relic_id'),
      rune_craft_item_list: normalizedCollection(profile.rune_craft_item_list, 'craft_item_id'),
    };
    this.updatedAt = new Date().toISOString();
    this.source = 'game-start';
    this.sessionId += 1;
    this.revision += 1;
    return true;
  }

  applyUpdate(response, request = {}) {
    if (!this.profile || !isRecord(response)) return false;
    /* RTA answers describe a temporary battle roster. Even an owned monster
       there has RTA equipment and stats, so it must never overwrite PvE. */
    if (isRtaCommand(request)) return false;
    let changed = false;
    /* The game uses different response wrappers for the same account objects.
       Looking for identified records, rather than an ever-growing command list,
       catches upgrades, crafts, reappraisals and placement changes alike. */
    for (const [entity, item] of responseEntities(response, '')) {
      /* Read-only replies for helpers, recommendations, shops and opponents
         reuse the same item shapes as account updates. Only merge an entity
         already present in the authoritative login snapshot; a new drop joins
         at the next login rather than risking someone else's equipment. */
      if (!isKnownAccountEntity(this.profile, entity, item)) continue;
      const next = mergeCollection(this.profile[entity.collection], [item], entity.identifierKey);
      if (!isDeepStrictEqual(next, this.profile[entity.collection])) {
        this.profile[entity.collection] = next;
        changed = true;
      }
    }
    const command = isRecord(request) && typeof request.command === 'string' ? request.command : '';
    const commandName = command.toLowerCase();
    const unitId = identifier(request, 'unit_id');
    /* Moving a monster to or from storage is acknowledged without returning a
       unit object. The request is still authoritative about its new building. */
    if (unitId && (typeof request.building_id === 'number' || typeof request.building_id === 'string')) {
      const next = mergeCollection(this.profile.unit_list, [{ unit_id: request.unit_id, building_id: request.building_id }], 'unit_id');
      if (!isDeepStrictEqual(next, this.profile.unit_list)) {
        this.profile.unit_list = next;
        changed = true;
      }
    }
    const rune = trackedEntities.find((entity) => entity.collection === 'runes');
    if (rune && commandName.includes('equiprune') && unitId) {
      const runeId = identifier(request, 'rune_id');
      if (runeId && moveEquipment(this.profile, rune, runeId, unitId)) changed = true;
    }
    if (rune && commandName.includes('unequiprune')) {
      const runeId = identifier(request, 'rune_id');
      if (runeId && moveEquipment(this.profile, rune, runeId)) changed = true;
    }
    /* Gems and grindstones are account items too. Their actions return the
       altered rune but not the consumed craft item, so remove that item from
       the snapshot from the request that spent it. */
    if (commandName.includes('amplifyrune') || commandName.includes('convertrune')) {
      const craft = trackedEntities.find((entity) => entity.collection === 'rune_craft_item_list');
      if (craft) {
        const ids = requestIdentifiers(request, craft.identifierKey);
        const next = removeCollectionItems(this.profile[craft.collection], ids, craft.identifierKey);
        if (!isDeepStrictEqual(next, this.profile[craft.collection])) {
          this.profile[craft.collection] = next;
          changed = true;
        }
      }
    }
    /* Artifact and relic management sends a list of placements in the request,
       with no item payload in the response. Treat zero or a missing owner as
       inventory; all other owners receive the existing complete item record. */
    for (const entity of trackedEntities.filter((candidate) => candidate.collection === 'artifacts' || candidate.collection === 'relics')) {
      const updates = Array.isArray(request.updates) ? request.updates : [];
      for (const update of updates) {
        const itemId = identifier(update, entity.identifierKey);
        if (!itemId) continue;
        const owner = identifier(update, 'unit_id');
        if (moveEquipment(this.profile, entity, itemId, owner && owner !== '0' ? owner : undefined)) changed = true;
      }
    }
    if (commandName.startsWith('sell')) {
      for (const entity of trackedEntities) {
        const ids = requestIdentifiers(request, entity.identifierKey);
        if (ids.length === 0) continue;
        const next = removeCollectionItems(this.profile[entity.collection], ids, entity.identifierKey);
        if (!isDeepStrictEqual(next, this.profile[entity.collection])) {
          this.profile[entity.collection] = next;
          for (const unit of collectionItems(this.profile, 'unit_list')) {
            const equipped = collectionItems(unit, entity.collection);
            const nextEquipped = removeCollectionItems(equipped, ids, entity.identifierKey);
            if (!isDeepStrictEqual(nextEquipped, equipped)) unit[entity.collection] = nextEquipped;
          }
          changed = true;
        }
      }
    }
    if (!changed) return false;
    this.updatedAt = new Date().toISOString();
    this.source = 'live';
    this.revision += 1;
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

module.exports = { ProfileStore, mergeCollection, removeCollectionItems };
