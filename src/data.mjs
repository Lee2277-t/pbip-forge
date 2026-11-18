import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { ForgeError, isBlank, isObject, pad } from './util.mjs'

const execFileAsync = promisify(execFile)

const TYPE_ALIASES = new Map([
  ['string', 'string'], ['text', 'string'], ['varchar', 'string'], ['char', 'string'],
  ['int', 'int64'], ['integer', 'int64'], ['int64', 'int64'], ['long', 'int64'], ['bigint', 'int64'],
  ['double', 'double'], ['number', 'double'], ['float', 'double'], ['real', 'double'],
  ['decimal', 'decimal'], ['numeric', 'decimal'], ['currency', 'decimal'], ['money', 'decimal'],
  ['date', 'dateTime'], ['datetime', 'dateTime'], ['datetime64', 'dateTime'], ['timestamp', 'dateTime'],
  ['bool', 'boolean'], ['boolean', 'boolean'], ['logical', 'boolean'],
  ['binary', 'binary'], ['variant', 'variant'], ['any', 'variant'],
])

export function normalizeDataType(value) {
  if (!value) return undefined
  return TYPE_ALIASES.get(String(value).toLowerCase())
}

export function inferColumnType(values) {
  const sample = []
  for (const value of values) {
    if (isBlank(value)) continue
    sample.push(value)
    if (sample.length >= 1000) break
  }
  if (sample.length === 0) return 'string'

  let allBoolean = true
  let allNumber = true
  let allDate = true
  let dateLike = false

  for (const value of sample) {
    const text = String(value).trim()
    if (typeof value !== 'boolean' && !/^(true|false)$/i.test(text)) allBoolean = false
    if (!isFiniteNumberLike(value, text)) allNumber = false
    if (parseDateValue(value, { strict: true })) dateLike = true
    else allDate = false
  }

  if (allBoolean) return 'boolean'
  if (allNumber) {
    const allInteger = sample.every((value) => Number.isInteger(Number(value)))
    const tooLong = sample.some((value) => String(value).trim().replace(/^[-+]/, '').replace(/\.0+$/, '').length > 15)
    return allInteger && !tooLong ? 'int64' : 'double'
  }
  if (allDate && dateLike) return 'dateTime'
  return 'string'
}

function isFiniteNumberLike(value, text) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const t = text.trim()
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(t)) return false
  if (/^[-+]?0\d+/.test(t) && !/^[-+]?0\./.test(t)) return false
  return Number.isFinite(Number(t))
}

export function parseDateValue(value, { strict = false } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      y: value.getFullYear(),
      m: value.getMonth() + 1,
      d: value.getDate(),
      h: value.getHours(),
      mi: value.getMinutes(),
      s: value.getSeconds(),
      dateOnly: value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0,
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400 * 1000)
      const date = new Date(ms)
      if (!Number.isNaN(date.getTime())) {
        return {
          y: date.getUTCFullYear(),
          m: date.getUTCMonth() + 1,
          d: date.getUTCDate(),
          h: date.getUTCHours(),
          mi: date.getUTCMinutes(),
          s: date.getUTCSeconds(),
          dateOnly: date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0,
        }
      }
    }
    return undefined
  }

  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined

  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text)
  if (m) {
    const result = {
      y: Number(m[1]), m: Number(m[2]), d: Number(m[3]),
      h: Number(m[4] ?? 0), mi: Number(m[5] ?? 0), s: Number(m[6] ?? 0),
    }
    result.dateOnly = result.h === 0 && result.mi === 0 && result.s === 0
    return validDate(result) ? result : undefined
  }

  if (!strict) {
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text)
    if (m) {
      let month = Number(m[1])
      let day = Number(m[2])
      if (month > 12 && day <= 12) [month, day] = [day, month]
      const result = { y: Number(m[3]), m: month, d: day, h: 0, mi: 0, s: 0, dateOnly: true }
      return validDate(result) ? result : undefined
    }
  }
  return undefined
}

function validDate(parts) {
  if (parts.m < 1 || parts.m > 12 || parts.d < 1 || parts.d > 31) return false
  if (parts.h > 23 || parts.mi > 59 || parts.s > 59) return false
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d))
  return date.getUTCFullYear() === parts.y
    && date.getUTCMonth() + 1 === parts.m
    && date.getUTCDate() === parts.d
}

export function dateToIso(parts) {
  if (!parts) return null
  const date = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`
  if (parts.dateOnly) return date
  return `${date}T${pad(parts.h)}:${pad(parts.mi)}:${pad(parts.s)}`
}

export function parseDelimited(text, delimiter) {
  const input = String(text).replace(/^\uFEFF/, '')
  const sep = delimiter || detectDelimiter(input)
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\r') {
      // handled by the following newline
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  if (rows.length > 0 && rows.at(-1).every((cell) => cell === '')) rows.pop()
  return { rows, delimiter: sep }
}

export function detectDelimiter(text) {
  const lines = String(text).split(/\r?\n/).filter((line) => line.trim() !== '').slice(0, 8)
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestScore = -1
  for (const candidate of candidates) {
    const counts = lines.map((line) => countOutsideQuotes(line, candidate))
    if (counts.length === 0) continue
    const average = counts.reduce((sum, n) => sum + n, 0) / counts.length
    const variance = counts.reduce((sum, n) => sum + (n - average) ** 2, 0) / counts.length
    const score = average - variance * 0.5
    if (average > 0 && score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

function countOutsideQuotes(line, delimiter) {
  let count = 0
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') i++
      else quoted = !quoted
    } else if (!quoted && ch === delimiter) {
      count++
    }
  }
  return count
}

function headerLooksLike(header, columns) {
  if (!columns || columns.length === 0) return false
  if (header.length !== columns.length) return false
  return header.every((cell, index) => String(cell).trim().toLowerCase() === String(columns[index].name).toLowerCase())
}

function matrixToTable(matrix, table, warnings) {
  if (matrix.length === 0) return { header: [], rows: [] }
  let header = []
  let rows = []
  const explicit = table.columns && table.columns.length > 0
  const headerFlag = table.header
  let hasHeader = false

  if (headerFlag === true) hasHeader = true
  else if (headerFlag === false) hasHeader = false
  else if (explicit) hasHeader = headerLooksLike(matrix[0], table.columns)
  else hasHeader = true

  if (hasHeader) {
    header = matrix[0].map((value, index) => String(value ?? '').trim() || `Column${index + 1}`)
    rows = matrix.slice(1)
  } else {
    rows = matrix
  }

  if (explicit) {
    header = table.columns.map((column) => column.name)
  } else {
    if (header.length === 0) {
      const width = Math.max(...rows.map((row) => row.length), 0)
      header = Array.from({ length: width }, (_, index) => `Column${index + 1}`)
    }
    const seen = new Map()
    header = header.map((name, index) => {
      let candidate = String(name || `Column${index + 1}`).trim()
      if (!candidate) candidate = `Column${index + 1}`
      const key = candidate.toLowerCase()
      if (seen.has(key)) {
        seen.set(key, seen.get(key) + 1)
        return `${candidate}_${seen.get(key)}`
      }
      seen.set(key, 1)
      return candidate
    })
  }
  return { header, rows }
}

function objectRowsToMatrix(rows) {
  const keys = []
  const seen = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return { header: keys, rows: rows.map((row) => keys.map((key) => row[key])) }
}

async function readCsv(path) {
  const text = await readFile(path, 'utf8')
  return parseDelimited(text)
}

async function readExcel(path, sheet) {
  const candidates = []
  if (process.env.PBIP_FORGE_PYTHON) candidates.push({ command: process.env.PBIP_FORGE_PYTHON, prefix: [] })
  candidates.push({ command: 'python', prefix: [] })
  candidates.push({ command: 'python3', prefix: [] })
  if (process.platform === 'win32') candidates.push({ command: 'py', prefix: ['-3'] })

  const script = [
    'import json, sys',
    'from openpyxl import load_workbook',
    'path = sys.argv[1]',
    'sheet = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None',
    'wb = load_workbook(path, data_only=True, read_only=True)',
    'ws = wb[sheet] if sheet else wb.active',
    'rows = []',
    'for row in ws.iter_rows(values_only=True):',
    '    values = []',
    '    for value in row:',
    '        if hasattr(value, "isoformat"):',
    '            values.append(value.isoformat())',
    '        else:',
    '            values.append(value)',
    '    rows.append(values)',
    'print(json.dumps(rows, ensure_ascii=False, allow_nan=False))',
  ].join('\n')

  let lastError
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(
        candidate.command,
        [...candidate.prefix, '-c', script, path, sheet ?? ''],
        { timeout: 120_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true },
      )
      const rows = JSON.parse(stdout)
      return { rows, delimiter: 'excel' }
    } catch (error) {
      lastError = error
      if (error.code !== 'ENOENT') break
    }
  }

  const reason = lastError?.code === 'ENOENT'
    ? 'Python was not found. Install Python + openpyxl, or export the sheet to CSV.'
    : `Could not read the workbook with openpyxl: ${lastError?.message ?? 'unknown error'}`
  throw new ForgeError(reason)
}

function coerceValue(value, column, stats) {
  if (value === undefined || value === null || value === '') return null
  const type = column.type

  if (type === 'string') {
    if (value instanceof Date) return dateToIso(parseDateValue(value))
    return String(value)
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    const text = String(value).trim().toLowerCase()
    if (text === 'true' || text === '1' || text === 'yes' || text === 'y') return true
    if (text === 'false' || text === '0' || text === 'no' || text === 'n') return false
    stats.invalid++
    return null
  }
  if (type === 'int64' || type === 'double' || type === 'decimal') {
    const text = typeof value === 'string' ? value.trim().replaceAll(',', '') : value
    if (text === '') return null
    const n = Number(text)
    if (!Number.isFinite(n)) {
      stats.invalid++
      return null
    }
    return type === 'int64' ? Math.trunc(n) : n
  }
  if (type === 'dateTime') {
    const parsed = parseDateValue(value)
    if (!parsed) {
      stats.invalid++
      return null
    }
    return dateToIso(parsed)
  }
  return value
}

export async function loadTableData(table, warnings) {
  let matrix
  let sourceLabel

  if (typeof table.csv === 'string' && table.csv.trim()) {
    const csv = await readCsv(table.csv)
    matrix = csv.rows
    sourceLabel = `csv:${table.csv}`
  } else if (typeof table.excel === 'string' || isObject(table.excel)) {
    const excel = isObject(table.excel) ? table.excel : { path: table.excel }
    if (!excel.path) throw new ForgeError(`Table "${table.name}" has an excel source without a path`)
    const read = await readExcel(excel.path, excel.sheet)
    matrix = read.rows
    sourceLabel = `excel:${excel.path}${excel.sheet ? `#${excel.sheet}` : ''}`
  } else if (Array.isArray(table.rows)) {
    if (table.rows.length > 0 && isObject(table.rows[0])) {
      const converted = objectRowsToMatrix(table.rows)
      matrix = [converted.header, ...converted.rows]
      table = { ...table, header: true, columns: table.columns && table.columns.length > 0 ? table.columns : converted.header.map((name) => ({ name })) }
    } else {
      matrix = table.rows
      table = { ...table, header: table.header === true }
    }
    sourceLabel = 'inline'
  } else {
    throw new ForgeError(`Table "${table.name}" has no rows, csv, excel, or expression`)
  }

  if (matrix.length === 0) throw new ForgeError(`Table "${table.name}" contains no rows`)

  const { header, rows } = matrixToTable(matrix, table, warnings)
  const width = header.length
  const normalizedRows = rows.map((row) => {
    const copy = Array.from({ length: width }, (_, index) => row[index] ?? null)
    return copy
  })

  const explicitColumns = Array.isArray(table.columns) && table.columns.length > 0
  const columns = header.map((name, index) => {
    const provided = explicitColumns ? table.columns[index] : undefined
    const normalized = isObject(provided) ? { ...provided } : { name: provided ?? name }
    normalized.name = String(normalized.name ?? name)
    normalized.sourceName = String(name)
    normalized.type = normalizeDataType(normalized.type ?? normalized.dataType)
    if (normalized.type === 'dateTime') {
      const dateOnly = normalized.dateOnly ?? normalized.dateonly
      normalized.mType = dateOnly === false ? 'datetime' : (normalized.mType ?? (String(normalized.format ?? '').match(/time/i) ? 'datetime' : 'date'))
    }
    if (normalized.type === 'decimal') normalized.mType = normalized.mType ?? 'number'
    return normalized
  })

  for (let c = 0; c < columns.length; c++) {
    if (!columns[c].type) {
      columns[c].type = inferColumnType(normalizedRows.map((row) => row[c]))
      if (columns[c].type === 'dateTime') columns[c].mType = 'date'
    }
    if (columns[c].type === 'dateTime' && !columns[c].mType) columns[c].mType = 'date'
  }

  const stats = { invalid: 0 }
  for (let c = 0; c < columns.length; c++) {
    columns[c]._values = normalizedRows.map((row) => coerceValue(row[c], columns[c], stats))
  }

  if (stats.invalid > 0) {
    warnings.push(`Table "${table.name}": ${stats.invalid} value(s) could not be converted to the declared type and were replaced with null`)
  }

  const rowLimit = 200_000
  if (normalizedRows.length > rowLimit) {
    throw new ForgeError(`Table "${table.name}" has ${normalizedRows.length} rows; the inline limit is ${rowLimit}. Use an expression source instead.`)
  }
  if (normalizedRows.length > 20_000) {
    warnings.push(`Table "${table.name}" has ${normalizedRows.length} inline rows; the .pbip file will be large. Consider a CSV or a native M expression.`)
  }

  return { columns, rowCount: normalizedRows.length, source: sourceLabel }
}
