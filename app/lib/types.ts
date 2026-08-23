export type CompatibilityReport = { valid: boolean; message: string; knownSections: string[]; unknownMonsterIds: string[] };
export type ImportedGame = { fileName: string; importedAt: string; data: Record<string, unknown>; report: CompatibilityReport };
export type MonsterPreference = { unitId: string; label: string; runeSets: string; statGoals: string };
export type RunePotentialSortOrder = 'Grade' | 'Sub Property' | 'Sub Property Before Grinding' | 'Power-up Lv.' | 'Obtained' | 'Sub Property Sum' | 'Score';
export type RunePotentialSettings = { powerUpPolicy: number; runeQuality: number; enchantedGems: number; grindstones: number; includeLevel12Runes: boolean; includeEquippedRunes: boolean; sortOrder: RunePotentialSortOrder };
export type Preferences = { format: 'swaggr-preferences'; version: 1; updatedAt: string; monsterPreferences: Record<string, MonsterPreference>; runePotential: RunePotentialSettings };
