const archetypes = new Set(['Attack', 'Defense', 'HP', 'Support', 'Material', 'none']);

// Reject an unexpected source shape before replacing the last good snapshot.
export function compileMonsterCatalogue(records) {
  if (!Array.isArray(records)) throw new Error('Monster catalogue must be an array.');
  const ids = new Set();
  return records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Monster ${index} is not an object.`);
    const { com2us_id, name, image_filename, archetype } = record;
    if (!Number.isSafeInteger(com2us_id) || com2us_id <= 0) throw new Error(`Monster ${index} has an invalid com2us_id.`);
    if (ids.has(com2us_id)) throw new Error(`Duplicate com2us_id ${com2us_id}.`);
    ids.add(com2us_id);
    if (typeof name !== 'string' || !name.trim()) throw new Error(`Monster ${com2us_id} has no name.`);
    if (typeof image_filename !== 'string' || !image_filename.trim()) throw new Error(`Monster ${com2us_id} has no image filename.`);
    if (!archetypes.has(archetype)) throw new Error(`Monster ${com2us_id} has an unknown archetype: ${String(archetype)}.`);
    return { com2us_id, name, image_filename, archetype };
  }).sort((left, right) => left.com2us_id - right.com2us_id);
}
