#!/usr/bin/env node
import readline from 'node:readline'
import { buildProject, ForgeError } from '../src/forge.mjs'
import { HELP } from '../src/help.mjs'
import { validateProject } from '../src/inspect.mjs'
import { openInPowerBi } from '../src/desktop.mjs'

const SERVER_INFO = { name: 'pbip-forge', version: '1.0.1' }
const SUPPORTED_PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18']

const CREATE_TOOL = {
  name: 'powerbi_create',
  description:
    'Create a complete Power BI project (.pbip) directly on disk: TMDL semantic model, DAX measures, relationships, RLS, PBIR report pages and native visuals. Fully headless: this tool never launches Power BI Desktop and never opens a window. Provide a spec object or a path to a JSON spec. Call powerbi_help for the full spec reference and examples.',
  inputSchema: {
    type: 'object',
    properties: {
      spec: {
        type: 'object',
        additionalProperties: true,
        description: 'Project spec. See powerbi_help. Either spec or specPath is required.',
      },
      specPath: {
        type: 'string',
        description: 'Absolute path to a JSON spec file. Either spec or specPath is required.',
      },
      outputDir: {
        type: 'string',
        description: 'Output directory (absolute recommended) or a path ending in .pbip. Defaults to the spec file directory, then the server working directory.',
      },
      overwrite: {
        type: 'boolean',
        description: 'Replace an existing generated project.',
      },
      validate: {
        type: 'boolean',
        description: 'Run TMDL validation when Power BI Desktop is installed. Default true. This is a file-level check and does not open a window.',
      },
    },
    additionalProperties: false,
  },
}

const HELP_TOOL = {
  name: 'powerbi_help',
  description: 'Return the PBIP Forge spec reference, visual type list, field syntax, and examples. Call this before the first powerbi_create if the spec shape is unclear.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Optional topic: spec, visuals, data, model, theme, cli, mcp.',
      },
    },
    additionalProperties: false,
  },
}

const VALIDATE_TOOL = {
  name: 'powerbi_validate',
  description: 'Validate an existing .pbip project: report structure, page/visual files, and TMDL parsing when Power BI Desktop is installed.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the .pbip file.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
}

const OPEN_TOOL = {
  name: 'powerbi_open',
  description: 'Open an existing .pbip file in Power BI Desktop. WARNING: this is the only tool here that launches a visible Power BI window; use it only when the user explicitly asks to open the report. Windows only.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the .pbip file.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
}

const TOOLS = [CREATE_TOOL, HELP_TOOL, VALIDATE_TOOL, OPEN_TOOL]

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function textResult(value, isError = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  }
}

async function callTool(name, args = {}) {
  if (name === 'powerbi_help') return textResult(HELP)
  if (name === 'powerbi_create') {
    if (!args.spec && !args.specPath) {
      return textResult('Provide either "spec" or "specPath". Call powerbi_help for the spec reference.', true)
    }
    try {
      const result = await buildProject(
        { spec: args.spec, specPath: args.specPath },
        {
          outputDir: args.outputDir,
          overwrite: args.overwrite,
          open: false,
          validate: args.validate,
        },
      )
      return textResult(result, result.ok === false)
    } catch (error) {
      return textResult({ ok: false, error: error.message, details: error.details ?? [] }, true)
    }
  }
  if (name === 'powerbi_validate') {
    if (!args.path) return textResult('"path" is required', true)
    try {
      const result = await validateProject(args.path)
      return textResult(result, result.ok === false)
    } catch (error) {
      return textResult({ ok: false, error: error.message }, true)
    }
  }
  if (name === 'powerbi_open') {
    if (!args.path) return textResult('"path" is required', true)
    const result = await openInPowerBi(args.path)
    return textResult(result, result.opened === false)
  }
  return textResult(`Unknown tool: ${name}`, true)
}

async function handle(message) {
  const { id, method, params } = message
  if (!method) {
    if (id !== undefined) sendError(id, -32600, 'Invalid request')
    return
  }

  if (method === 'initialize') {
    const requested = params?.protocolVersion
    const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : '2024-11-05'
    sendResult(id, {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    })
    return
  }
  if (method === 'notifications/initialized' || method === 'initialized') return
  if (method === 'ping') {
    if (id !== undefined) sendResult(id, {})
    return
  }
  if (method === 'tools/list') {
    sendResult(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    const name = params?.name
    const args = params?.arguments ?? {}
    if (!name) {
      sendError(id, -32602, 'tools/call requires a tool name')
      return
    }
    const result = await callTool(name, args)
    sendResult(id, result)
    return
  }
  if (method === 'resources/list') {
    sendResult(id, { resources: [] })
    return
  }
  if (method === 'resources/templates/list') {
    sendResult(id, { resourceTemplates: [] })
    return
  }
  if (method === 'prompts/list') {
    sendResult(id, { prompts: [] })
    return
  }
  if (method === 'logging/setLevel') {
    if (id !== undefined) sendResult(id, {})
    return
  }

  if (id !== undefined) sendError(id, -32601, `Method not found: ${method}`)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let message
  try {
    message = JSON.parse(trimmed)
  } catch (error) {
    sendError(null, -32700, `Parse error: ${error.message}`)
    return
  }
  Promise.resolve(handle(message)).catch((error) => {
    if (message?.id !== undefined) sendError(message.id, -32603, error.message)
  })
})

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
