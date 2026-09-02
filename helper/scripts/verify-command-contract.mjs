#!/usr/bin/env node

/**
 * Proves every `#[tauri::command]` the dashboard calls through `call()` returns
 * either text or nothing.
 *
 * `call()` puts whatever a command returns into the message line, and the
 * message line renders it as a React child. A command that answers with an
 * object therefore throws "Objects are not valid as a React child", and React
 * unmounts the whole tree: the window keeps its background colour and loses
 * every control. `set_traffic_logging` returned the status dashboard and did
 * exactly this — the helper went blank the moment the traffic warning was
 * accepted, and nothing in the window could recover it.
 *
 * The check is structural because the failure lives between the two languages.
 * Rust compiles, TypeScript typechecks, and the Rust tests pass; only the pair
 * is wrong. `invoke` is typed by hand at the call site, so the type parameter
 * is an assertion about Rust that nothing verifies.
 *
 * Usage: node scripts/verify-command-contract.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const helperRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendPath = resolve(helperRoot, 'src-tauri/src/main.rs');
const dashboardPath = resolve(helperRoot, 'src/App.tsx');

/** Return types a React child can hold. `String` renders; `Value` does not. */
const renderableReturns = new Set(['String', 'Option<String>']);

/**
 * Every `#[tauri::command]` with its declared return type. `None` means the
 * function declared no `->` at all, which reaches JavaScript as `null`.
 */
function commands(source) {
  const found = new Map();
  const pattern = /#\[tauri::command\]\s*(?:\/\/[^\n]*\n\s*)*fn\s+(\w+)\s*\(([\s\S]*?)\)\s*(->\s*([^{]+?))?\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    found.set(match[1], match[4]?.trim() ?? null);
  }
  return found;
}

/** The success type of a command, with `Result<_, E>` unwrapped to its `Ok`. */
function successType(returned) {
  if (returned === null) return null;
  const result = returned.match(/^Result\s*<([\s\S]+)>$/);
  if (!result) return returned;
  let depth = 0;
  const inner = result[1];
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (character === '<') depth += 1;
    else if (character === '>') depth -= 1;
    else if (character === ',' && depth === 0) return inner.slice(0, index).trim();
  }
  return inner.trim();
}

/** Command names the dashboard passes to `call()`, whose result becomes text. */
function calledThroughCall(source) {
  return new Set([...source.matchAll(/\bcall\(\s*'([^']+)'/g)].map((match) => match[1]));
}

async function main() {
  const [backend, dashboard] = await Promise.all([
    readFile(backendPath, 'utf8'),
    readFile(dashboardPath, 'utf8'),
  ]);

  const declared = commands(backend);
  if (declared.size === 0) {
    console.error('No #[tauri::command] functions found. The check cannot prove anything.');
    process.exitCode = 1;
    return;
  }

  const called = calledThroughCall(dashboard);

  /* A name the dashboard calls that the backend does not answer fails at the
     click with a bare Tauri error, so it belongs in the same check. */
  const missing = [...called].filter((command) => !declared.has(command));

  /* The failure this check exists for: text is expected, an object arrives. */
  const objectReturns = [...called]
    .filter((command) => declared.has(command))
    .map((command) => ({ command, success: successType(declared.get(command)) }))
    .filter(({ success }) => success !== null && success !== '()' && !renderableReturns.has(success));

  /* `call()` must keep rejecting non-text even when a command is right today,
     so one wrong return type can never blank the window again. */
  const guardsAgainstNonText = /typeof\s+result\s*===\s*'string'/.test(dashboard);

  let failed = false;

  if (missing.length) {
    failed = true;
    console.error(`${missing.length} command(s) the dashboard calls do not exist in the backend:`);
    for (const command of missing.sort()) console.error(`  ${command}`);
    console.error('  Clicking the control raises a Tauri error instead of acting.');
  }

  if (objectReturns.length) {
    failed = true;
    console.error(`\n${objectReturns.length} command(s) return a value the message line cannot render:`);
    for (const { command, success } of objectReturns) {
      console.error(`  ${command} -> ${success}`);
    }
    console.error('  call() shows a command\'s result as text, and a non-string child unmounts');
    console.error('  the dashboard, leaving an empty window. Return String, or nothing and let');
    console.error('  the next helper_status refresh carry the state.');
  }

  if (!guardsAgainstNonText) {
    failed = true;
    console.error('\ncall() no longer checks that a result is a string before showing it.');
    console.error('  That check is the reason one wrong return type cannot blank the window.');
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  const shape = [...declared]
    .map(([command, returned]) => {
      const success = successType(returned);
      const kind = success === null || success === '()' ? 'nothing' : success;
      return `${command} -> ${kind}${called.has(command) ? ' (shown as text)' : ''}`;
    })
    .sort();
  console.log(`${declared.size} helper command(s):`);
  for (const line of shape) console.log(`  ${line}`);
  console.log('Every command shown as text returns text or nothing, and call() rejects the rest.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
