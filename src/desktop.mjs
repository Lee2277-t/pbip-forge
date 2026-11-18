import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))

function candidateShells() {
  const list = []
  if (process.env.PBIP_FORGE_PWSH) list.push(process.env.PBIP_FORGE_PWSH)
  list.push('pwsh', 'powershell')
  return [...new Set(list)]
}

async function runPowerShell(script, args, options = {}) {
  let lastError
  for (const shell of candidateShells()) {
    try {
      const { stdout, stderr } = await execFileAsync(
        shell,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
        { timeout: options.timeoutMs ?? 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      )
      return { stdout, stderr, shell }
    } catch (error) {
      lastError = error
      if (error.code !== 'ENOENT') break
    }
  }
  throw lastError ?? new Error('PowerShell was not found')
}

function parseJsonOutput(stdout) {
  const lines = String(stdout).trim().split(/\r?\n/).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      return JSON.parse(lines[index])
    } catch {
      // keep looking
    }
  }
  return undefined
}

export async function validateTmdl(modelDefinitionDir) {
  if (process.platform !== 'win32') {
    return { status: 'skipped', reason: 'TMDL validation with the Power BI engine is available on Windows only' }
  }
  try {
    const result = await runPowerShell(path.join(here, 'validate-tmdl.ps1'), [modelDefinitionDir], { timeoutMs: 90_000 })
    const parsed = parseJsonOutput(result.stdout)
    if (!parsed) return { status: 'skipped', reason: 'The validator returned no JSON' }
    if (parsed.skipped) return { status: 'skipped', reason: parsed.reason }
    if (parsed.ok) {
      return {
        status: 'passed',
        tables: Number(parsed.tables ?? 0),
        relationships: Number(parsed.relationships ?? 0),
        validator: 'Power BI TMDL serializer',
      }
    }
    return { status: 'failed', error: parsed.error ?? 'TMDL validation failed' }
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim()
    return { status: 'skipped', reason: `Could not run the Power BI TMDL validator: ${detail}` }
  }
}

export async function openInPowerBi(pbipPath) {
  if (process.platform !== 'win32') {
    return { opened: false, reason: 'Power BI Desktop is Windows-only' }
  }
  if (isHeadless()) {
    return {
      opened: false,
      headless: true,
      reason: 'Headless mode is active (PBIP_FORGE_HEADLESS); Power BI Desktop was not launched.',
    }
  }
  const escaped = String(pbipPath).replaceAll("'", "''")
  try {
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${escaped}'`],
      { timeout: 30_000, windowsHide: true },
    )
    return { opened: true }
  } catch (error) {
    return { opened: false, reason: String(error?.message ?? error) }
  }
}

export function isHeadless() {
  const value = String(process.env.PBIP_FORGE_HEADLESS ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}
