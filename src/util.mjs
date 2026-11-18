import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export class ForgeError extends Error {
  constructor(message, details = []) {
    super(message)
    this.name = 'ForgeError'
    this.details = details
  }
}

export function fail(message, details = []) {
  throw new ForgeError(message, details)
}

export const uuid = () => randomUUID()
export const shortId = () => randomBytes(10).toString('hex')

const RESERVED = new Set([
  'model', 'database', 'table', 'column', 'measure', 'relationship', 'role',
  'perspective', 'cultureinfo', 'expression', 'partition', 'hierarchy', 'level',
  'annotation', 'datatype', 'datatype', 'source', 'mode', 'ref', 'kpi', 'variant',
  'true', 'false', 'null',
])

export function quoteName(name) {
  const text = String(name)
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text) && !RESERVED.has(text.toLowerCase())) {
    return text
  }
  return `'${text.replaceAll("'", "''")}'`
}

export function jsonName(name) {
  return JSON.stringify(String(name))
}

export function safeFileBase(name, fallback = 'Project') {
  const cleaned = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
  return cleaned || fallback
}

export function slug(name, fallback = 'project') {
  const cleaned = String(name ?? '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return cleaned || fallback
}

export function ensureArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function firstDefined(...values) {
  for (const value of values) if (value !== undefined && value !== null) return value
  return undefined
}

export function asNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

export function mString(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function mField(name) {
  const text = String(name)
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text
  return `#${mString(text)}`
}

export function mNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'null'
  if (Object.is(n, -0)) return '0'
  return String(n)
}

export function pad(value) {
  return String(value).padStart(2, '0')
}

export function indentBlock(text, tabs = 3) {
  const prefix = '\t'.repeat(tabs)
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\s+$/u, '')
    .split('\n')
    .map((line) => (line.length > 0 ? prefix + line : ''))
    .join('\n')
}

export function comment(text, tabs = 0) {
  if (!text) return ''
  const prefix = '\t'.repeat(tabs)
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `${prefix}/// ${line}`.trimEnd())
    .join('\n') + '\n'
}

export function literalString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

export async function writeJson(file, value) {
  await ensureDir(path.dirname(file))
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function writeText(file, value) {
  await ensureDir(path.dirname(file))
  await writeFile(file, value.endsWith('\n') ? value : `${value}\n`, 'utf8')
}

export function normalizeNewlines(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n')
}

export function splitLines(text) {
  return normalizeNewlines(text).split('\n')
}

export function truncate(text, max = 240) {
  const s = String(text ?? '')
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

export function uniqueNames(items, key = 'name') {
  const seen = new Map()
  const duplicates = []
  for (const item of items) {
    const name = String(item[key] ?? '')
    const lower = name.toLowerCase()
    if (seen.has(lower)) duplicates.push(name)
    else seen.set(lower, true)
  }
  return duplicates
}

export function sanitizeDax(expression) {
  return normalizeNewlines(expression).trim()
}

export function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}
