import { readFileSync, readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const layers = [
  'app',
  '_app',
  '_pages',
  'widgets',
  'features',
  'entities',
  'shared',
]
const entries = ['index.ts', 'index.server.ts', 'index.transport.ts']
const codeFile = /\.(?:[cm]?[jt]sx?)$/
const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, '')),
)

function boundary(file, root) {
  const parts = file.slice(root.length + 1).split('/')
  const layer = layers.indexOf(parts[0])
  const backend =
    ['server', 'domain'].includes(parts[0]) ||
    (parts[0] === 'app' && parts[1] === 'api')
  const count =
    parts[0] === 'app'
      ? 1
      : parts[0] === 'shared' && ['lib', 'ui'].includes(parts[1])
        ? 3
        : 2
  return { layer, backend, slice: [root, ...parts.slice(0, count)].join('/') }
}

function references(tree) {
  const found = []
  const add = (node, literal, runtime) =>
    found.push({ node, specifier: literal?.text, runtime })
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      add(
        node,
        node.moduleSpecifier,
        !clause ||
          (!clause.isTypeOnly &&
            (!!clause.name ||
              !bindings ||
              ts.isNamespaceImport(bindings) ||
              bindings.elements.some((item) => !item.isTypeOnly))),
      )
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(
        node,
        node.moduleSpecifier,
        !node.isTypeOnly &&
          (!node.exportClause ||
            ts.isNamespaceExport(node.exportClause) ||
            node.exportClause.elements.some((item) => !item.isTypeOnly)),
      )
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node, node.moduleReference.expression, !node.isTypeOnly)
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node, node.argument.literal, false)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      add(
        node,
        node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0])
          ? node.arguments[0]
          : undefined,
        true,
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

function resolveImport(file, specifier, files, root) {
  const path = posix.normalize(
    specifier.startsWith('@/')
      ? `${root}/${specifier.slice(2)}`
      : posix.join(posix.dirname(file), specifier),
  )
  const stem = path.replace(/\.(?:[cm]?jsx?)$/, '')
  return (
    [
      path,
      `${stem}.ts`,
      `${stem}.tsx`,
      `${stem}.mts`,
      `${stem}.cts`,
      `${stem}.js`,
      `${stem}.jsx`,
      `${stem}.mjs`,
      `${stem}.cjs`,
      ...entries.map((entry) => `${path}/${entry}`),
    ].find((candidate) => Object.hasOwn(files, candidate)) ?? null
  )
}

function findCycles(graph, report, code) {
  const active = new Set(),
    done = new Set()
  const visit = (file) => {
    if (done.has(file)) return
    active.add(file)
    for (const next of graph.get(file) ?? []) {
      if (active.has(next))
        report(file, 1, code, `Dependency cycle includes ${next}`)
      else visit(next)
    }
    active.delete(file)
    done.add(file)
  }
  for (const file of graph.keys()) visit(file)
}

/** Pure source-map analysis; never reads project configuration or private runtime files. */
export function analyzeArchitecture({ files, sourceRoot = 'src' }) {
  const violations = [],
    modules = new Map(),
    slices = new Map()
  const report = (file, line, code, message) =>
    violations.push({ file, line, code, message })
  const edge = (graph, from, to) => {
    if (!graph.has(from)) graph.set(from, new Set())
    graph.get(from).add(to)
  }
  for (const [file, source] of Object.entries(files).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!file.startsWith(`${sourceRoot}/`) || !codeFile.test(file)) continue
    const from = boundary(file, sourceRoot)
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    for (const ref of references(tree)) {
      const line =
        tree.getLineAndCharacterOfPosition(ref.node.getStart(tree)).line + 1
      const frontend = from.layer >= 0 && !from.backend
      if (!ref.specifier) {
        if (frontend)
          report(
            file,
            line,
            'dynamic-import',
            'Import target must be a static string',
          )
        continue
      }
      const specifier = ref.specifier
      if (
        frontend &&
        (specifier.startsWith('/') || specifier.startsWith('file:'))
      ) {
        report(
          file,
          line,
          'absolute-import',
          'Frontend imports must stay inside the source tree',
        )
        continue
      }
      if (
        frontend &&
        (specifier.startsWith('node:') || builtins.has(specifier))
      ) {
        report(
          file,
          line,
          'frontend-node',
          'Frontend cannot import Node builtins',
        )
        continue
      }
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
      if (
        specifier.startsWith('@/') &&
        posix.normalize(specifier.slice(2)) !== specifier.slice(2)
      )
        report(file, line, 'canonical-alias', 'Alias path must be canonical')
      const target = resolveImport(file, specifier, files, sourceRoot)
      if (!target) {
        report(
          file,
          line,
          'unresolved-import',
          'Local import does not resolve inside production source',
        )
        continue
      }
      const to = boundary(target, sourceRoot)
      if (frontend && (to.backend || to.layer < 0))
        report(
          file,
          line,
          'frontend-backend',
          'Frontend cannot import backend or unlayered source',
        )
      else if (
        from.backend &&
        to.layer >= 0 &&
        !to.backend &&
        to.layer < layers.indexOf('shared')
      )
        report(
          file,
          line,
          'backend-frontend',
          'Backend cannot import frontend layers',
        )
      else if (frontend && to.layer >= 0 && !to.backend) {
        const sameSlice = from.slice === to.slice
        if (to.layer < from.layer)
          report(
            file,
            line,
            'upward-import',
            'Imports must point to a lower layer',
          )
        if (
          to.layer === from.layer &&
          !sameSlice &&
          !['shared', '_app', 'app'].includes(layers[from.layer])
        )
          report(
            file,
            line,
            'peer-import',
            'Different slices cannot import one another',
          )
        if (
          !sameSlice &&
          !entries.some((entry) => target === `${to.slice}/${entry}`)
        )
          report(
            file,
            line,
            'public-entry',
            'External imports must use the public entry',
          )
        if (!sameSlice) edge(slices, from.slice, to.slice)
      }
      // Own public barrels may re-export the importing module; that alone is not a runtime cycle.
      if (
        ref.runtime &&
        codeFile.test(target) &&
        !(
          from.slice === to.slice &&
          entries.some((entry) => target === `${to.slice}/${entry}`)
        )
      )
        edge(modules, file, target)
    }
  }
  findCycles(modules, report, 'module-cycle')
  findCycles(slices, report, 'slice-cycle')
  return violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.code.localeCompare(b.code),
  )
}

function readProductionSource(directory, relative = 'src', files = {}) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.') || item.isSymbolicLink()) continue
    const file = `${relative}/${item.name}`,
      absolute = resolve(directory, item.name)
    if (item.isDirectory()) readProductionSource(absolute, file, files)
    else if (
      item.isFile() &&
      /\.(?:[cm]?[jt]sx?|css|svg|png|jpe?g|webp)$/.test(file)
    )
      files[file] = codeFile.test(file) ? readFileSync(absolute, 'utf8') : ''
  }
  return files
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const violations = analyzeArchitecture({
    files: readProductionSource(
      fileURLToPath(new URL('../src/', import.meta.url)),
    ),
  })
  for (const item of violations)
    process.stderr.write(
      `${item.file}:${item.line} ${item.code}: ${item.message}\n`,
    )
  if (violations.length) process.exitCode = 1
  else process.stdout.write('Architecture boundaries passed.\n')
}
