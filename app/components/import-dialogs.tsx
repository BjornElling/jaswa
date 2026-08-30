import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ReportCategory } from '../lib/workspace-config';
import type { DirectImportMode, ImportedGame } from '../lib/types';

/**
 * Escape closes the dialog, and the safe action takes focus when it opens.
 *
 * Returns the ref to put on that button. The cancel callback is held in a ref
 * of its own so the listener is bound once for the life of the dialog: a
 * parent that passes a new closure on every render would otherwise rebind it
 * on every render.
 */
function useDismissable(onCancel: () => void): RefObject<HTMLButtonElement | null> {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    cancelRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancelRef.current();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return cancelRef;
}

export function RemoveGameDataDialog({ onCancel, onConfirm }: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useDismissable(onCancel);

  return <div className="modal-backdrop" role="presentation">
    <section className="dialog" role="dialog" aria-modal="true"
      aria-labelledby="remove-game-data-title" aria-describedby="remove-game-data-description">
      <p className="eyebrow">Remove game data</p>
      <h2 id="remove-game-data-title">Remove the current game data?</h2>
      <p id="remove-game-data-description">You probably have already deducted this, but this action will remove the imported game data from JASWA.</p>
      <div className="dialog-actions">
        <button ref={cancelRef} className="button" onClick={onCancel}>Cancel</button>
        <button className="button danger" onClick={onConfirm}>Remove game data</button>
      </div>
    </section>
  </div>;
}

export function DirectImportModeDialog({ mode, onCancel, onConfirm }: {
  mode: DirectImportMode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useDismissable(onCancel);

  const switchingToOnLoad = mode === 'on-load';
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog" role="dialog" aria-modal="true"
      aria-labelledby="direct-import-mode-title" aria-describedby="direct-import-mode-warning">
      <p className="eyebrow">Change sync mode</p>
      <h2 id="direct-import-mode-title">{switchingToOnLoad ? 'Stop automatic synchronization?' : 'Turn on automatic synchronization?'}</h2>
      <p id="direct-import-mode-warning">
        {switchingToOnLoad
          ? 'Automatic synchronization will stop. Updating the game data in this mode will require you to restart Summoners War.'
          : 'Warning: this will overwrite any changes you may have made to the current game data.'}
      </p>
      <div className="dialog-actions">
        <button ref={cancelRef} className="button" onClick={onCancel}>Cancel</button>
        <button className="button primary" onClick={onConfirm}>Switch mode</button>
      </div>
    </section>
  </div>;
}

/**
 * Loading a .sw file replaces every preference at once — names, goals, rune
 * requirements, presets — and the file is chosen before JASWA can say what is
 * in it, so the warning has to come before the picker rather than after.
 */
export function LoadPreferencesDialog({ onCancel, onConfirm }: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useDismissable(onCancel);

  return <div className="modal-backdrop" role="presentation">
    <section className="dialog" role="dialog" aria-modal="true"
      aria-labelledby="load-preferences-title" aria-describedby="load-preferences-warning">
      <p className="eyebrow">Load personalization</p>
      <h2 id="load-preferences-title">Replace your personalization?</h2>
      <p id="load-preferences-warning">
        Everything you have set up for monsters, runes and artifacts — names,
        goals, rune requirements and saved presets — is overwritten by the file
        you choose next. Your imported game data is not affected.
      </p>
      <div className="dialog-actions">
        <button ref={cancelRef} className="button" onClick={onCancel}>Cancel</button>
        <button className="button primary" onClick={onConfirm}>Choose file…</button>
      </div>
    </section>
  </div>;
}

export function ReplaceImportDialog({ pendingGame, onCancel, onReplace, onReport }: {
  pendingGame: ImportedGame;
  onCancel: () => void;
  onReplace: () => void;
  onReport: (category: ReportCategory, details: string) => void;
}) {
  const unknownMonsterIds = pendingGame.report.unknownMonsterIds;
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title">
      <p className="eyebrow">Replace game data</p>
      <h2 id="replace-title">Replace the current import?</h2>
      <p>This removes all current game data and replaces it with <strong>{pendingGame.fileName}</strong>. Your saved names, goals and preferences remain.</p>
      {unknownMonsterIds.length > 0 && <p className="notice warning">
        {unknownMonsterIds.length} monster type{unknownMonsterIds.length === 1 ? '' : 's'} {unknownMonsterIds.length === 1 ? 'is' : 'are'} newer than JASWA’s name list. {unknownMonsterIds.join(', ')} will still be imported, shown by game ID until the list is updated.{' '}
        <button className="notice-link" onClick={() => onReport('Monster', `JASWA could not find name information for monster type(s): ${unknownMonsterIds.join(', ')}.\n\nJSON file: ${pendingGame.fileName}`)}>Report this</button>
      </p>}
      <div className="dialog-actions">
        <button className="button" onClick={onCancel}>Cancel</button>
        <button className="button primary" onClick={onReplace}>Replace data</button>
      </div>
    </section>
  </div>;
}

export function ReportDialog({ report, onChange, onCancel, onSend }: {
  report: { category: ReportCategory; details: string };
  onChange: (report: { category: ReportCategory; details: string }) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const categories: ReportCategory[] = ['Monster', 'Rune', 'Gem', 'Grindstone', 'Artifact', 'Relic', 'Other'];
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <p className="eyebrow">Send a report</p>
      <h2 id="report-title">Report missing data</h2>
      <p>Your mail program opens with this report filled in. Review it, then send it to the developer.</p>
      <label className="field"><span>Data type</span>
        <select value={report.category} onChange={(event) => onChange({ ...report, category: event.target.value as ReportCategory })}>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label className="field"><span>What is missing or unrecognized?</span>
        <textarea value={report.details} onChange={(event) => onChange({ ...report, details: event.target.value })}
          placeholder="Include the name, game ID, or anything else shown by JASWA." />
      </label>
      <p className="notice">JASWA does not attach your game data to the e-mail.</p>
      <div className="dialog-actions">
        <button className="button" onClick={onCancel}>Cancel</button>
        <button className="button primary" onClick={onSend}>Open e-mail</button>
      </div>
    </section>
  </div>;
}
