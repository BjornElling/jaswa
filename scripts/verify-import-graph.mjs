#!/usr/bin/env node

/**
 * Holds the source tree's dependency direction (`docs/ARCHITECTURE-FROM-SCRATCH.md`
 * §§5, 21.5 and 22.3) over the whole import graph, relative paths, dynamic
 * imports and worker URLs included. ESLint sees one import at a time; this
 * check sees the graph, so it also rejects cycles and a rule module that
 * reaches a procedure through a neighbour.
 *
 * Usage: node scripts/verify-import-graph.mjs [--list]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), '..');
const toRepo = (file) => relative(root, file).split('\\').join('/');

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(join(root, 'app')).filter((file) => /\.(ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file)).map(toRepo);
const known = new Set(walk(join(root, 'app')).map(toRepo));
const candidates = ['', '.ts', '.tsx', '.json', '.css', '/index.ts', '/index.tsx'];

function resolveSpecifier(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier.replace(/\?.*$/, '')));
  for (const extension of candidates) if (known.has(base + extension)) return base + extension;
  throw new Error(`${from}: cannot resolve ${specifier}`);
}

/** Every module a file depends on, with whether the dependency exists only for types. */
function dependencies(file) {
  const text = readFileSync(join(root, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const add = (specifier, typeOnly) => {
    const target = resolveSpecifier(file, specifier);
    if (target) found.push({ target, typeOnly });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly = Boolean(clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings
        && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      add(node.moduleSpecifier.text, typeOnly);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      add(node.arguments[0].text, false);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node.argument.literal.text, true);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL'
      && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[1]?.getText(source) === 'import.meta.url') {
      add(node.arguments[0].text, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `app/<layer>/...`; the composition entry and root files count as the shell. */
function layerOf(file) {
  const parts = file.split('/');
  if (parts.length === 2) return 'shell';
  return parts[1];
}

const allowed = {
  domain: ['domain', 'data'],
  ingest: ['ingest', 'domain', 'data'],
  workspace: ['workspace', 'domain', 'ingest', 'data'],
  platform: ['platform', 'domain', 'ingest', 'workspace', 'data'],
  ui: ['ui', 'domain', 'data', 'styles'],
  features: ['features', 'ui', 'workspace', 'domain', 'data', 'styles', 'platform'],
  shell: ['shell', 'features', 'ui', 'workspace', 'domain', 'ingest', 'platform', 'data', 'styles'],
  data: ['data'],
  styles: ['styles'],
};

/* Procedures compose rules; a rule never reaches back into a procedure. */
const procedures = ['app/domain/runes/cleanup/', 'app/domain/runes/craft-advice/', 'app/domain/runes/optimization/', 'app/domain/runes/simulator/'];
const procedureOf = (file) => procedures.find((prefix) => file.startsWith(prefix));
const featureOf = (file) => file.startsWith('app/features/') ? file.split('/')[2] : null;
const isTest = (file) => /\.test\.tsx?$/.test(file);

const graph = new Map(sources.map((file) => [file, dependencies(file)]));
const problems = [];
for (const [file, edges] of graph) {
  if (isTest(file)) continue;
  const layer = layerOf(file);
  const permitted = allowed[layer];
  if (!permitted) { problems.push(`${file}: unknown layer '${layer}'`); continue; }
  for (const { target } of edges) {
    const targetLayer = layerOf(target);
    if (!permitted.includes(targetLayer)) problems.push(`${file} → ${target}: ${layer} may not import ${targetLayer}`);
    const sourceFeature = featureOf(file);
    const targetFeature = featureOf(target);
    if (sourceFeature && targetFeature && sourceFeature !== targetFeature && !target.endsWith('/public.ts')) {
      problems.push(`${file} → ${target}: a feature may use another feature only through its public.ts`);
    }
    const targetProcedure = procedureOf(target);
    if (layer === 'domain' && targetProcedure && !procedureOf(file)) {
      problems.push(`${file} → ${target}: a domain rule may not depend on a procedure`);
    }
  }
}

/* Tarjan's strongly connected components over value imports: a cycle of types
   alone erases at compile time, but a value cycle depends on evaluation order. */
const index = new Map();
const low = new Map();
const onStack = new Set();
const stack = [];
const cycles = [];
let counter = 0;
function connect(file) {
  index.set(file, counter);
  low.set(file, counter);
  counter += 1;
  stack.push(file);
  onStack.add(file);
  for (const { target, typeOnly } of graph.get(file) ?? []) {
    if (typeOnly || !graph.has(target)) continue;
    if (!index.has(target)) {
      connect(target);
      low.set(file, Math.min(low.get(file), low.get(target)));
    } else if (onStack.has(target)) {
      low.set(file, Math.min(low.get(file), index.get(target)));
    }
  }
  if (low.get(file) === index.get(file)) {
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== file);
    if (component.length > 1) cycles.push(component.sort());
  }
}
for (const file of graph.keys()) if (!index.has(file)) connect(file);
for (const cycle of cycles) problems.push(`import cycle: ${cycle.join(' ↔ ')}`);

if (!existsSync(join(root, 'app/main.tsx'))) problems.push('app/main.tsx is missing');
if (problems.length) {
  console.error(`Import graph: ${problems.length} problem(s).`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Import graph: ${graph.size} modules, dependency direction and acyclicity hold.`);
