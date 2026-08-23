export type CompatibilityReport = { valid: boolean; message: string; knownSections: string[]; unknownMonsterIds: string[] };
export type ImportedGame = { fileName: string; importedAt: string; data: Record<string, unknown>; report: CompatibilityReport };
export type MonsterPreference = { unitId: string; label: string; runeSets: string; statGoals: string };
export type Preferences = { format: 'swaggr-preferences'; version: 1; updatedAt: string; monsterPreferences: Record<string, MonsterPreference> };
