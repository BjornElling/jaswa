import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MonsterPortrait } from '../../ui/gear/monster-portrait';

export type TeamFace = { key: string; name: string; imageFilename?: string; initial: string };
export type TeamChoice = { id: string; name: string; faces: readonly TeamFace[] };

/**
 * One preset out of a content's, each shown with the faces of its team.
 *
 * A native select cannot draw a picture inside an option, and the faces are the
 * point: "Arena Attack 3" says nothing, the four monsters in it say which one it
 * is. So this is a select-only combobox in the APG's sense — focus stays on the
 * field, the arrows walk the list, Enter takes the one walked to — drawn in the
 * same box as every other dropdown.
 *
 * The list is absolutely positioned, so opening it moves nothing behind it, and
 * every face sits in a column wide enough for the largest team, so a name lines
 * up with the names above and below it however many monsters each one holds
 * (`AGENTS.md` §2).
 */
export function PresetTeamPicker({ id, teams, value, placeholder, disabled = false, onOpen, onChange }: {
  id: string;
  teams: readonly TeamChoice[];
  /** `''` while none is chosen. */
  value: string;
  placeholder: string;
  disabled?: boolean;
  /** Told when the list opens, so the faces in it can be fetched before they are looked at. */
  onOpen?: () => void;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (at: number) => `${listId}-${at}`;
  const chosen = teams.find((team) => team.id === value) ?? null;
  const showing = open && !disabled && teams.length > 0;

  useEffect(() => {
    if (!showing) return undefined;
    function onPointerDown(event: MouseEvent) {
      if (field.current && !field.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showing]);

  useEffect(() => {
    if (showing) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  });

  function show(at: number) {
    if (disabled || teams.length === 0) return;
    setActive(Math.max(0, Math.min(teams.length - 1, at)));
    setOpen(true);
    onOpen?.();
  }

  function choose(at: number) {
    const team = teams[at];
    setOpen(false);
    if (team && team.id !== value) onChange(team.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = teams.findIndex((team) => team.id === value);
    if (!showing) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show(Math.max(0, current)); }
      else if (event.key === 'Home') { event.preventDefault(); show(0); }
      else if (event.key === 'End') { event.preventDefault(); show(teams.length - 1); }
      return;
    }
    const last = teams.length - 1;
    const step: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last, PageDown: active + 10, PageUp: active - 10 };
    if (event.key in step) {
      event.preventDefault();
      setActive(Math.max(0, Math.min(last, step[event.key])));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      /* Stopped here: an overlay behind the page closes on Escape too. */
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return <div className="preset-team-picker" ref={field}>
    <button type="button" id={id} role="combobox" className="jaswa-select preset-team-button"
      aria-haspopup="listbox" aria-expanded={showing} aria-controls={showing ? listId : undefined}
      aria-activedescendant={showing ? optionId(active) : undefined}
      data-placeholder={chosen ? undefined : ''} disabled={disabled}
      onClick={() => (showing ? setOpen(false) : show(Math.max(0, teams.findIndex((team) => team.id === value))))}
      onKeyDown={onKeyDown}>
      {chosen ? <TeamLine team={chosen} /> : <span className="preset-team-name">{placeholder}</span>}
    </button>
    {showing && <ul className="preset-team-list" id={listId} role="listbox" aria-labelledby={id}>
      {teams.map((team, at) => <li key={team.id} id={optionId(at)} role="option" className="preset-team-option"
        aria-selected={team.id === value} data-active={at === active || undefined}
        /* Keeps focus on the field, where the keys are read. */
        onMouseDown={(event) => event.preventDefault()}
        onMouseMove={() => setActive(at)} onClick={() => choose(at)}>
        <TeamLine team={team} />
      </li>)}
    </ul>}
  </div>;
}

function TeamLine({ team }: { team: TeamChoice }) {
  return <>
    <span className="preset-team-name">{team.name}</span>
    <span className="preset-team-faces" aria-hidden="true">
      {team.faces.map((face) => <MonsterPortrait key={face.key} imageFilename={face.imageFilename} initial={face.initial} name={face.name} decorative />)}
    </span>
    {team.faces.length > 0 && <span className="visually-hidden">: {team.faces.map((face) => face.name).join(', ')}</span>}
  </>;
}
