export type Page = 'home' | 'monster-stats' | 'monster-numbers' | 'artifact-list' | 'optimizer' | 'speed' | 'presets' | 'potential' | 'artifacts' | 'gems' | 'relics' | 'settings' | 'the-math' | 'rune-simulator';
export type ReportCategory = 'Monster' | 'Rune' | 'Gem' | 'Grindstone' | 'Artifact' | 'Relic' | 'Other';

/* `label` is what the rail shows, under a heading that supplies the subject.
   `name` is the whole thing said in one breath, for the places that meet the
   entry without that heading beside it: the button's accessible name, where a
   screen reader announces one control at a time, and a test or verify script
   asking for a rail button by name. It includes the visible label so voice
   controls can find the same entry. */
export type NavigationItem = { id: Page; label: string; name: string; glyph: string };

/* The rail groups by subject, so each entry only has to name what it does to
   that subject: the heading above it supplies the noun. `label` is therefore
   short enough to repeat across groups — three of them are "Optimization" —
   and it is the page's own heading, not this label, that states the full name
   for a reader who has scrolled past the rail. */
export const navigationGroups: Array<{ heading: string; items: NavigationItem[] }> = [
  {
    /* Not a subject but the things that sit outside the optimizing: how the
       account gets in, and what every page below judges by. A setting that
       reaches more than one page lives on Settings rather than on any of them. */
    heading: 'General',
    items: [
      { id: 'home', label: 'Home', name: 'Home', glyph: '⌂' },
      { id: 'settings', label: 'Settings', name: 'Settings', glyph: '⚙' },
    ],
  },
  {
    heading: 'Monsters',
    items: [
      { id: 'monster-stats', label: 'Overview', name: 'Monster Overview', glyph: '♜' },
      { id: 'monster-numbers', label: 'Usage', name: 'Monster Usage', glyph: '♜' },
    ],
  },
  {
    heading: 'Rune Optimization',
    items: [
      { id: 'presets', label: 'Presets', name: 'Presets', glyph: '⇅' },
      { id: 'speed', label: 'Speed tuning', name: 'Speed Tuning', glyph: '↝' },
      { id: 'optimizer', label: 'Optimization', name: 'Rune Optimization', glyph: '◈' },
      /* Spending gems and grindstones is finishing a build, so it sits beside
         the build search rather than with the clean-up that sells runes. */
      { id: 'gems', label: 'Gems & grinds', name: 'Gems & Grinds', glyph: '✦' },
    ],
  },
  {
    heading: 'Rune Clean-up',
    items: [
      { id: 'potential', label: 'Clean-up', name: 'Rune Clean-up', glyph: '◌' },
      /* An experiment on runes nobody owns yet, judged by the same Clean-up
         engine as the verdicts above — it belongs with them. */
      ...(import.meta.env.DEV ? [{ id: 'rune-simulator' as const, label: 'Simulator', name: 'Rune Simulator', glyph: '↻' }] : []),
    ],
  },
  {
    heading: 'Artifacts',
    items: [
      /* The library's hollow diamond against the workspace's filled one: a
         plain list of what the account holds, then the judgement read against
         it. Neither borrows the Rune Optimization mark. */
      { id: 'artifact-list', label: 'Overview', name: 'Artifacts', glyph: '◇' },
      { id: 'artifacts', label: 'Optimization', name: 'Artifact Optimization', glyph: '◆' },
    ],
  },
  {
    /* One entry under its own heading, so that a second relic tool lands in a
       place that already exists rather than reshaping the rail. */
    heading: 'Relics',
    items: [{ id: 'relics', label: 'Optimization', name: 'Relic Optimization', glyph: '▣' }],
  },
  {
    heading: 'Technical',
    items: [
      /* A geometric mark rather than a maths operator. ∑ ƒ ∫ are set on the
         maths axis with extenders below the baseline, so beside the rail's
         centred glyphs one entry hung low and read a size larger than the
         rest. ※ is the reference mark — the note the figures are worked out
         in — and it sits in the same box as ✦ and ◈. */
      { id: 'the-math', label: 'The Math', name: 'The Math', glyph: '※' },
    ],
  },
];

/* Navigation and restored tab state share availability, including dev tools. */
export const pageChoices: readonly Page[] = navigationGroups.flatMap((group) => group.items.map((item) => item.id));
