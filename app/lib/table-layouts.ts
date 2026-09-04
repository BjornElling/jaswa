export type TableColumn = {
  key: string;
  width: string;
};

/**
 * The two account libraries use declared column plans instead of scattered CSS
 * percentages. A table's two rendered halves receive the same plan, which is
 * what keeps its filter, heading and rows on one immutable grid.
 */
export const monsterTableColumns: readonly TableColumn[] = [
  { key: 'index', width: '4.1284%' },
  { key: 'name', width: '13.7615%' },
  { key: 'sets', width: '7.7982%' },
  { key: 'level', width: '3.6697%' },
  { key: 'hp', width: '5.5046%' },
  { key: 'atk', width: '5.5046%' },
  { key: 'def', width: '5.5046%' },
  { key: 'spd', width: '4.5872%' },
  { key: 'criticalRate', width: '4.5872%' },
  { key: 'criticalDamage', width: '4.5872%' },
  { key: 'resistance', width: '4.5872%' },
  { key: 'accuracy', width: '4.5872%' },
  { key: 'artifacts', width: '6.422%' },
  { key: 'relic', width: '4.5872%' },
  { key: 'ehp', width: '6.422%' },
  { key: 'ehpD', width: '6.422%' },
  { key: 'dmg', width: '7.3394%' },
];

export const artifactTableColumns: readonly TableColumn[] = [
  { key: 'location', width: '17.8899%' },
  { key: 'value', width: '7.7982%' },
  { key: 'category', width: '7.3394%' },
  { key: 'equipClass', width: '7.7982%' },
  { key: 'grade', width: '7.3394%' },
  { key: 'mainProperty', width: '8.7156%' },
  { key: 'subProperties', width: '39.1193%' },
  { key: 'refinement', width: '4%' },
];
