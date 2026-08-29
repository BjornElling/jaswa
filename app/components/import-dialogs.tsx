import type { ReportCategory } from '../lib/workspace-config';
import type { ImportedGame } from '../lib/types';

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
