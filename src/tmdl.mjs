import path from 'node:path'
import {
  comment, ensureDir, indentBlock, jsonName, mField, mNumber, mString, pad,
  quoteName, splitLines, uuid, writeJson, writeText,
} from './util.mjs'

const MODEL_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json'
const PLATFORM_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json'

function tmdlProperty(value) {
  const text = String(value ?? '')
  if (/[\r\n]/.test(text)) return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/\r?\n/g, ' ')}"`
  if (text.includes('"')) return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  return text
}

function renderExpression(prefix, expression, tabs = 3) {
  const lines = splitLines(expression).filter((line, index, all) => !(index === all.length - 1 && line.trim() === ''))
  if (lines.length === 1) return `${prefix}${lines[0].trimEnd()}\n`
  return `${prefix.trimEnd()}\n${indentBlock(lines.join('\n'), tabs)}\n`
}

function renderColumn(column) {
  let out = ''
  if (column.description) out += comment(column.description, 1)
  const name = quoteName(column.name)

  if (column.expression) {
    out += renderExpression(`\tcolumn ${name} = `, column.expression, 3)
  } else {
    out += `\tcolumn ${name}\n`
  }
  out += `\t\tdataType: ${column.mType === 'date' || column.mType === 'datetime' ? 'dateTime' : column.type}\n`
  if (column.format) out += `\t\tformatString: ${tmdlProperty(column.format)}\n`
  out += `\t\tlineageTag: ${column.lineageTag}\n`
  out += `\t\tsummarizeBy: ${column.summarizeBy}\n`
  if (column.sortByColumn) out += `\t\tsortByColumn: ${quoteName(column.sortByColumn)}\n`
  if (column.hidden) out += '\t\tisHidden\n'
  if (!column.expression && column.sourceName) out += `\t\tsourceColumn: ${tmdlProperty(column.sourceName)}\n`
  out += '\n\t\tannotation SummarizationSetBy = Automatic\n'
  return out
}

function renderMeasure(measure) {
  let out = ''
  if (measure.description) out += comment(measure.description, 1)
  const name = quoteName(measure.name)
  out += renderExpression(`\tmeasure ${name} = `, measure.expression, 3)
  if (measure.format) out += `\t\tformatString: ${tmdlProperty(measure.format)}\n`
  if (measure.displayFolder) out += `\t\tdisplayFolder: ${quoteName(measure.displayFolder)}\n`
  if (measure.hidden) out += '\t\tisHidden\n'
  out += `\t\tlineageTag: ${measure.lineageTag}\n`
  return out
}

function renderHierarchy(hierarchy) {
  let out = `\thierarchy ${quoteName(hierarchy.name)}\n\t\tlineageTag: ${hierarchy.lineageTag}\n`
  for (const level of hierarchy.levels) {
    out += `\n\t\tlevel ${quoteName(level.name)}\n\t\t\tlineageTag: ${level.lineageTag}\n\t\t\tcolumn: ${quoteName(level.column)}\n`
  }
  return out
}

function mType(column) {
  if (column.mType === 'date') return 'date'
  if (column.mType === 'datetime') return 'datetime'
  if (column.type === 'string') return 'text'
  if (column.type === 'int64') return 'Int64.Type'
  if (column.type === 'double') return 'number'
  if (column.type === 'decimal') return 'number'
  if (column.type === 'boolean') return 'logical'
  if (column.type === 'dateTime') return 'datetime'
  if (column.type === 'binary') return 'binary'
  return 'any'
}

function mValue(value, column) {
  if (value === undefined || value === null) return 'null'
  if (column.type === 'string') return mString(value)
  if (column.type === 'boolean') return value ? 'true' : 'false'
  if (column.type === 'int64' || column.type === 'double' || column.type === 'decimal') return mNumber(value)
  if (column.type === 'dateTime') {
    const text = String(value)
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(text)
    if (!m) return 'null'
    const date = `#date(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3])})`
    if (column.mType === 'date' || !m[4]) return date
    return `#datetime(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3])}, ${Number(m[4])}, ${Number(m[5])}, ${Number(m[6])})`
  }
  return mString(value)
}

function mExpression(table) {
  if (table.expression) return table.expression
  const columns = table.columns
  const tableType = columns
    .map((column) => `${mField(column.sourceName ?? column.name)} = ${mType(column)}`)
    .join(', ')

  const rows = []
  for (let r = 0; r < table._rowCount; r++) {
    const values = columns.map((column) => mValue(column._values?.[r], column))
    rows.push(`                {${values.join(', ')}}`)
  }

  return [
    'let',
    '    Source = #table(',
    `        type table [${tableType}],`,
    '        {',
    rows.join(',\n'),
    '        }',
    '    )',
    'in',
    '    Source',
  ].join('\n')
}

function renderPartition(table) {
  const mode = table.mode || 'import'
  let out = `\tpartition ${quoteName(table.name)} = m\n\t\tmode: ${mode}\n\t\tsource =\n`
  out += indentBlock(mExpression(table), 4)
  return `${out}\n`
}

export function renderTable(table) {
  let out = ''
  if (table.description) out += comment(table.description)
  out += `table ${quoteName(table.name)}\n`
  out += `\tlineageTag: ${table.lineageTag}\n`
  if (table.hidden) out += '\tisHidden\n'
  out += '\n'

  for (const measure of table.measures) out += `${renderMeasure(measure)}\n`
  for (const column of table.columns) out += `${renderColumn(column)}\n`
  for (const hierarchy of table.hierarchies) out += `${renderHierarchy(hierarchy)}\n`
  out += renderPartition(table)
  return out
}

export function renderRelationships(relationships) {
  if (relationships.length === 0) return ''
  return relationships.map((relationship) => {
    let out = `relationship ${relationship.id}\n`
    out += `\tfromColumn: ${quoteName(relationship.fromTable)}.${quoteName(relationship.fromColumn)}\n`
    out += `\ttoColumn: ${quoteName(relationship.toTable)}.${quoteName(relationship.toColumn)}\n`
    if (relationship.active === false) out += '\tisActive: false\n'
    if (relationship.crossFilter === 'bothDirections') out += '\tcrossFilteringBehavior: bothDirections\n'
    if (relationship.fromCardinality) out += `\tfromCardinality: ${relationship.fromCardinality}\n`
    if (relationship.toCardinality) out += `\ttoCardinality: ${relationship.toCardinality}\n`
    return out
  }).join('\n')
}

export function renderRole(role) {
  let out = `role ${quoteName(role.name)}\n\tmodelPermission: ${role.modelPermission || 'read'}\n`
  for (const permission of role.tablePermissions) {
    out += `\n\ttablePermission ${quoteName(permission.table)} = ${permission.filter}\n`
  }
  if (role.id) out += `\n\tannotation PBI_Id = ${role.id.replaceAll('-', '')}\n`
  return out
}

function renderModel(model) {
  const refs = model.tables.map((table) => `ref table ${quoteName(table.name)}`).join('\n')
  const roleRefs = model.roles.map((role) => `ref role ${quoteName(role.name)}`).join('\n')
  let out = `model ${quoteName(model.name)}\n`
  out += '\tculture: en-US\n'
  out += '\tdefaultPowerBIDataSourceVersion: powerBI_V3\n'
  out += '\tdiscourageImplicitMeasures\n'
  out += '\tsourceQueryCulture: en-US\n'
  out += '\tdataAccessOptions\n\t\tlegacyRedirects\n\t\treturnErrorValuesAsNull\n\n'
  out += `annotation PBI_QueryOrder = ${JSON.stringify(model.tables.map((table) => table.name))}\n\n`
  out += 'annotation __PBI_TimeIntelligenceEnabled = 0\n\n'
  out += `${refs}\n`
  if (roleRefs) out += `\n${roleRefs}\n`
  return out
}

export async function buildSemanticModel({ dir, projectName, model }) {
  const definition = path.join(dir, 'definition')
  const tablesDir = path.join(definition, 'tables')
  const rolesDir = path.join(definition, 'roles')
  await ensureDir(tablesDir)

  const modelName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(projectName) ? projectName : 'Model'

  await writeJson(path.join(dir, '.platform'), {
    $schema: PLATFORM_SCHEMA,
    metadata: { type: 'SemanticModel', displayName: projectName },
    config: { version: '2.0', logicalId: uuid() },
  })

  await writeJson(path.join(dir, 'definition.pbism'), {
    $schema: MODEL_SCHEMA,
    version: '4.2',
    settings: { qnaEnabled: false },
  })

  await writeText(path.join(definition, 'database.tmdl'), 'database\n\tcompatibilityLevel: 1601\n')
  await writeText(path.join(definition, 'model.tmdl'), renderModel({ ...model, name: modelName }))

  const used = new Set()
  for (const table of model.tables) {
    let base = String(table.name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'Table'
    let file = base
    let index = 2
    while (used.has(file.toLowerCase())) file = `${base}_${index++}`
    used.add(file.toLowerCase())
    await writeText(path.join(tablesDir, `${file}.tmdl`), renderTable(table))
  }

  if (model.relationships.length > 0) {
    await writeText(path.join(definition, 'relationships.tmdl'), renderRelationships(model.relationships))
  }

  if (model.roles.length > 0) {
    await ensureDir(rolesDir)
    for (const role of model.roles) {
      const file = String(role.name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'Role'
      await writeText(path.join(rolesDir, `${file}.tmdl`), renderRole(role))
    }
  }

  return {
    dir,
    tables: model.tables.length,
    measures: model.tables.reduce((sum, table) => sum + table.measures.length, 0),
    columns: model.tables.reduce((sum, table) => sum + table.columns.length, 0),
    relationships: model.relationships.length,
    roles: model.roles.length,
  }
}
