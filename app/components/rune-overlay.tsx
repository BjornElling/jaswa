import { useEffect, useMemo, useRef } from 'react';
import { Button } from './button';
import { CircularArrowsMark } from './converted-artifact-mark';
import { AncientName } from './ancient-mark';
import { QualityRule } from './quality-rule';
import type { GameRecord } from '../lib/game-data';
import { mainPropertyMaximum } from '../lib/rune-properties';
import { runeStatName, runeSubValue } from '../lib/runes';
import type { Rune } from '../lib/runes';
import { runeOverlayProjection } from '../lib/rune-overlay-projection';
import type { RunePotentialSettings } from '../lib/types';

function PowerUpArrow() {
  return <svg className="rune-overlay-roll-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 13V3" />
    <path d="m4.5 6.5 3.5-3.5 3.5 3.5" />
  </svg>;
}

function percent(chance: number): string {
  if (chance >= 1) return '100 %';
  if (chance <= 0) return '0 %';
  if (chance < 0.01) return '<1 %';
  return `${Math.round(chance * 100)} %`;
}

function substatRollMark(rune: Rune, statName: string, rolls: number | null) {
  return <span className="rune-overlay-rolls" aria-label={rolls === null
    ? `${statName} power-up roll history is not present in this import`
    : `${rolls} power-up rolls in ${statName}`}>
    <PowerUpArrow /><span aria-hidden="true">{rolls === null ? '?' : rolls}</span>
  </span>;
}

function equippedOn(rune: Rune, game: GameRecord | undefined): string {
  if (rune.occupiedId === null) return 'Inventory';
  const units = Array.isArray(game?.unit_list) ? game.unit_list as GameRecord[] : [];
  const unit = units.find((entry) => String(entry.unit_id) === rune.occupiedId);
  if (!unit) return 'Unknown monster';
  const name = unit.name ?? unit.unit_name;
  if (typeof name === 'string' && name.trim()) return name;
  return `Monster ${String(unit.unit_master_id ?? unit.master_id ?? rune.occupiedId)}`;
}

export function RuneOverlay({ rune, game, settings, onClose }: {
  rune: Rune;
  game: GameRecord | undefined;
  settings: RunePotentialSettings;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const projection = useMemo(() => runeOverlayProjection(rune, settings), [rune, settings]);
  const mainName = runeStatName(rune.mainStatId) ?? 'Unknown main';
  const mainMaximum = mainPropertyMaximum(rune.stars, rune.mainStatId);
  const innateName = rune.prefixStatId === null ? null : runeStatName(rune.prefixStatId) ?? 'Unknown innate';

  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return <div className="modal-backdrop">
    <div ref={dialog} className="dialog overlay rune-overlay" role="dialog" aria-modal="true"
      aria-labelledby="rune-overlay-title" aria-describedby="rune-overlay-summary">
      <header className="overlay-head rune-overlay-head">
        <QualityRule tier={rune.defaultGrade} />
        <div className="overlay-identity">
          <h2 id="rune-overlay-title" className="overlay-hero-name type-title">
            <AncientName name={rune.setName} ancient={rune.ancient} />
          </h2>
          <p id="rune-overlay-summary" className="overlay-hero-facts">
            {rune.stars}★ · Slot {rune.slot} · +{rune.level} · {equippedOn(rune, game)}
          </p>
        </div>
        <Button ref={closeButton} onClick={onClose}>Close</Button>
      </header>

      <div className="overlay-body">
        <section className="overlay-block">
          <header className="overlay-block-head"><h3 className="overlay-block-title">Rune facts</h3><p className="overlay-provenance">Imported account data</p></header>
          <dl className="rune-overlay-facts">
            <div><dt>Quality</dt><dd>{rune.defaultGrade}</dd></div>
            <div><dt>Slot</dt><dd>{rune.slot}</dd></div>
            <div><dt>Main</dt><dd>{mainName}{rune.mainValue > 0 ? ` · ${rune.mainValue}` : ''} <span className="muted">→ +15 {mainMaximum}</span></dd></div>
            <div><dt>Innate</dt><dd>{innateName === null ? 'None' : `${innateName} ${rune.prefixValue}`}</dd></div>
            <div><dt>Equipped on</dt><dd>{equippedOn(rune, game)}</dd></div>
          </dl>
        </section>

        <section className="overlay-block">
          <header className="overlay-block-head"><h3 className="overlay-block-title">Substats</h3><p className="overlay-provenance">Natural rolls and current craft marks</p></header>
          <div className="rune-overlay-substats" role="list">
            {rune.subProperties.length === 0
              ? <p className="overlay-empty">No substats yet.</p>
              : rune.subProperties.map((property) => {
                const name = runeStatName(property.statId) ?? 'Unknown stat';
                return <div className="rune-overlay-substat" role="listitem" key={property.statId}>
                  <span className="rune-overlay-substat-name">{name}</span>
                  <span className="rune-overlay-substat-value">{runeSubValue(property)}</span>
                  <span className="rune-overlay-substat-marks">
                    {property.gemmed && <CircularArrowsMark label={`${name} is enchanted`} className="rune-overlay-enchanted-mark" />}
                    {substatRollMark(rune, name, property.rolls ?? null)}
                    {property.grind > 0 && <span className="rune-overlay-grind">+{property.grind}</span>}
                  </span>
                </div>;
              })}
          </div>
          <p className="overlay-provenance rune-overlay-history-note">
            A question mark means the export preserved the final value but not its individual power-up history; simulated runes carry the exact arrow count.
          </p>
        </section>

        <section className="overlay-block">
          <header className="overlay-block-head"><h3 className="overlay-block-title">Substat potential at +15</h3><p className="overlay-provenance">+12→+15 is main-stat only</p></header>
          <div className="table-wrap rune-overlay-table-wrap">
            <table className="rune-overlay-table">
              <thead><tr><th scope="col">Substat</th><th scope="col">Now</th><th scope="col">Max</th><th scope="col">Chance</th></tr></thead>
              <tbody>{projection.rows.map((row) => {
                const name = runeStatName(row.statId) ?? 'Unknown stat';
                const best = row.statId === projection.bestStatId;
                return <tr key={row.statId} className={best ? 'rune-overlay-best' : undefined}>
                  <th scope="row">{name}{best && <span className="rune-overlay-best-label">Best potential</span>}</th>
                  <td>{row.current || '—'}</td>
                  <td>{row.maximum}</td>
                  <td>{percent(row.chance)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </section>

        <section className="overlay-block">
          <header className="overlay-block-head"><h3 className="overlay-block-title">What can still improve</h3><p className="overlay-provenance">Settings-driven projection</p></header>
          <div className="rune-overlay-improvements">
            <div className="rune-overlay-event-path" aria-label="Remaining rune events">
              {[...projection.events, { level: 15, kind: 'main' as const }].map((event) =>
                <span className="rune-overlay-event" key={event.level}>
                  <span className="rune-overlay-event-level">+{event.level}</span>
                  <span>{event.kind === 'roll' ? 'Power-up roll' : event.kind === 'add' ? 'Reveal substat' : 'Main stat only'}</span>
                </span>)}
            </div>
            <p className="rune-overlay-improvement-summary">
              {projection.remainingRolls} substat roll{projection.remainingRolls === 1 ? '' : 's'} and {projection.remainingAdditions} new line{projection.remainingAdditions === 1 ? '' : 's'} remain before +12; +15 adds no new substat roll.
            </p>
            {projection.rows.filter((row) => row.current > 0).map((row) => {
              const name = runeStatName(row.statId) ?? 'Unknown stat';
              return <p className="rune-overlay-improvement" key={row.statId}>
                <b>{name}</b>: {row.remainingRolls ? `${row.remainingRolls} possible roll${row.remainingRolls === 1 ? '' : 's'}` : 'no natural rolls left'}
                {row.grind > 0 && ` · configured Grindstone +${row.grind}`}
                {row.gemMaximum !== null && ` · configured Gem up to ${row.gemMaximum}`}
              </p>;
            })}
          </div>
        </section>
      </div>
      <div className="dialog-actions"><span className="type-caption">Rune details are read-only.</span><Button onClick={onClose}>Close</Button></div>
    </div>
  </div>;
}
