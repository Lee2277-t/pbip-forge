import { readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  ForgeError, ensureDir, isBlank, isObject, safeFileBase,
  uuid, writeJson,
} from './util.mjs'
import { loadTableData, normalizeDataType } from './data.mjs'
import { buildSemanticModel } from './tmdl.mjs'
import { buildReport, makeModelIndex, validateReportSpec } from './report.mjs'
import { openInPowerBi, validateTmdl } from './desktop.mjs'

const PBIP_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json'

const NUMERIC_TYPES = new Set(['int64', 'double', 'decimal'])
const SUMMARIZE = new Set(['none', 'sum', 'avg', 'min', 'max', 'count', 'distinctCount', 'median', 'standardDeviation', 'variance'])

function looksLikeKey(name) {
  return /(^|[^a-z])(id|key|code|number|no)([^a-z]|$)/i.test(String(name))
}

function normalizeFormat(value) {
  if (value === undefined || value === null || value === '') return undefined
  return String(value)
}

function normalizeSummarize(column, provided) {
  if (provided !== undefined) {
    const value = String(provided)
    if (SUMMARIZE.has(value)) return value
    if (value === 'average') return 'avg'
    if (value === 'distinctcount') return 'distinctCount'
    return 'none'
  }
  if (NUMERIC_TYPES.has(column.type) && !looksLikeKey(column.name)) return 'sum'
  return 'none'
}

function normalizeColumns(table, loaded, warnings) {
  const source = loaded?.columns ?? []
  const out = []
  const seen = new Set()

  for (const [index, raw] of source.entries()) {
    const name = String(raw.name ?? '').trim()
    if (!name) throw new ForgeError(`Table "${table.name}": column ${index + 1} has no name`)
    if (seen.has(name.toLowerCase())) throw new ForgeError(`Table "${table.name}": duplicate column "${name}"`)
    seen.add(name.toLowerCase())

    const type = normalizeDataType(raw.type ?? raw.dataType) ?? 'string'
    const column = {
      name,
      sourceName: String(raw.sourceName ?? name),
      type,
      mType: raw.mType ?? (type === 'dateTime' ? 'date' : undefined),
      format: normalizeFormat(raw.format ?? raw.formatString),
      summarizeBy: 'none',
      hidden: raw.hidden === true,
      expression: raw.expression ? String(raw.expression) : undefined,
      sortByColumn: raw.sortByColumn ? String(raw.sortByColumn) : undefined,
      description: raw.description ? String(raw.description) : undefined,
      lineageTag: uuid(),
      _values: raw._values,
    }
    column.summarizeBy = normalizeSummarize(column, raw.summarizeBy)
    if (column.type === 'decimal' && !column.format && !raw.format) column.format = '$ #,##0.00'
    out.push(column)
  }

  for (const column of out) {
    if (!column.sortByColumn) continue
    const sort = out.find((entry) => entry.name.toLowerCase() === column.sortByColumn.toLowerCase())
    if (!sort) throw new ForgeError(`Table "${table.name}": sortByColumn "${column.sortByColumn}" of column "${column.name}" does not exist`)
    column.sortByColumn = sort.name
  }

  if (loaded && loaded.rowCount > 0 && out.length === 0) {
    throw new ForgeError(`Table "${table.name}" has rows but no columns`)
  }

  const unknown = out.filter((column) => !NUMERIC_TYPES.has(column.type) && column.summarizeBy !== 'none')
  if (unknown.length > 0) warnings.push(`Table "${table.name}": non-numeric column(s) ${unknown.map((column) => column.name).join(', ')} will not be summarized`)

  return out
}

function normalizeMeasures(table) {
  const list = Array.isArray(table.measures) ? table.measures : []
  const seen = new Set()
  return list.map((raw, index) => {
    if (typeof raw === 'string') raw = { name: `Measure ${index + 1}`, expression: raw }
    const name = String(raw.name ?? '').trim()
    if (!name) throw new ForgeError(`Table "${table.name}": measure ${index + 1} has no name`)
    if (seen.has(name.toLowerCase())) throw new ForgeError(`Table "${table.name}": duplicate measure "${name}"`)
    seen.add(name.toLowerCase())
    const expression = String(raw.expression ?? raw.dax ?? '').trim()
    if (!expression) throw new ForgeError(`Table "${table.name}": measure "${name}" has no DAX expression`)
    return {
      name,
      expression,
      format: normalizeFormat(raw.format ?? raw.formatString),
      displayFolder: (raw.displayFolder ?? raw.folder) ? String(raw.displayFolder ?? raw.folder) : undefined,
      description: raw.description ? String(raw.description) : undefined,
      hidden: raw.hidden === true,
      lineageTag: uuid(),
    }
  })
}

function normalizeHierarchies(table, columns) {
  const list = Array.isArray(table.hierarchies) ? table.hierarchies : []
  const columnNames = new Map(columns.map((column) => [column.name.toLowerCase(), column.name]))
  return list.map((raw, index) => {
    const name = String(raw.name ?? `Hierarchy ${index + 1}`).trim()
    const levels = Array.isArray(raw.levels) ? raw.levels : []
    if (levels.length === 0) throw new ForgeError(`Table "${table.name}": hierarchy "${name}" has no levels`)
    return {
      name,
      lineageTag: uuid(),
      levels: levels.map((level) => {
        const levelName = isObject(level) ? String(level.name ?? level.column ?? '') : String(level)
        const column = isObject(level) ? String(level.column ?? level.name ?? '') : String(level)
        if (!columnNames.has(column.toLowerCase())) {
          throw new ForgeError(`Table "${table.name}": hierarchy "${name}" level "${levelName}" references missing column "${column}"`)
        }
        return {
          name: levelName || columnNames.get(column.toLowerCase()),
          column: columnNames.get(column.toLowerCase()),
          lineageTag: uuid(),
        }
      }),
    }
  })
}

async function normalizeTable(raw, warnings) {
  if (!isObject(raw)) throw new ForgeError('Every table must be an object')
  const name = String(raw.name ?? '').trim()
  if (!name) throw new ForgeError('Every table needs a name')

  const hasExpression = typeof raw.expression === 'string' && raw.expression.trim() !== ''
  let loaded
  if (!hasExpression) {
    loaded = await loadTableData({ ...raw, name }, warnings)
  } else {
    const declared = Array.isArray(raw.columns) ? raw.columns : []
    loaded = {
      columns: declared.map((column, index) => (isObject(column) ? column : { name: String(column ?? `Column${index + 1}`) })),
      rowCount: 0,
      source: 'expression',
    }
  }

  const columns = normalizeColumns(raw, loaded, warnings)
  if (columns.length === 0) throw new ForgeError(`Table "${name}" has no columns`)
  const measures = normalizeMeasures(raw)
  const hierarchies = normalizeHierarchies(raw, columns)
  const expression = hasExpression ? String(raw.expression).trim() : undefined
  const mode = raw.mode === 'directQuery' || raw.mode === 'directquery' ? 'directQuery' : 'import'

  if (!expression && (!loaded || loaded.rowCount === 0)) {
    throw new ForgeError(`Table "${name}" has no data. Provide rows, csv, excel, or a Power Query expression.`)
  }

  return {
    name,
    description: raw.description ? String(raw.description) : undefined,
    hidden: raw.hidden === true,
    columns,
    measures,
    hierarchies,
    expression,
    mode,
    lineageTag: uuid(),
    _rowCount: loaded?.rowCount ?? 0,
    _source: loaded?.source,
  }
}

function parseEndpoint(value, label) {
  if (isObject(value)) {
    const table = String(value.table ?? '').trim()
    const column = String(value.column ?? value.field ?? '').trim()
    if (!table || !column) throw new ForgeError(`${label} needs table and column`)
    return { table, column }
  }
  const text = String(value ?? '').trim()
  let m = /^(.+?)\[(.+?)\]$/.exec(text)
  if (m) return { table: m[1].trim(), column: m[2].trim() }
  m = /^(.+?)\.(.+)$/.exec(text)
  if (m) return { table: m[1].trim(), column: m[2].trim() }
  throw new ForgeError(`${label} must look like "Table[Column]" or { table, column }`)
}

function normalizeRelationships(model, tablesByName) {
  const list = Array.isArray(model.relationships) ? model.relationships : []
  const seen = new Set()
  return list.map((raw, index) => {
    const from = parseEndpoint(raw.from ?? raw.fromColumn, `Relationship ${index + 1} from`)
    const to = parseEndpoint(raw.to ?? raw.toColumn, `Relationship ${index + 1} to`)
    const fromTable = tablesByName.get(from.table.toLowerCase())
    const toTable = tablesByName.get(to.table.toLowerCase())
    if (!fromTable) throw new ForgeError(`Relationship ${index + 1}: table "${from.table}" does not exist`)
    if (!toTable) throw new ForgeError(`Relationship ${index + 1}: table "${to.table}" does not exist`)
    const fromColumn = fromTable.columns.find((column) => column.name.toLowerCase() === from.column.toLowerCase())
    const toColumn = toTable.columns.find((column) => column.name.toLowerCase() === to.column.toLowerCase())
    if (!fromColumn) throw new ForgeError(`Relationship ${index + 1}: column "${from.column}" does not exist in "${fromTable.name}"`)
    if (!toColumn) throw new ForgeError(`Relationship ${index + 1}: column "${to.column}" does not exist in "${toTable.name}"`)

    const compatible = (NUMERIC_TYPES.has(fromColumn.type) && NUMERIC_TYPES.has(toColumn.type)) || fromColumn.type === toColumn.type
    if (!compatible) {
      throw new ForgeError(`Relationship ${index + 1}: incompatible column types ${fromColumn.type} and ${toColumn.type}`)
    }

    const key = `${fromTable.name}.${fromColumn.name}->${toTable.name}.${toColumn.name}`.toLowerCase()
    if (seen.has(key)) throw new ForgeError(`Relationship ${index + 1} duplicates ${key}`)
    seen.add(key)

    const cardinality = String(raw.cardinality ?? 'manyToOne')
    const fromCardinality = raw.fromCardinality
      ?? (cardinality === 'oneToOne' || cardinality === 'oneToMany' ? 'one' : 'many')
    const toCardinality = raw.toCardinality
      ?? (cardinality === 'oneToOne' ? 'one' : cardinality === 'manyToMany' || cardinality === 'oneToMany' ? 'many' : 'one')
    const crossFilter = raw.crossFilter === 'bothDirections' || raw.crossFilteringBehavior === 'bothDirections' || raw.crossFilter === true
      ? 'bothDirections'
      : 'oneDirection'

    return {
      id: uuid(),
      fromTable: fromTable.name,
      fromColumn: fromColumn.name,
      toTable: toTable.name,
      toColumn: toColumn.name,
      active: raw.active !== false,
      fromCardinality,
      toCardinality,
      crossFilter,
    }
  })
}

function normalizeRoles(model, tablesByName) {
  const list = Array.isArray(model.roles) ? model.roles : []
  return list.map((raw, index) => {
    const name = String(raw.name ?? `Role ${index + 1}`).trim()
    const permissions = []
    if (isObject(raw.tables)) {
      for (const [table, filter] of Object.entries(raw.tables)) {
        permissions.push({ table, filter: String(filter) })
      }
    }
    if (Array.isArray(raw.permissions)) {
      for (const entry of raw.permissions) {
        permissions.push({ table: String(entry.table ?? ''), filter: String(entry.filter ?? entry.expression ?? '') })
      }
    }
    if (raw.table && raw.filter) permissions.push({ table: String(raw.table), filter: String(raw.filter) })
    if (permissions.length === 0) throw new ForgeError(`Role "${name}" has no table permissions`)
    for (const permission of permissions) {
      if (!tablesByName.has(permission.table.toLowerCase())) {
        throw new ForgeError(`Role "${name}": table "${permission.table}" does not exist`)
      }
      if (!permission.filter.trim()) throw new ForgeError(`Role "${name}": empty filter for table "${permission.table}"`)
    }
    return {
      name,
      modelPermission: raw.modelPermission ?? 'read',
      tablePermissions: permissions,
      id: uuid(),
    }
  })
}

function normalizePages(report) {
  const pages = Array.isArray(report.pages) ? report.pages : []
  if (pages.length === 0) return [{ title: 'Overview', visuals: [] }]
  return pages.map((page, index) => {
    if (!isObject(page)) throw new ForgeError(`Page ${index + 1} must be an object`)
    const visuals = Array.isArray(page.visuals) ? page.visuals : []
    return {
      ...page,
      displayName: String(page.displayName ?? page.title ?? `Page ${index + 1}`),
      visuals,
    }
  })
}

function normalizeModel(spec, warnings) {
  const model = isObject(spec.model) ? spec.model : {}
  const rawTables = model.tables ?? spec.tables
  if (!Array.isArray(rawTables) || rawTables.length === 0) {
    throw new ForgeError('The spec needs at least one table in model.tables')
  }
  return model
}

async function normalizeProject(spec, warnings) {
  const name = String(spec.name ?? spec.projectName ?? '').trim()
  if (!name) throw new ForgeError('The spec needs a project "name"')
  const model = normalizeModel(spec, warnings)
  const tables = []
  const tablesByName = new Map()
  for (const raw of model.tables) {
    const table = await normalizeTable(raw, warnings)
    if (tablesByName.has(table.name.toLowerCase())) throw new ForgeError(`Duplicate table "${table.name}"`)
    tables.push(table)
    tablesByName.set(table.name.toLowerCase(), table)
  }
  const relationships = normalizeRelationships(model, tablesByName)
  const roles = normalizeRoles(model, tablesByName)
  if (tables.length > 1 && relationships.length === 0) {
    warnings.push('No relationships were defined; multi-table models usually need at least one relationship.')
  }
  return {
    name,
    model: { ...model, name, tables, relationships, roles },
    report: {
      ...(isObject(spec.report) ? spec.report : {}),
      theme: (isObject(spec.report) ? spec.report.theme : undefined) ?? spec.theme,
      pages: normalizePages(isObject(spec.report) && spec.report.pages ? spec.report : spec),
    },
  }
}

export function parseSpecValue(value, label = 'spec') {
  if (isObject(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (!isObject(parsed)) throw new Error('not an object')
      return parsed
    } catch (error) {
      throw new ForgeError(`${label} is not valid JSON: ${error.message}`)
    }
  }
  throw new ForgeError(`${label} must be a JSON object or a JSON string`)
}

export async function loadSpec({ spec, specPath }) {
  if (spec !== undefined && spec !== null) {
    return { spec: parseSpecValue(spec), specPath: specPath ? path.resolve(specPath) : undefined }
  }
  if (!specPath) throw new ForgeError('Provide "spec" or "specPath"')
  const file = path.resolve(specPath)
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    throw new ForgeError(`Could not read spec file "${file}": ${error.message}`)
  }
  return { spec: parseSpecValue(text, `Spec file "${file}"`), specPath: file }
}

async function pathExists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

function resolveOutput(spec, options, specPath) {
  let output = options.outputDir ?? spec.outputDir
  let explicitFile
  if (output && /\.pbip$/i.test(String(output))) {
    explicitFile = path.resolve(String(output))
    output = path.dirname(explicitFile)
  } else {
    output = output ? path.resolve(String(output)) : (specPath ? path.dirname(specPath) : process.cwd())
  }
  const base = explicitFile
    ? path.basename(explicitFile, '.pbip')
    : safeFileBase(spec.name, 'PowerBIProject')
  return {
    outputDir: output,
    base,
    pbip: explicitFile ?? path.join(output, `${base}.pbip`),
    reportDir: path.join(output, `${base}.Report`),
    modelDir: path.join(output, `${base}.SemanticModel`),
  }
}

function validProjectName(base) {
  if (!base || base === '.' || base === '..') throw new ForgeError('Invalid project name')
  if (/[\\/]/.test(base)) throw new ForgeError('Project name cannot contain path separators')
}

export async function buildProject(input, options = {}) {
  const { spec, specPath } = await loadSpec(input)
  const warnings = []
  const project = await normalizeProject(spec, warnings)
  const target = resolveOutput({ ...spec, name: project.name }, options, specPath)
  validProjectName(target.base)

  const overwrite = options.overwrite === true || spec.overwrite === true
  const existing = []
  for (const candidate of [target.pbip, target.reportDir, target.modelDir]) {
    if (await pathExists(candidate)) existing.push(candidate)
  }
  if (existing.length > 0 && !overwrite) {
    throw new ForgeError(
      `Output already exists: ${existing.join(', ')}. Pass "overwrite": true to replace it.`,
      existing,
    )
  }
  if (existing.length > 0) {
    for (const candidate of existing) await rm(candidate, { recursive: true, force: true })
  }

  await ensureDir(target.outputDir)

  const index = makeModelIndex(project.model)
  const reportErrors = validateReportSpec(project.report, index)
  if (reportErrors.length > 0) {
    throw new ForgeError(`Report validation failed:\n- ${reportErrors.join('\n- ')}`, reportErrors)
  }

  const modelSummary = await buildSemanticModel({
    dir: target.modelDir,
    projectName: target.base,
    model: project.model,
  })

  const reportSummary = await buildReport({
    dir: target.reportDir,
    projectName: target.base,
    report: project.report,
    index,
    baseDir: specPath ? path.dirname(specPath) : target.outputDir,
  })
  warnings.push(...reportSummary.warnings)

  await writeJson(target.pbip, {
    $schema: PBIP_SCHEMA,
    version: '1.0',
    artifacts: [{ report: { path: path.basename(target.reportDir) } }],
    settings: { enableAutoRecovery: true },
  })

  const validation = options.validate === false
    ? { tmdl: { status: 'skipped', reason: 'Validation disabled' } }
    : { tmdl: await validateTmdl(path.join(target.modelDir, 'definition')) }

  let opened
  if (options.open === true) {
    opened = await openInPowerBi(target.pbip)
    if (!opened.opened) warnings.push(`Could not open Power BI Desktop automatically: ${opened.reason}`)
  }

  const ok = validation.tmdl.status !== 'failed' && reportErrors.length === 0
  return {
    ok,
    project: target.pbip,
    projectDir: target.outputDir,
    reportDir: target.reportDir,
    modelDir: target.modelDir,
    name: target.base,
    summary: {
      tables: modelSummary.tables,
      columns: modelSummary.columns,
      measures: modelSummary.measures,
      relationships: modelSummary.relationships,
      roles: modelSummary.roles,
      pages: reportSummary.pages,
      visuals: reportSummary.visuals,
    },
    validation,
    ...(opened ? { opened } : {}),
    warnings,
    next: [
      'Open the .pbip file in Power BI Desktop to view the report.',
      'In Power BI Desktop, use File > Save as to produce a .pbix if you need one.',
      'Publish the report to a Fabric workspace when it is ready.',
    ],
  }
}

export { ForgeError }
