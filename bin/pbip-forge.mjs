#!/usr/bin/env node
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProject, ForgeError } from '../src/forge.mjs'
import { HELP } from '../src/help.mjs'
import { validateProject } from '../src/inspect.mjs'
import { openInPowerBi, validateTmdl } from '../src/desktop.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const serverPath = path.join(root, 'mcp', 'server.mjs')
const nodePath = process.execPath

function usage() {
  return `pbip-forge 1.0.1

Create complete Power BI projects (.pbip) directly.

Usage:
  pbip-forge build <spec.json> [options]
  pbip-forge build --spec '<json>' [options]
  pbip-forge validate <project.pbip>
  pbip-forge open <project.pbip>
  pbip-forge config <client>
  pbip-forge install [--target <dir>]
  pbip-forge help [topic]
  pbip-forge mcp

Build options:
  -o, --output <dir>     Output directory, or a path ending in .pbip
  --overwrite            Replace an existing generated project
  --headless             Never launch Power BI Desktop (default for build)
  --open                 Explicitly open the result in Power BI Desktop
  --no-validate          Skip TMDL validation
  --json                 Print the full JSON result

Clients for "config":
  codex, claude, cursor, qoder, workbuddy, vscode, windsurf, dsh, generic
`
}

function parseArgs(argv) {
  const args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('-')) {
      args._.push(token)
      continue
    }
    const key = token.replace(/^-+/, '')
    if (key === 'overwrite' || key === 'open' || key === 'headless' || key === 'json' || key === 'help') {
      args.flags[key] = true
      continue
    }
    if (key === 'no-validate') {
      args.flags.validate = false
      continue
    }
    if (key === 'spec' || key === 'output' || key === 'target' || key === 'client') {
      args.flags[key] = argv[++i]
      continue
    }
    if (key === 'o') {
      args.flags.output = argv[++i]
      continue
    }
    args.flags[key] = argv[++i] ?? true
  }
  return args
}

function jsonOrText(result, flags) {
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (result.ok) {
    console.log(`Created ${result.project}`)
    console.log(`  model:  ${result.modelDir}`)
    console.log(`  report: ${result.reportDir}`)
    console.log(`  tables=${result.summary.tables} columns=${result.summary.columns} measures=${result.summary.measures} pages=${result.summary.pages} visuals=${result.summary.visuals}`)
    if (result.validation?.tmdl) {
      const t = result.validation.tmdl
      console.log(`  TMDL validation: ${t.status}${t.status === 'passed' ? ` (${t.tables} tables, ${t.relationships} relationships)` : t.reason ? ` — ${t.reason}` : ''}`)
    }
    for (const warning of result.warnings ?? []) console.log(`  warning: ${warning}`)
    console.log('Next: open the .pbip manually in Power BI Desktop when you are ready; the build itself never opens a window.')
  } else {
    console.error(`Build failed${result.error ? `: ${result.error}` : ''}`)
    if (result.project) console.error(`  project: ${result.project}`)
    for (const warning of result.warnings ?? []) console.error(`  warning: ${warning}`)
  }
}

function configFor(client) {
  const stdio = { command: nodePath, args: [serverPath] }
  const generic = { mcpServers: { powerbi: stdio } }
  switch (client) {
    case 'codex':
      return `[mcp_servers.powerbi]\ncommand = ${JSON.stringify(nodePath)}\nargs = [${JSON.stringify(serverPath)}]\nstartup_timeout_sec = 30\n`
    case 'vscode':
      return JSON.stringify({ servers: { powerbi: { type: 'stdio', ...stdio } } }, null, 2)
    case 'claude':
    case 'cursor':
    case 'qoder':
    case 'workbuddy':
    case 'generic':
      return JSON.stringify(generic, null, 2)
    case 'windsurf':
      return JSON.stringify(generic, null, 2)
    case 'dsh':
      return JSON.stringify({
        note: 'Install this package as a DSH bundle for native tools, or register the MCP server with the generic JSON below.',
        mcpServers: { powerbi: stdio },
      }, null, 2)
    default:
      throw new ForgeError(`Unknown client "${client}". Use codex, claude, cursor, qoder, workbuddy, vscode, windsurf, dsh, or generic.`)
  }
}

async function install(targetArg) {
  const target = path.resolve(targetArg ?? path.join(homedir(), '.pbip-forge'))
  await mkdir(target, { recursive: true })
  for (const entry of [
    'index.js', 'src', 'bin', 'mcp', 'locale', 'docs', 'platforms', 'skills',
    'examples', 'icon.svg', 'package.json', 'cordis.patch.yml', 'README.md',
    'AGENTS.md', 'CHANGELOG.md', 'LICENSE',
  ]) {
    await cp(path.join(root, entry), path.join(target, entry), { recursive: true, force: true })
  }
  const cmd = `@echo off\r\n"${nodePath}" "${path.join(target, 'bin', 'pbip-forge.mjs')}" %*\r\n`
  await writeFile(path.join(target, 'pbip-forge.cmd'), cmd, 'utf8')
  const shPath = path.join(target, 'pbip-forge.sh')
  const sh = `#!/bin/sh\nexec "${nodePath}" "${path.join(target, 'bin', 'pbip-forge.mjs')}" "$@"\n`
  await writeFile(shPath, sh, 'utf8')
  if (process.platform !== 'win32') {
    const { chmod } = await import('node:fs/promises')
    await chmod(shPath, 0o755)
    await chmod(path.join(target, 'bin', 'pbip-forge.mjs'), 0o755)
  }
  console.log(`Installed to ${target}`)
  console.log(`Launcher: ${path.join(target, 'pbip-forge.cmd')}`)
  console.log('')
  console.log('MCP server for this installation:')
  console.log(`  node "${path.join(target, 'mcp', 'server.mjs')}"`)
  console.log('')
  console.log('Run "pbip-forge config codex|claude|qoder|..." for client snippets.')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0] ?? 'help'

  if (command === 'help' || args.flags.help) {
    console.log(HELP)
    return
  }
  if (command === 'version' || command === '--version') {
    console.log('1.0.1')
    return
  }
  if (command === 'build') {
    if (args.flags.headless) process.env.PBIP_FORGE_HEADLESS = '1'
    const specPath = args._[1] ?? args.flags.specPath
    const spec = args.flags.spec
    if (!spec && !specPath) {
      console.error('Provide a spec file path or --spec JSON. Run "pbip-forge help".')
      process.exitCode = 2
      return
    }
    try {
      const result = await buildProject(
        { specPath, spec },
        {
          outputDir: args.flags.output,
          overwrite: args.flags.overwrite === true,
          open: args.flags.open === true && args.flags.headless !== true,
          validate: args.flags.validate !== false,
        },
      )
      jsonOrText(result, args.flags)
      if (!result.ok) process.exitCode = 1
    } catch (error) {
      const payload = { ok: false, error: error.message, details: error.details ?? [] }
      if (args.flags.json) console.log(JSON.stringify(payload, null, 2))
      else console.error(`ERROR: ${error.message}`)
      process.exitCode = 1
    }
    return
  }
  if (command === 'validate') {
    const target = args._[1]
    if (!target) {
      console.error('Provide a .pbip path')
      process.exitCode = 2
      return
    }
    try {
      const result = await validateProject(target)
      if (args.flags.json) console.log(JSON.stringify(result, null, 2))
      else {
        console.log(result.ok ? `Valid: ${result.project}` : `Invalid: ${result.project}`)
        console.log(`  pages=${result.pages} visuals=${result.visuals}`)
        console.log(`  TMDL: ${result.validation.tmdl.status}${result.validation.tmdl.reason ? ` — ${result.validation.tmdl.reason}` : ''}`)
        for (const error of result.errors) console.error(`  error: ${error}`)
        for (const warning of result.warnings) console.log(`  warning: ${warning}`)
      }
      if (!result.ok) process.exitCode = 1
    } catch (error) {
      console.error(`ERROR: ${error.message}`)
      process.exitCode = 1
    }
    return
  }
  if (command === 'open') {
    const target = args._[1]
    if (!target) {
      console.error('Provide a .pbip path')
      process.exitCode = 2
      return
    }
    const result = await openInPowerBi(target)
    console.log(JSON.stringify(result, null, 2))
    if (!result.opened) process.exitCode = 1
    return
  }
  if (command === 'config') {
    const client = args._[1] ?? args.flags.client ?? 'generic'
    try {
      console.log(configFor(client))
    } catch (error) {
      console.error(error.message)
      process.exitCode = 2
    }
    return
  }
  if (command === 'install') {
    await install(args.flags.target)
    return
  }
  if (command === 'mcp') {
    await import(path.join(root, 'mcp', 'server.mjs'))
    return
  }

  console.error(`Unknown command: ${command}\n`)
  console.log(usage())
  process.exitCode = 2
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`)
  if (error.details?.length) console.error(error.details.join('\n'))
  process.exitCode = 1
})
