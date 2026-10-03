import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/* A TSX module that exports a helper alongside a component becomes an invalid
   React Refresh boundary on its next edit. Keep runtime helpers in .ts files. */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

function isExported(statement) {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

const invalid = [];
let checked = 0;
for (const path of sourceFiles('app')) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const exports = source.statements.filter(isExported);
  if (exports.length === 0) continue;
  checked += 1;
  for (const statement of exports) {
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (ts.isExportDeclaration(statement)
      && (statement.isTypeOnly || (statement.exportClause && ts.isNamedExports(statement.exportClause)
        && statement.exportClause.elements.every((element) => element.isTypeOnly)))) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name && /^[A-Z]/.test(statement.name.text)) continue;
    } else if (ts.isVariableStatement(statement)) {
      const components = statement.declarationList.declarations.every((declaration) =>
        ts.isIdentifier(declaration.name) && /^[A-Z]/.test(declaration.name.text)
        && declaration.initializer !== undefined
        && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)));
      if (components) continue;
    }
    const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
    invalid.push(`${path}:${line}`);
  }
}

if (invalid.length > 0) {
  console.error(`Fast Refresh requires component-only TSX exports. Move these runtime exports to .ts modules:\n${invalid.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Fast Refresh boundaries: ${checked} modules checked.`);
}
