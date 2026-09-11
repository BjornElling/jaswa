import type { AccelerationState } from './hardware-acceleration';
import type { HelperConnection } from './helper-client';

export type Page = 'home' | 'monsters' | 'artifact-list' | 'optimizer' | 'speed' | 'potential' | 'artifacts' | 'gems' | 'relics' | 'settings';
export type ReportCategory = 'Monster' | 'Rune' | 'Gem' | 'Grindstone' | 'Artifact' | 'Relic' | 'Other';

export type NavigationItem = { id: Page; label: string; glyph: string };

/* The rail is grouped so nine entries read as three short lists rather than
   one undifferentiated column. */
export const navigationGroups: Array<{ heading: string; items: NavigationItem[] }> = [
  {
    heading: 'Overview',
    items: [
      { id: 'home', label: 'Home', glyph: '⌂' },
      { id: 'monsters', label: 'Monsters', glyph: '♜' },
      /* The library sits beside Monsters rather than inside the Artifacts
         workspace: it is a plain list of what the account holds, where the
         workspace is the judgement read against it. */
      { id: 'artifact-list', label: 'Artifacts', glyph: '◇' },
    ],
  },
  {
    heading: 'Workspaces',
    items: [
      { id: 'optimizer', label: 'Rune Optimizer', glyph: '◈' },
      { id: 'speed', label: 'Speed Tuning', glyph: '↝' },
      { id: 'potential', label: 'Rune Potential', glyph: '◌' },
      /* The filled diamond against the library's hollow one: the two Artifacts
         entries read as a pair, and neither borrows the Rune Optimizer's mark. */
      { id: 'artifacts', label: 'Artifact Optimization', glyph: '◆' },
      { id: 'gems', label: 'Gems & Grinds', glyph: '✦' },
      { id: 'relics', label: 'Relics', glyph: '▣' },
    ],
  },
  {
    heading: 'Setup',
    items: [{ id: 'settings', label: 'Settings', glyph: '⚙' }],
  },
];

export const upcomingWorkspaces: Record<'optimizer' | 'speed' | 'gems', { title: string; tagline: string; text: string }> = {
  optimizer: {
    title: 'Rune Optimizer',
    tagline: 'Six slots, thousands of runes, one answer. Let your computer do the arithmetic so you can go back to pretending it was intuition.',
    text: 'Finds rune combinations that meet the requirements you save for each monster.',
  },
  speed: {
    title: 'Speed Tuning',
    tagline: 'Turn order is a solved problem. Getting your own team to respect it is the hard part.',
    text: 'Works out the rune speeds your team needs to take turns in the order you intend.',
  },
  gems: {
    title: 'Gems & Grinds',
    tagline: 'You have a box full of upgrades and a shortage of patience. One of those is fixable.',
    text: 'Ranks the gem and grindstone upgrades that move your account furthest.',
  },
};

/* These labels are display copy, kept beside the states they describe so a
   component cannot quietly invent a second vocabulary for the same verdict. */
export const accelerationLabels: Record<AccelerationState, string> = {
  checking: 'Checking',
  disabled: 'Disabled',
  ready: 'Connected',
  unavailable: 'Unavailable',
};

export const helperLabels: Record<HelperConnection['state'], string> = {
  checking: 'Waiting',
  ready: 'Connected',
  unavailable: 'Unavailable',
};
