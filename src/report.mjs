import path from 'node:path'
import {
  ForgeError, ensureArray, ensureDir, firstDefined, isObject, literalString,
  round, shortId, uuid, writeJson,
} from './util.mjs'

const REPORT_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/1.3.0/schema.json'
const PAGE_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/1.4.0/schema.json'
const PAGES_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json'
const VERSION_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json'
const VISUAL_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json'
const PBIR_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json'
const PLATFORM_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json'

const DEFAULT_THEME = {
  name: 'PBIP Forge',
  dataColors: ['#2563EB', '#0EA5E9', '#14B8A6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#64748B'],
  background: '#FFFFFF',
  foreground: '#1F2937',
  tableAccent: '#2563EB',
}

const VISUALS = {
  bar: { type: 'barChart', category: 'Category', values: 'Y', series: 'Series', aggregate: true },
  column: { type: 'columnChart', category: 'Category', values: 'Y', series: 'Series', aggregate: true },
  line: { type: 'lineChart', category: 'Category', values: 'Y', series: 'Series', aggregate: true },
  area: { type: 'areaChart', category: 'Category', values: 'Y', series: 'Series', aggregate: true },
  pie: { type: 'pieChart', category: 'Category', values: 'Y', aggregate: true },
  donut: { type: 'donutChart', category: 'Category', values: 'Y', aggregate: true },
  card: { type: 'cardVisual', values: 'Data', aggregate: true },
  table: { type: 'tableEx', values: 'Values', aggregate: false },
  matrix: { type: 'pivotTable', rows: 'Rows', columns: 'Columns', values: 'Values', aggregate: true },
  slicer: { type: 'slicer', values: 'Values', aggregate: false },
  scatter: { type: 'scatterChart', x: 'X', y: 'Y', series: 'Series', size: 'Size', aggregate: true },
  gauge: { type: 'gauge', values: 'Y', min: 'MinValue', max: 'MaxValue', target: 'TargetValue', aggregate: true },
  kpi: { type: 'kpi', values: 'Indicator', trend: 'TrendAxis', goal: 'Goal', aggregate: true },
  textbox: { type: 'textbox' },
  shape: { type: 'shape' },
}

const ALIASES = {
  barchart: 'bar', columnchart: 'column', linechart: 'line', areachart: 'area',
  piechart: 'pie', donutchart: 'donut', cardvisual: 'card', multicard: 'card',
  tableex: 'table', pivottable: 'matrix', scatterchart: 'scatter', slicer: 'slicer',
  textbox: 'textbox', text: 'textbox', shape: 'shape', kpi: 'kpi', gauge: 'gauge',
}

const AGGREGATION_FUNCTIONS = {
  sum: 0, avg: 1, average: 1, count: 2, min: 3, max: 4,
}

const AGGREGATION_LABELS = {
  sum: 'Sum', avg: 'Average', average: 'Average', count: 'Count', min: 'Min', max: 'Max',
}

export function makeModelIndex(model) {
  const tables = new Map()
  const allMeasures = new Map()
  const allColumns = new Map()

  for (const table of model.tables) {
    const columns = new Map()
    const measures = new Map()
    for (const column of table.columns) {
      columns.set(column.name.toLowerCase(), column)
      const list = allColumns.get(column.name.toLowerCase()) ?? []
      list.push({ table, column })
      allColumns.set(column.name.toLowerCase(), list)
    }
    for (const measure of table.measures) {
      measures.set(measure.name.toLowerCase(), measure)
      const list = allMeasures.get(measure.name.toLowerCase()) ?? []
      list.push({ table, measure })
      allMeasures.set(measure.name.toLowerCase(), list)
    }
    tables.set(table.name.toLowerCase(), { table, columns, measures })
  }

  return { model, tables, allMeasures, allColumns }
}

function requireTable(index, tableName, context) {
  const found = index.tables.get(String(tableName).toLowerCase())
  if (!found) throw new ForgeError(`${context}: table "${tableName}" does not exist`)
  return found
}

function findUnique(map, name, context, kind) {
  const list = map.get(String(name).toLowerCase())
  if (!list || list.length === 0) throw new ForgeError(`${context}: ${kind} "${name}" does not exist`)
  if (list.length > 1) {
    const tables = list.map((entry) => entry.table.name).join(', ')
    throw new ForgeError(`${context}: ${kind} "${name}" is ambiguous; it exists in ${tables}. Prefix it with the table name.`)
  }
  return list[0]
}

function parseFieldString(value) {
  const text = String(value).trim()
  let m = /^(.+?)\[(.+?)\]$/.exec(text)
  if (m) return { table: m[1].trim(), name: m[2].trim() }
  m = /^(.+?)\.(.+)$/.exec(text)
  if (m) return { table: m[1].trim(), name: m[2].trim() }
  return { name: text }
}

function resolveField(field, index, context, { defaultAggregate = false } = {}) {
  if (field === undefined || field === null || field === '') {
    throw new ForgeError(`${context}: empty field reference`)
  }

  let raw = field
  if (typeof field === 'string') raw = parseFieldString(field)
  if (isObject(field) && typeof field.field === 'string') raw = { ...parseFieldString(field.field), ...field, field: undefined }
  if (!isObject(raw)) throw new ForgeError(`${context}: invalid field reference ${JSON.stringify(field)}`)

  const explicitKind = raw.measure !== undefined ? 'measure' : raw.column !== undefined ? 'column' : undefined
  const name = String(firstDefined(raw.measure, raw.column, raw.name, raw.property) ?? '').trim()
  if (!name) throw new ForgeError(`${context}: field reference has no name`)

  const tableName = raw.table !== undefined ? String(raw.table).trim() : undefined
  let table
  let kind
  let definition

  if (explicitKind === 'measure') {
    if (tableName) {
      const found = requireTable(index, tableName, context)
      definition = found.measures.get(name.toLowerCase())
      if (!definition) throw new ForgeError(`${context}: measure "${name}" does not exist in table "${tableName}"`)
      table = found.table
    } else {
      const hit = findUnique(index.allMeasures, name, context, 'measure')
      table = hit.table
      definition = hit.measure
    }
    kind = 'measure'
  } else if (explicitKind === 'column') {
    if (tableName) {
      const found = requireTable(index, tableName, context)
      definition = found.columns.get(name.toLowerCase())
      if (!definition) throw new ForgeError(`${context}: column "${name}" does not exist in table "${tableName}"`)
      table = found.table
    } else {
      const hit = findUnique(index.allColumns, name, context, 'column')
      table = hit.table
      definition = hit.column
    }
    kind = 'column'
  } else if (tableName) {
    const found = requireTable(index, tableName, context)
    if (found.measures.has(name.toLowerCase())) {
      table = found.table
      definition = found.measures.get(name.toLowerCase())
      kind = 'measure'
    } else if (found.columns.has(name.toLowerCase())) {
      table = found.table
      definition = found.columns.get(name.toLowerCase())
      kind = 'column'
    } else {
      throw new ForgeError(`${context}: field "${name}" does not exist in table "${tableName}"`)
    }
  } else if (index.allMeasures.has(name.toLowerCase())) {
    const hit = findUnique(index.allMeasures, name, context, 'measure')
    table = hit.table
    definition = hit.measure
    kind = 'measure'
  } else if (index.allColumns.has(name.toLowerCase())) {
    const hit = findUnique(index.allColumns, name, context, 'column')
    table = hit.table
    definition = hit.column
    kind = 'column'
  } else {
    throw new ForgeError(`${context}: field "${name}" does not exist`)
  }

  let aggregation = raw.aggregation
  if (aggregation === true) aggregation = 'sum'
  if (aggregation === false || aggregation === 'none') aggregation = undefined
  if (typeof aggregation === 'string') aggregation = aggregation.toLowerCase()
  if (kind === 'measure') aggregation = undefined
  if (!aggregation && defaultAggregate && kind === 'column' && ['int64', 'double', 'decimal'].includes(definition.type)) {
    aggregation = 'sum'
  }
  if (aggregation && !AGGREGATION_FUNCTIONS[aggregation]) {
    throw new ForgeError(`${context}: unsupported aggregation "${aggregation}"`)
  }

  return { table: table.name, name: definition.name, kind, definition, aggregation }
}

function fieldExpression(field) {
  const key = field.kind === 'measure' ? 'Measure' : 'Column'
  return {
    [key]: {
      Expression: { SourceRef: { Entity: field.table } },
      Property: field.name,
    },
  }
}

function projection(field, { active = false } = {}) {
  let payload
  let queryRef
  let nativeQueryRef = field.name
  if (field.aggregation) {
    payload = {
      Aggregation: {
        Expression: { Column: fieldExpression({ ...field, kind: 'column' }).Column },
        Function: AGGREGATION_FUNCTIONS[field.aggregation],
      },
    }
    const label = AGGREGATION_LABELS[field.aggregation] ?? 'Sum'
    queryRef = `${label}(${field.table}.${field.name})`
    nativeQueryRef = `${label} of ${field.name}`
  } else {
    payload = fieldExpression(field)
    queryRef = `${field.table}.${field.name}`
  }
  const result = {
    field: payload,
    queryRef,
    nativeQueryRef,
  }
  if (active) result.active = true
  return result
}

function fieldList(value) {
  return ensureArray(value).filter((entry) => entry !== undefined && entry !== null)
}

function normalizeVisualType(spec) {
  const raw = String(firstDefined(spec.visualType, spec.type, spec.chart) ?? '').trim()
  if (!raw) throw new ForgeError('Visual is missing a type')
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (ALIASES[key]) return { key: ALIASES[key], raw, definition: VISUALS[ALIASES[key]] }
  if (VISUALS[key]) return { key, raw, definition: VISUALS[key] }
  return { key: null, raw, definition: null }
}

function roleFields(spec, def) {
  const roles = {}
  if (isObject(spec.roles)) {
    for (const [role, value] of Object.entries(spec.roles)) {
      const fields = fieldList(value)
      if (fields.length > 0) roles[role] = fields
    }
    return roles
  }
  if (def.category) {
    const category = firstDefined(spec.category, spec.axis, spec.group)
    if (category !== undefined) roles[def.category] = fieldList(category)
  }
  if (def.values) {
    const values = firstDefined(spec.values, spec.value, spec.field, def.values === 'Y' ? spec.measures : undefined)
    if (values !== undefined) roles[def.values] = fieldList(values)
  }
  if (def.series && spec.series !== undefined) roles[def.series] = fieldList(spec.series)
  if (def.rows && spec.rows !== undefined) roles[def.rows] = fieldList(spec.rows)
  if (def.columns && spec.columns !== undefined) roles[def.columns] = fieldList(spec.columns)
  if (def.x && spec.xField !== undefined) roles[def.x] = fieldList(spec.xField)
  if (def.y && spec.yField !== undefined) roles[def.y] = fieldList(spec.yField)
  if (def.size && spec.size !== undefined) roles[def.size] = fieldList(spec.size)
  if (def.min && spec.min !== undefined) roles[def.min] = fieldList(spec.min)
  if (def.max && spec.max !== undefined) roles[def.max] = fieldList(spec.max)
  if (def.target && spec.target !== undefined) roles[def.target] = fieldList(spec.target)
  if (def.trend && spec.trend !== undefined) roles[def.trend] = fieldList(spec.trend)
  if (def.goal && spec.goal !== undefined) roles[def.goal] = fieldList(spec.goal)
  if (def.aggregate && spec.aggregate !== undefined && spec.aggregation === undefined) {
    // no-op: aggregation is read per field below
  }
  return roles
}

function roleAggregates(role, def) {
  if (!def.aggregate) return false
  return ['Y', 'Data', 'X', 'MinValue', 'MaxValue', 'TargetValue', 'Indicator', 'Goal'].includes(role)
    || (def.values === role)
}

function titleObjects(spec) {
  const showTitle = spec.showTitle
  const title = spec.title
  if (showTitle === false) {
    return {
      title: [{ properties: { show: { expr: { Literal: { Value: 'false' } } } } }],
    }
  }
  if (title === undefined || title === null || title === '') return undefined
  return {
    title: [{
      properties: {
        show: { expr: { Literal: { Value: 'true' } } },
        text: { expr: { Literal: { Value: literalString(title) } } },
      },
    }],
  }
}

function visualObjects(spec, def) {
  const objects = {}
  const container = {}

  if (def.type === 'textbox') {
    const runs = []
    if (Array.isArray(spec.runs) && spec.runs.length > 0) {
      for (const run of spec.runs) {
        runs.push({
          value: String(run.text ?? run.value ?? ''),
          textStyle: {
            fontFamily: run.fontFamily ?? 'Segoe UI',
            fontSize: `${run.size ?? run.fontSize ?? 18}pt`,
            color: run.color ?? '#1F2937',
            fontWeight: run.bold ? 'bold' : 'normal',
          },
        })
      }
    } else {
      runs.push({
        value: String(spec.text ?? spec.title ?? ''),
        textStyle: {
          fontFamily: spec.fontFamily ?? 'Segoe UI',
          fontSize: `${spec.fontSize ?? spec.size ?? 18}pt`,
          color: spec.color ?? '#1F2937',
          fontWeight: spec.bold ? 'bold' : 'normal',
        },
      })
    }
    objects.general = [{
      properties: {
        paragraphs: [{ textRuns: runs }],
      },
    }]
    return { objects, container: undefined }
  }

  const title = titleObjects(spec)
  if (title) Object.assign(container, title)
  if (spec.legend !== undefined) {
    objects.legend = [{
      properties: { show: { expr: { Literal: { Value: spec.legend ? 'true' : 'false' } } } },
    }]
  }
  if (spec.dataLabels !== undefined) {
    objects.labels = [{
      properties: { show: { expr: { Literal: { Value: spec.dataLabels ? 'true' : 'false' } } } },
    }]
  }
  if (spec.slicerMode && def.type === 'slicer') {
    objects.data = [{
      properties: { mode: { expr: { Literal: { Value: literalString(spec.slicerMode) } } } },
    }]
  }

  return {
    objects: Object.keys(objects).length > 0 ? objects : undefined,
    container: Object.keys(container).length > 0 ? container : undefined,
  }
}

function sortDefinition(spec, index, context) {
  if (spec.sort === false || spec.sort === undefined || spec.sort === null) return undefined
  let fieldSpec
  let direction = 'Descending'
  if (typeof spec.sort === 'string') {
    const lower = spec.sort.toLowerCase()
    if (lower === 'asc' || lower === 'ascending') direction = 'Ascending'
    else if (lower === 'desc' || lower === 'descending') direction = 'Descending'
    else fieldSpec = spec.sort
    if (!fieldSpec) {
      const values = fieldList(firstDefined(spec.values, spec.value))
      if (values.length === 0) return undefined
      fieldSpec = values[0]
    }
  } else if (isObject(spec.sort)) {
    fieldSpec = firstDefined(spec.sort.field, spec.sort.by)
    const d = String(spec.sort.direction ?? 'desc').toLowerCase()
    if (d === 'asc' || d === 'ascending') direction = 'Ascending'
    if (!fieldSpec) {
      const values = fieldList(firstDefined(spec.values, spec.value))
      if (values.length === 0) return undefined
      fieldSpec = values[0]
    }
  } else {
    return undefined
  }
  const field = resolveField(fieldSpec, index, `${context} sort`, { defaultAggregate: true })
  return {
    sort: [{
      field: fieldExpression(field),
      direction,
    }],
    isDefaultSort: true,
  }
}

function buildVisual(spec, index, context, forcedPosition) {
  const { key, raw, definition } = normalizeVisualType(spec)
  if (!definition) {
    throw new ForgeError(`${context}: unsupported visual type "${raw}". Use a supported type or pass "roles" with an explicit "visualType".`)
  }
  const visualType = definition.type
  const roles = roleFields(spec, definition)
  const queryState = {}

  for (const [role, fields] of Object.entries(roles)) {
    const aggregate = roleAggregates(role, definition)
    const projections = fields.map((fieldSpec, i) => {
      const field = resolveField(fieldSpec, index, `${context} ${role}`, { defaultAggregate: aggregate })
      return projection(field, { active: i === 0 && (role === 'Category' || role === 'Values') })
    })
    if (projections.length > 0) queryState[role] = { projections }
  }

  const requiresQuery = visualType !== 'textbox' && visualType !== 'shape' && visualType !== 'image'
  if (requiresQuery && Object.keys(queryState).length === 0) {
    throw new ForgeError(`${context}: visual "${raw}" has no fields. Provide category/values (or roles).`)
  }

  const visual = { visualType }
  if (Object.keys(queryState).length > 0) {
    visual.query = { queryState }
    const sort = sortDefinition(spec, index, context)
    if (sort) visual.query.sortDefinition = sort
  }

  const { objects, container } = visualObjects(spec, definition)
  if (objects) visual.objects = objects
  if (container) visual.visualContainerObjects = container
  visual.drillFilterOtherVisuals = true

  const position = {
    x: round(forcedPosition.x ?? 0),
    y: round(forcedPosition.y ?? 0),
    z: round(forcedPosition.z ?? 0, 0),
    height: round(forcedPosition.height ?? 300),
    width: round(forcedPosition.width ?? 600),
    tabOrder: round(forcedPosition.tabOrder ?? 0, 0),
  }

  return {
    $schema: VISUAL_SCHEMA,
    name: shortId(),
    position,
    visual,
  }
}

function pageSize(page) {
  return {
    width: Number(page.width ?? 1280),
    height: Number(page.height ?? 720),
  }
}

function defaultVisualSize(spec, def, page, isOnly) {
  if (spec.width && spec.height) return { width: Number(spec.width), height: Number(spec.height) }
  const margin = 24
  if (def.type === 'textbox') return { width: Number(spec.width ?? page.width - margin * 2), height: Number(spec.height ?? 56) }
  if (def.type === 'cardVisual') return { width: Number(spec.width ?? 296), height: Number(spec.height ?? 104) }
  if (isOnly) return { width: Number(spec.width ?? page.width - margin * 2), height: Number(spec.height ?? page.height - 114) }
  return { width: Number(spec.width ?? 600), height: Number(spec.height ?? 300) }
}

function layoutPage(page, index, warnings) {
  const size = pageSize(page)
  const margin = 24
  const gap = 16
  const visuals = []
  const pageVisuals = Array.isArray(page.visuals) ? page.visuals : []

  if (page.title && !page.hideTitleVisual) {
    visuals.push({
      type: 'textbox',
      text: page.title,
      fontSize: page.titleSize ?? 26,
      bold: true,
      color: page.titleColor ?? '#111827',
      x: margin,
      y: 16,
      width: size.width - margin * 2,
      height: 56,
      z: 10,
      tabOrder: 10,
      _autoTitle: true,
    })
  }

  const startY = visuals.length > 0 ? 88 : margin
  const only = pageVisuals.length === 1
  let cursorX = margin
  let cursorY = startY
  let rowHeight = 0

  for (const [visualIndex, original] of pageVisuals.entries()) {
    const spec = { ...original }
    const { definition } = normalizeVisualType(spec)
    const def = definition ?? VISUALS.textbox
    const width = Number(spec.width ?? spec.w ?? defaultVisualSize(spec, def, size, only).width)
    const height = Number(spec.height ?? spec.h ?? defaultVisualSize(spec, def, size, only).height)
    let x = firstDefined(spec.x, spec.left)
    let y = firstDefined(spec.y, spec.top)

    if (x === undefined || y === undefined) {
      if (cursorX + width > size.width - margin && cursorX > margin) {
        cursorX = margin
        cursorY += rowHeight + gap
        rowHeight = 0
      }
      x = cursorX
      y = cursorY
      cursorX += width + gap
      rowHeight = Math.max(rowHeight, height)
    }

    if (x < 0 || y < 0 || x + width > size.width + 0.5 || y + height > size.height + 0.5) {
      warnings.push(`Page "${page.title ?? index + 1}" visual ${visualIndex + 1} is outside the ${size.width}x${size.height} canvas`)
    }

    visuals.push({
      ...spec,
      x: Number(x),
      y: Number(y),
      width,
      height,
      z: firstDefined(spec.z, 100 + visualIndex * 100),
      tabOrder: firstDefined(spec.tabOrder, 100 + visualIndex * 100),
    })
  }

  return { ...page, width: size.width, height: size.height, visuals }
}

async function writeTheme(dir, theme, baseDir) {
  if (theme === false || theme === null) return null
  let value
  if (typeof theme === 'string') {
    const fs = await import('node:fs/promises')
    const file = path.isAbsolute(theme) ? theme : path.resolve(baseDir ?? process.cwd(), theme)
    value = JSON.parse(await fs.readFile(file, 'utf8'))
  } else if (isObject(theme)) {
    value = { ...theme }
  } else {
    value = { ...DEFAULT_THEME }
  }
  if (!value.name) value.name = 'PBIP Forge'
  await writeJson(path.join(dir, 'StaticResources', 'RegisteredResources', 'theme.json'), value)
  return value
}

export function validateReportSpec(report, index) {
  const errors = []
  const pages = Array.isArray(report.pages) && report.pages.length > 0
    ? report.pages
    : [{ title: 'Overview', visuals: [] }]

  for (const [pageIndex, rawPage] of pages.entries()) {
    if (!isObject(rawPage)) {
      errors.push(`Page ${pageIndex + 1} must be an object`)
      continue
    }
    const page = { ...rawPage, visuals: Array.isArray(rawPage.visuals) ? rawPage.visuals : [] }
    const pageLabel = page.displayName ?? page.title ?? `Page ${pageIndex + 1}`
    try {
      layoutPage(page, pageIndex, [])
    } catch (error) {
      errors.push(`Page "${pageLabel}": ${error.message}`)
      continue
    }
    for (const [visualIndex, visual] of page.visuals.entries()) {
      try {
        buildVisual(
          visual,
          index,
          `Page "${pageLabel}" visual ${visualIndex + 1}`,
          { x: 0, y: 0, width: 600, height: 300, z: 0, tabOrder: 0 },
        )
      } catch (error) {
        errors.push(error.message)
      }
    }
  }
  return errors
}

export async function buildReport({ dir, projectName, report, index, baseDir }) {
  const definition = path.join(dir, 'definition')
  const pagesDir = path.join(definition, 'pages')
  await ensureDir(pagesDir)

  const pages = Array.isArray(report.pages) && report.pages.length > 0
    ? report.pages
    : [{ title: 'Overview', visuals: [] }]
  const warnings = []

  const errors = validateReportSpec(report, index)
  if (errors.length > 0) throw new ForgeError(`Report validation failed:\n- ${errors.join('\n- ')}`, errors)

  const theme = await writeTheme(dir, report.theme, baseDir)

  await writeJson(path.join(dir, '.platform'), {
    $schema: PLATFORM_SCHEMA,
    metadata: { type: 'Report', displayName: projectName },
    config: { version: '2.0', logicalId: uuid() },
  })

  await writeJson(path.join(dir, 'definition.pbir'), {
    $schema: PBIR_SCHEMA,
    version: '4.0',
    datasetReference: {
      byPath: { path: `../${path.basename(dir, '.Report')}.SemanticModel` },
    },
  })

  const reportDefinition = {
    $schema: REPORT_SCHEMA,
    themeCollection: {
      baseTheme: {
        name: 'CY24SU10',
        reportVersionAtImport: '5.61',
        type: 'SharedResources',
      },
      ...(theme
        ? {
            customTheme: {
              name: 'theme.json',
              reportVersionAtImport: '5.64',
              type: 'RegisteredResources',
            },
          }
        : {}),
    },
    layoutOptimization: 'None',
    resourcePackages: [
      {
        name: 'SharedResources',
        type: 'SharedResources',
        items: [{ name: 'CY24SU10', path: 'BaseThemes/CY24SU10.json', type: 'BaseTheme' }],
      },
      ...(theme
        ? [{
            name: 'RegisteredResources',
            type: 'RegisteredResources',
            items: [{ name: 'theme.json', path: 'theme.json', type: 'CustomTheme' }],
          }]
        : []),
    ],
    settings: {
      useStylableVisualContainerHeader: true,
      defaultFilterActionIsDataFilter: true,
      defaultDrillFilterOtherVisuals: true,
      allowChangeFilterTypes: true,
      allowInlineExploration: true,
      useEnhancedTooltips: true,
    },
  }

  await writeJson(path.join(definition, 'report.json'), reportDefinition)
  await writeJson(path.join(definition, 'version.json'), {
    $schema: VERSION_SCHEMA,
    version: '2.0.0',
  })

  const pageOrder = []
  let visualCount = 0

  for (const [pageIndex, originalPage] of pages.entries()) {
    const page = layoutPage(originalPage, pageIndex, warnings)
    const pageName = shortId()
    pageOrder.push(pageName)
    const pageDir = path.join(pagesDir, pageName)
    const visualsDir = path.join(pageDir, 'visuals')
    await ensureDir(visualsDir)

    await writeJson(path.join(pageDir, 'page.json'), {
      $schema: PAGE_SCHEMA,
      name: pageName,
      displayName: String(page.displayName ?? page.title ?? `Page ${pageIndex + 1}`),
      displayOption: page.displayOption ?? 'FitToPage',
      height: page.height,
      width: page.width,
    })

    for (const [visualIndex, spec] of page.visuals.entries()) {
      const visual = buildVisual(
        spec,
        index,
        `Page "${page.displayName ?? page.title ?? pageIndex + 1}" visual ${visualIndex + 1}`,
        {
          x: spec.x,
          y: spec.y,
          width: spec.width,
          height: spec.height,
          z: spec.z,
          tabOrder: spec.tabOrder,
        },
      )
      await writeJson(path.join(visualsDir, visual.name, 'visual.json'), visual)
      visualCount++
    }
  }

  await writeJson(path.join(pagesDir, 'pages.json'), {
    $schema: PAGES_SCHEMA,
    pageOrder,
    activePageName: pageOrder[0],
  })

  return { dir, pages: pages.length, visuals: visualCount, warnings }
}
