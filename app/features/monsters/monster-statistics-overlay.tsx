import { type ReactNode, useMemo } from 'react';
import { MonsterPortrait } from '../../ui/gear/monster-portrait';
import { Overlay } from '../../ui/overlay';
import { StatisticsIcon } from './game-statistics-button';
import { artifactCategoryLabels } from '../../domain/artifacts/artifact-properties';
import { formatDecimal } from '../../domain/shared/formatting';
import { monsterPresentation } from '../../domain/monsters/monster-catalog';
import { runeSlotKeys } from '../../domain/profiles/monster-defaults';
import type { RuneSlotKey } from '../../domain/profiles/monster-defaults';
import { monsterUsage } from '../../domain/reference/monster-usage-statistics';
import type { UsageEntry } from '../../domain/reference/monster-usage-statistics';
import type { GeneralSettings } from '../../domain/model';

/**
 * What the wider player base engraves on one monster, as the game's own
 * Monster Info → Statistics panel reports it (`ENGRAVING-STATISTICS.md`).
 *
 * **Its own overlay, because it is the game's answer and not the user's.** The
 * profile and Rune Optimization once carried these shares beside the fields
 * they inform, and a share sitting next to a choice leans on it; here they are
 * read whole, a click away, and nothing on this panel can be chosen. Every
 * panel the dataset holds is shown — rune builds, slot mains and sub
 * properties, both artifacts and the relic.
 */

const slotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

/* The long distributions keep their leaders and fold the rest into one row, as
   the game's panel does; a share list twenty-three rows deep is read for its top. */
const foldedLength = 6;

function folded(entries: readonly UsageEntry[], limit: number | undefined): { shown: UsageEntry[]; others?: number } {
  if (limit === undefined || entries.length <= limit + 1) return { shown: [...entries] };
  return { shown: entries.slice(0, limit), others: entries.slice(limit).reduce((sum, entry) => sum + entry.share, 0) };
}

function ShareRow({ label, share, general, lead = false, others = false }: {
  label: string; share: number; general: GeneralSettings; lead?: boolean; others?: boolean;
}) {
  const percent = `${formatDecimal(share * 100, general)} %`;
  return <li className="game-statistics-share" data-lead={lead || undefined} data-others={others || undefined}
    title={`${label} ${percent}`}>
    <span className="game-statistics-share-name">{label}</span>
    <span className="game-statistics-share-value">{percent}</span>
  </li>;
}

function Shares({ label, entries, general, limit, across = false }: {
  label: string; entries: readonly UsageEntry[] | undefined; general: GeneralSettings; limit?: number;
  /** Side by side rather than down, for a short distribution such as the three mains. */
  across?: boolean;
}) {
  if (!entries || entries.length === 0) return <p className="overlay-empty">Not captured</p>;
  const { shown, others } = folded(entries, limit);
  return <ol className="game-statistics-shares" aria-label={label} data-across={across || undefined}>
    {shown.map((entry, at) => <ShareRow key={entry.label} label={entry.label} share={entry.share} general={general} lead={at === 0} />)}
    {others !== undefined && <ShareRow label="Others" share={others} general={general} others />}
  </ol>;
}

/** One distribution, or a few that belong to one piece of gear, in one framed card. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="game-statistics-card" aria-label={title}>
    <h4 className="game-statistics-card-title">{title}</h4>
    {children}
  </section>;
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return <div className="game-statistics-part">
    <p className="game-statistics-part-title">{title}</p>
    {children}
  </div>;
}

function Block({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <section className={['overlay-block', className].filter(Boolean).join(' ')}>
    <header className="overlay-block-head">
      <h3 className="overlay-block-title">{title}</h3>
    </header>
    {children}
  </section>;
}

export function MonsterStatisticsOverlay({ masterId, general, onClose }: {
  masterId: string;
  general: GeneralSettings;
  onClose: () => void;
}) {
  const display = monsterPresentation(masterId);
  const usage = useMemo(() => monsterUsage(masterId), [masterId]);
  const captured = usage.runes !== undefined || usage.artifacts !== undefined || usage.relics !== undefined;

  return <Overlay labelledBy="monster-statistics-title" className="monster-statistics-overlay" onClose={onClose}>
    <header className="overlay-head game-statistics-head">
      <MonsterPortrait imageFilename={display.imageFilename} initial={display.shortName} name={display.name} decorative />
      <div className="overlay-identity">
        <p className="game-statistics-eyebrow"><StatisticsIcon />Game statistics</p>
        <h2 id="monster-statistics-title" className="overlay-hero-name" title={display.name}>{display.name}</h2>
      </div>
    </header>

    <div className="overlay-body game-statistics-body">
      {!captured
        ? <p className="notice">The game&apos;s statistics for this monster have not been captured yet.</p>
        : <>
          <Block title="Runes">
            <div className="game-statistics-cards game-statistics-runes">
              <Card title="Builds"><Shares label="Rune builds" entries={usage.runes?.builds} general={general} /></Card>
              {runeSlotKeys.map((key) => <Card key={key} title={`Slot ${slotNumbers[key]}`}>
                <Shares label={`Slot ${slotNumbers[key]} main`} entries={usage.runes?.slots[key]} general={general} />
              </Card>)}
              <Card title="Sub properties"><Shares label="Rune sub properties" entries={usage.runes?.subs} general={general} /></Card>
            </div>
          </Block>

          <div className="game-statistics-gear">
            <Block title="Artifacts">
              <div className="game-statistics-cards game-statistics-artifacts">
                {(['attribute', 'type'] as const).map((category) => {
                  const panel = usage.artifacts?.categories[category];
                  const name = `${artifactCategoryLabels[category]} artifact`;
                  return <Card key={category} title={name}>
                    <Part title="Main stat"><Shares label={`${name} main stat`} entries={panel?.main} general={general} across /></Part>
                    <Part title="Sub properties">
                      <Shares label={`${name} sub properties`} entries={panel?.sub} general={general} limit={foldedLength} />
                    </Part>
                  </Card>;
                })}
              </div>
            </Block>
            <Block title="Relics">
              <div className="game-statistics-cards">
                <Card title="Relic">
                  <Part title="Main stat"><Shares label="Relic main stat" entries={usage.relics?.main} general={general} across /></Part>
                  <Part title="Unique property">
                    <Shares label="Relic unique property" entries={usage.relics?.unique} general={general} limit={foldedLength} />
                  </Part>
                </Card>
              </div>
            </Block>
          </div>
        </>}
    </div>
  </Overlay>;
}
