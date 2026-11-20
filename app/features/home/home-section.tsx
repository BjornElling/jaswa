import type { DragEvent } from 'react';
import { Button, LabelSwap } from '../../ui/button';
import { WorkspacePage } from '../../ui/workspace-page';
import { ImportRouteCard, RadioRow } from '../../ui/form-controls';
import { StatusMark } from './status-mark';
import { helperLabels } from './status-labels';
import { formatDateTime } from '../../domain/shared/formatting';
import { HelperDownload } from './helper-download';
import type { HelperConnection } from '../../workspace/ports';
import { helperStatusMessage } from '../../workspace/helper-status';
import { recommendedHelperVersion } from '../../domain/shared/helper-version';
import type { DirectImportMode, GeneralSettings, ImportRoute, ImportedGame } from '../../domain/model';

export function HomeSection({ game, message, dragging, onPickFile, onDragOver, onDragLeave, onDrop, onRemove, directImportMode, onDirectImportMode, importRoute, onImportRoute, helperConnection, general }: {
  game: ImportedGame | null;
  general: GeneralSettings;
  message: string;
  dragging: boolean;
  onPickFile: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  directImportMode: DirectImportMode;
  onDirectImportMode: (mode: DirectImportMode) => void;
  importRoute: ImportRoute;
  onImportRoute: (route: ImportRoute) => void;
  helperConnection: HelperConnection;
}) {
  const unknownMonsterIds = game?.report.unknownMonsterIds ?? [];
  const helperState = helperConnection.restartRequired ? 'restart' : helperConnection.state;
  const helperLabel = helperConnection.restartRequired ? 'Restart game' : helperLabels[helperConnection.state];
  const helperDownloadState = importRoute !== 'direct' ? 'unknown'
    : helperConnection.updateAvailable ? 'update'
      : helperConnection.version === recommendedHelperVersion ? 'current' : 'unknown';

  return <WorkspacePage
    header={<header className="hero">
      <div className="hero-rune" aria-hidden="true">
        <img src="/favicon.svg" alt="" width={520} height={520} />
      </div>
      <h2 className="hero-name" aria-label="Just Another Summoners War App">
        <span aria-hidden="true" className="hero-line one">Just Another</span>
        <span aria-hidden="true" className="hero-line two">Summoners War</span>
        <span aria-hidden="true" className="hero-line three">App</span>
      </h2>
      <p className="hero-quote">Roll. Sell. <span>Repeat.</span></p>
    </header>}
  >
    <section className="panel">
      <h3 className="block-title">Game data</h3>
      <div className="stack">
        {game && <div className="loaded-data">
          <div className="loaded-data-text">
            <p className="eyebrow">Currently loaded</p>
            <p className="meta-line">{game.fileName} · imported {formatDateTime(game.importedAt, general, true)}</p>
          </div>
          <Button tone="danger" onClick={onRemove}>Remove game data</Button>
        </div>}

        {game && unknownMonsterIds.length > 0 && <p className="notice warning">
          Name information is missing for monster type{unknownMonsterIds.length === 1 ? '' : 's'} {unknownMonsterIds.join(', ')}.{' '}
          Use <b>Report Issue</b> in the left rail to tell the developer.
        </p>}

        <p className="notice import-message" role="status">{message}</p>

        <p className="lead">
          Two ways to get your game data in here: Either let a small helper
          pickpocket it, or hand it over in classic JSON-style.
        </p>

        <div className="import-routes" role="radiogroup" aria-label="How to load game data">
          <ImportRouteCard
            option="Option 1" name="Direct import" qualifier="Windows + Steam only"
            value="direct" current={importRoute} onChoose={onImportRoute}
          >
            <p className="lead">
              A small helper that keeps the program synchronized with your game.
              No exporting, no JSON files, no need to re-import every time you
              make a change.
            </p>

            <p className="lead">
              Installation requires administrator rights, and you will be asked
              to approve a certificate.
            </p>

            <div className="route-download">
              <HelperDownload />
              <span className="helper-download-status" role="status"
                data-state={helperDownloadState}>
                <LabelSwap showing={helperDownloadState} faces={{
                  current: 'Running helper is up to date.',
                  update: <span className="helper-download-update">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" />
                      <path d="M8 7v4m0-7v.01" />
                    </svg>
                    New version · v{recommendedHelperVersion}
                  </span>,
                }} />
              </span>
            </div>

            <section className={`statistics acceleration ${helperState} route-link`} role="status" aria-label="Helper program connection">
              <span className="helper-current-version" title="Running helper version">
                {helperConnection.version ? `v${helperConnection.version}` : '—'}
              </span>
              <div className="acceleration-verdict">
                <StatusMark state={helperState} />
                <p className="acceleration-word">{helperLabel}</p>
              </div>
              <p className="acceleration-adapter">
                <b>{helperStatusMessage(helperConnection)}</b>
              </p>
            </section>

            <fieldset className="route-modes">
              <legend className="field-legend">Once it is connected</legend>
              <RadioRow
                name="direct-import-mode"
                label="Always synchronized"
                note="The program will constantly display the same data as your game. Good while leveling up runes. Bad for planning since any changes you make will be constantly overwritten."
                value="live"
                current={directImportMode}
                onChange={onDirectImportMode}
              />
              <RadioRow
                name="direct-import-mode"
                label="Read on game start"
                note="Loads data when you start the game. Good for planning. Use Reload game data to read later changes when you choose."
                value="on-load"
                current={directImportMode}
                onChange={onDirectImportMode}
              />
            </fieldset>
          </ImportRouteCard>

          <div className="settings-rule" role="presentation" />

          <ImportRouteCard
            option="Option 2" name="Load a JSON file"
            value="file" current={importRoute} onChoose={onImportRoute}
          >
            <p className="lead">
              The file your game exporter wrote. Works today, works offline, and
              is as current as the moment you exported it.
            </p>
            <ul className="route-links">
              <li>
                To get your JSON data you need{' '}
                <a className="text-link" href="https://github.com/Xzandro/sw-exporter/releases"
                  target="_blank" rel="noreferrer noopener">SWEX</a>
              </li>
              <li>
                You might also need this{' '}
                <a className="text-link" href="https://www.swlens.io/guides/swex-json"
                  target="_blank" rel="noreferrer noopener">installation guide</a>
              </li>
            </ul>
            <div
              className={['drop-zone', dragging ? 'dragging' : '', game ? 'settled' : ''].filter(Boolean).join(' ')}
              onDragOver={importRoute === 'file' ? onDragOver : undefined}
              onDragLeave={importRoute === 'file' ? onDragLeave : undefined}
              onDrop={importRoute === 'file' ? onDrop : undefined}
              onClick={importRoute === 'file' ? onPickFile : undefined}
              role="button" tabIndex={importRoute === 'file' ? 0 : -1}
              aria-disabled={importRoute === 'file' ? undefined : true}
              onKeyDown={(event) => {
                if (importRoute !== 'file') return;
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPickFile(); }
              }}
            >
              <span className="glyph" aria-hidden="true">↓</span>
              <strong>{game ? 'Replace with another JSON file' : 'Drop your Summoners War JSON file here'}</strong>
              <span>or choose a file from your computer</span>
            </div>
          </ImportRouteCard>
        </div>
      </div>
    </section>
  </WorkspacePage>;
}
