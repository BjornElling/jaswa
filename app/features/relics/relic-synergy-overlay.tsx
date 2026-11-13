import { useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { Button } from '../../ui/button';
import { Overlay, OverlayAction } from '../../ui/overlay';
import { RelicSynergyMark } from './relic-marks';
import {
  relicFamilyByGrant, relicMainPropertyOrder, relicProperties, relicSourceLabel,
} from '../../domain/relics/relic-properties';
import type { RelicMainProperty, RelicPropertyDefinition } from '../../domain/relics/relic-properties';
import {
  cycledRelicSynergyBand, defaultRelicSynergy, isDefaultRelicSynergyCell, relicSynergy,
  relicSynergyBandLabels, relicSynergyBandOrder, relicSynergyCells, relicSynergyChoices,
  sameRelicSynergy, withRelicSynergyCell,
} from '../../domain/relics/relic-synergy';
import type { RelicSynergyChoices, RelicSynergyTable } from '../../domain/relics/relic-synergy';

/**
 * The synergy map: the synergy table, all forty-eight cells, where the user can overrule any of
 * them (`docs/RELIC-CANONICAL.md` §5.3).
 *
 * **It edits the one table, not a copy of it.** What is saved here is the
 * `relicSynergy` preference that `resolveRelicSynergy` lays over the shipped
 * cells, and the page reads nothing else — so a cell changed here is the band
 * the library shows, filters by and judges with, the moment Save is pressed.
 *
 * Laid out as the game's own Select Unique Property panel is, family by family,
 * with the three mains side by side, because that is the order a player already
 * knows the sixteen properties in. A cell steps through the five bands on each
 * click — down the scale, Trash wrapping round to Excellent — and Shift steps it
 * back up, so a cell is never more than two clicks from any band.
 *
 * Edits are a draft until Save, as in the monster profile: a stray Escape or a
 * click on the backdrop must not throw away a table half re-judged, and Reset
 * to defaults only puts the shipped cells into the draft. Reset is a worded
 * button beside the tally rather than a round mark on the edge: it is a way
 * back, so it stays quiet, but a bare circular arrow was too easy to miss.
 */

/* Family by family, in the panel's own order, each family's members in id order. */
const families = (() => {
  const grouped = new Map<string, RelicPropertyDefinition[]>();
  for (const property of relicProperties) {
    const family = relicFamilyByGrant[property.grants];
    grouped.set(family, [...(grouped.get(family) ?? []), property]);
  }
  return [...grouped].map(([family, members]) => ({ family, members }));
})();

const effectText = (property: RelicPropertyDefinition) => `${property.grants} per ${relicSourceLabel(property.per)}`;

export function RelicSynergyOverlay({ synergy, onSave, onClose }: {
  synergy: RelicSynergyTable;
  onSave: (choices: RelicSynergyChoices) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(synergy);
  const dirty = !sameRelicSynergy(draft, synergy);
  const atDefaults = sameRelicSynergy(draft, defaultRelicSynergy);
  const tally = new Map(relicSynergyBandOrder.map((band) => [band, 0]));
  for (const cell of relicSynergyCells(draft)) tally.set(cell.band, (tally.get(cell.band) ?? 0) + 1);

  function step(property: RelicPropertyDefinition, main: RelicMainProperty, event: MouseEvent<HTMLButtonElement>) {
    const band = cycledRelicSynergyBand(relicSynergy(draft, main, property.id), event.shiftKey ? -1 : 1);
    setDraft((current) => withRelicSynergyCell(current, property.id, main, band));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(relicSynergyChoices(draft));
    onClose();
  }

  return <Overlay labelledBy="relic-synergy-title" describedBy="relic-synergy-hint" className="relic-synergy-overlay"
    dismissible={!dirty} onClose={onClose} onSubmit={submit}
    actions={<OverlayAction kind="save" label="Save synergy" type="submit" disabled={!dirty} />}>
    <header className="relic-synergy-head">
      <div className="relic-synergy-identity">
        <p className="eyebrow">Relic Optimization</p>
        <h2 id="relic-synergy-title">Synergy map</h2>
        <p id="relic-synergy-hint" className="type-caption relic-synergy-hint">
          Click a cell for the next band down; Shift-click for the next one up.
        </p>
      </div>
      <div className="relic-synergy-tools">
        <Button size="compact" disabled={atDefaults} onClick={() => setDraft(defaultRelicSynergy)}>
          Reset to defaults
        </Button>
        <dl className="overlay-facts relic-synergy-tally" aria-label="Cells in each band">
          {relicSynergyBandOrder.map((band) => <div key={band}>
            <dt>{relicSynergyBandLabels[band]}</dt>
            <dd>{tally.get(band)}</dd>
          </div>)}
        </dl>
      </div>
    </header>

    <div className="overlay-body">
      <table className="relic-synergy-table" aria-label="Relic synergy by unique property and main stat">
        <colgroup>
          <col className="relic-synergy-family-column" />
          <col className="relic-synergy-property-column" />
          {relicMainPropertyOrder.map((main) => <col key={main} className="relic-synergy-band-column" />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="type-label">Family</th>
            <th scope="col" className="type-label">Unique property</th>
            {relicMainPropertyOrder.map((main) => <th key={main} scope="col" className="type-label">{main} main</th>)}
          </tr>
        </thead>
        {families.map(({ family, members }) => <tbody key={family} className="relic-synergy-family">
          {members.map((property, at) => <tr key={property.id}>
            {at === 0 && <th scope="rowgroup" rowSpan={members.length} className="type-label relic-synergy-family-name">{family}</th>}
            <th scope="row" className="relic-synergy-property">
              <span className="type-body relic-synergy-property-name">{property.name}</span>
              <span className="type-caption relic-synergy-property-effect">{effectText(property)}</span>
            </th>
            {relicMainPropertyOrder.map((main) => {
              const band = relicSynergy(draft, main, property.id);
              const changed = !isDefaultRelicSynergyCell(draft, property.id, main);
              const shipped = relicSynergyBandLabels[relicSynergy(defaultRelicSynergy, main, property.id)];
              return <td key={main}>
                <button type="button" className="relic-synergy-cell" data-band={band}
                  data-changed={changed ? 'true' : undefined}
                  aria-label={`${property.name}, ${main} main: ${relicSynergyBandLabels[band]}`
                    + (changed ? `, default ${shipped}` : '')}
                  title={changed ? `Default: ${shipped}` : undefined}
                  onClick={(event) => step(property, main, event)}>
                  <RelicSynergyMark band={band} />
                  {/* Always drawn and only shown when the cell differs from the
                      shipped one, so a changed cell grows no wider. */}
                  <span className="relic-synergy-changed" aria-hidden="true" />
                </button>
              </td>;
            })}
          </tr>)}
        </tbody>)}
      </table>
    </div>
  </Overlay>;
}
