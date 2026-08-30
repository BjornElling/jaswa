'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { dataDirectory } = require('./config.cjs');

/* One line per exchange, each a complete JSON object. A whole-file JSON array
   would need rewriting on every append and would be unreadable if the helper
   stopped mid-session, which is exactly when a log is worth having. */
function trafficLogPath(directory = dataDirectory()) {
  return path.join(directory, 'traffic.log');
}

/* Sessions run long and responses are large. A cap keeps an afternoon of play
   from filling the disk; the log rolls over rather than truncating mid-line, so
   every retained entry stays parseable. */
const maximumLogBytes = 64 * 1024 * 1024;

/**
 * Records decoded gateway exchanges for investigation.
 *
 * This is a developer tool, not part of the import. It writes the request and
 * response the game already exchanged, decrypted, to a local file the user
 * opens themselves. It is off unless switched on, and it never uploads.
 */
class TrafficLog {
  constructor({ directory = dataDirectory(), maximumBytes = maximumLogBytes } = {}) {
    this.directory = directory;
    this.maximumBytes = maximumBytes;
    this.enabled = false;
    this.entries = 0;
    this.bytes = 0;
    /* Survives switching off, so a finished recording can still be opened.
       Reset only when a new session overwrites the file. */
    this.recorded = false;
    this.lastError = null;
    /* Responses arrive faster than the disk answers. Chaining keeps the file's
       line order equal to the traffic's order and stops interleaved writes. */
    this.writing = Promise.resolve();
  }

  file() {
    return trafficLogPath(this.directory);
  }

  isEnabled() {
    return this.enabled;
  }

  /** Returns the state actually reached, so a caller can trust the answer. */
  setEnabled(enabled) {
    if (enabled === this.enabled) return this.enabled;
    this.enabled = enabled;
    if (enabled) {
      this.entries = 0;
      this.bytes = 0;
      this.recorded = false;
      this.lastError = null;
      /* Each session starts clean: a log that silently continued an earlier one
         would invite reading yesterday's traffic as today's evidence. */
      this.writing = this.writing.then(() => this.#reset());
    }
    return this.enabled;
  }

  async #reset() {
    try {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(this.file(), '', 'utf8');
    } catch (error) {
      this.lastError = error.message;
    }
  }

  /**
   * Queues one exchange. Never throws and never rejects: logging is an
   * observer, and a failed write must not disturb the import it observes.
   */
  record(command, request, response) {
    if (!this.enabled) return;
    if (this.bytes >= this.maximumBytes) return;
    const line = `${JSON.stringify({
      at: new Date().toISOString(),
      command: typeof command === 'string' && command ? command : null,
      request,
      response,
    })}\n`;
    this.bytes += Buffer.byteLength(line, 'utf8');
    this.entries += 1;
    this.recorded = true;
    const full = this.bytes >= this.maximumBytes;
    this.writing = this.writing.then(async () => {
      try {
        await fs.mkdir(this.directory, { recursive: true });
        await fs.appendFile(this.file(), line, 'utf8');
        if (full) await fs.appendFile(this.file(), `${JSON.stringify({ at: new Date().toISOString(), note: 'Log limit reached. Recording stopped.' })}\n`, 'utf8');
      } catch (error) {
        this.lastError = error.message;
      }
    });
  }

  /** Resolves once every queued write has landed, so a reader sees them all. */
  async flush() {
    await this.writing;
  }

  status() {
    return {
      enabled: this.enabled,
      entries: this.entries,
      recorded: this.recorded,
      bytes: this.bytes,
      full: this.bytes >= this.maximumBytes,
      file: this.file(),
      lastError: this.lastError,
    };
  }
}

module.exports = { TrafficLog, maximumLogBytes, trafficLogPath };
