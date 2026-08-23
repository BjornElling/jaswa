export type RunePotentialPreset = {
  id: string;
  name: string;
  description: string;
  desirableSets: readonly string[];
  desirableStats: readonly string[];
  metricWeights: { dmg: number; ehp: number; ehpD: number };
};

// Working presets deliberately live in source code. They are read-only until
// the future preset editor is introduced.
export const runePotentialPresets: readonly RunePotentialPreset[] = [
  {
    id: 'attack', name: 'Attack', description: 'Pure ATK-based damage dealer.',
    desirableSets: ['Fatal', 'Rage', 'Blade', 'Will'],
    desirableStats: ['ATK %', 'CRI Rate', 'CRI Dmg', 'SPD'],
    metricWeights: { dmg: 5, ehp: 1, ehpD: 1 },
  },
  {
    id: 'slow-dd', name: 'Slow DD', description: 'High-output damage dealer without a speed focus.',
    desirableSets: ['Rage', 'Fatal', 'Will', 'Blade', 'Destroy'],
    desirableStats: ['ATK %', 'CRI Rate', 'CRI Dmg', 'HP %', 'DEF %'],
    metricWeights: { dmg: 5, ehp: 2, ehpD: 2 },
  },
  {
    id: 'fast-dd', name: 'Fast DD', description: 'Damage dealer that must also take turns quickly.',
    desirableSets: ['Swift', 'Violent', 'Will', 'Blade'],
    desirableStats: ['SPD', 'ATK %', 'CRI Rate', 'CRI Dmg', 'HP %'],
    metricWeights: { dmg: 4, ehp: 2, ehpD: 2 },
  },
  {
    id: 'def-dd', name: 'Def DD', description: 'DEF-scaling damage dealer; evaluate skill damage separately.',
    desirableSets: ['Violent', 'Destroy', 'Will', 'Guard'],
    desirableStats: ['DEF %', 'CRI Rate', 'CRI Dmg', 'HP %', 'SPD'],
    metricWeights: { dmg: 2, ehp: 4, ehpD: 4 },
  },
  {
    id: 'bomber', name: 'Bomber', description: 'Accuracy and turn access take priority over crit damage.',
    desirableSets: ['Swift', 'Violent', 'Will', 'Shield'],
    desirableStats: ['SPD', 'Accuracy', 'HP %', 'DEF %', 'ATK %'],
    metricWeights: { dmg: 0, ehp: 4, ehpD: 5 },
  },
  {
    id: 'support', name: 'Support', description: 'Fast, durable utility unit.',
    desirableSets: ['Swift', 'Violent', 'Will', 'Energy', 'Guard', 'Focus'],
    desirableStats: ['SPD', 'HP %', 'DEF %', 'Resistance', 'Accuracy'],
    metricWeights: { dmg: 0, ehp: 5, ehpD: 5 },
  },
  {
    id: 'pvp-def', name: 'PvP def', description: 'Durable defence unit with disruptive set options.',
    desirableSets: ['Violent', 'Will', 'Nemesis', 'Despair', 'Revenge'],
    desirableStats: ['SPD', 'HP %', 'DEF %', 'Resistance', 'Accuracy'],
    metricWeights: { dmg: 1, ehp: 5, ehpD: 5 },
  },
  {
    id: 'bruiser', name: 'Bruiser', description: 'Balanced damage and survivability.',
    desirableSets: ['Violent', 'Vampire', 'Destroy', 'Will', 'Nemesis'],
    desirableStats: ['HP %', 'DEF %', 'ATK %', 'CRI Rate', 'CRI Dmg', 'SPD'],
    metricWeights: { dmg: 4, ehp: 5, ehpD: 5 },
  },
];
