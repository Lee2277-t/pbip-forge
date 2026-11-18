import { buildProject } from './src/forge.mjs'
import { HELP } from './src/help.mjs'
import { validateProject } from './src/inspect.mjs'
import { openInPowerBi } from './src/desktop.mjs'

export const name = 'pbip-forge'
export const inject = ['tools']

function json(value) {
  return JSON.stringify(value, null, 2)
}

function defaultOutputDir(ctx, exec) {
  try {
    const session = exec?.agent?.session
    const workingDirectory = ctx.get('workingDirectory')
    if (session && workingDirectory?.get) return workingDirectory.get(session)
  } catch {
    // fall through
  }
  return exec?.agent?.cwd ?? process.cwd()
}

const CREATE_PARAMETERS = {
  type: 'object',
  properties: {
    spec: {
      type: 'object',
      additionalProperties: true,
      description: 'Project spec object. Either spec or specPath is required. Call powerbi_help for the shape.',
    },
    specPath: {
      type: 'string',
      description: 'Absolute path to a JSON spec file. Either spec or specPath is required.',
    },
    outputDir: {
      type: 'string',
      description: 'Output directory (absolute recommended), or a path ending in .pbip. Defaults to the session working directory.',
    },
    overwrite: {
      type: 'boolean',
      description: 'Replace an existing generated project with the same name.',
    },
    open: {
      type: 'boolean',
      description: 'Open the generated .pbip in Power BI Desktop after building (Windows).',
    },
    validate: {
      type: 'boolean',
      description: 'Parse the generated TMDL with the Power BI engine when Desktop is installed. Default true.',
    },
  },
  additionalProperties: false,
}

const PATH_PARAMETERS = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'Absolute path to the .pbip file.' },
  },
  required: ['path'],
  additionalProperties: false,
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'powerbi_create',
    description:
      'Create a complete Power BI project (.pbip) directly on disk — TMDL semantic model, ' +
      'DAX measures, relationships, RLS roles, PBIR pages and native visuals — without any ' +
      'Power BI Desktop UI automation. Pass a project spec object, or a path to a JSON spec. ' +
      'Call powerbi_help first for the full spec reference. Returns the project/report/model ' +
      'paths, counts, warnings and validation status. Open the .pbip in Power BI Desktop, then ' +
      'Save As .pbix or publish to Fabric.',
    parameters: CREATE_PARAMETERS,
    timeoutMs: 300_000,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!args.spec && !args.specPath) {
        return json({ ok: false, error: 'Provide either "spec" or "specPath". Call powerbi_help for the spec reference.' })
      }
      try {
        const result = await buildProject(
          { spec: args.spec, specPath: args.specPath },
          {
            outputDir: args.outputDir ?? defaultOutputDir(ctx, exec),
            overwrite: args.overwrite === true,
            open: args.open === true,
            validate: args.validate !== false,
          },
        )
        return json(result)
      } catch (error) {
        return json({
          ok: false,
          error: error.message,
          details: error.details ?? [],
          hint: 'Call powerbi_help for the spec reference, or fix the reported field/table/column names.',
        })
      }
    },
  })

  ctx.tools.register({
    name: 'powerbi_help',
    description:
      'Return the PBIP Forge spec reference: project/table/column/measure/relationship/role/page/visual ' +
      'shapes, field syntax, supported visual types and roles, data sources, themes, CLI and MCP usage. ' +
      'Call this before the first powerbi_create when the spec shape is unclear.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Optional topic: spec, visuals, data, model, theme, cli, mcp.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return HELP
    },
  })

  ctx.tools.register({
    name: 'powerbi_validate',
    description:
      'Validate an existing .pbip project: report structure, page/visual files, and TMDL parsing ' +
      'when Power BI Desktop is installed. Use after manual edits or to diagnose a project that ' +
      'does not open correctly.',
    parameters: PATH_PARAMETERS,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      try {
        return json(await validateProject(args.path))
      } catch (error) {
        return json({ ok: false, error: error.message })
      }
    },
  })

  ctx.tools.register({
    name: 'powerbi_open',
    description: 'Open an existing .pbip file in Power BI Desktop. Windows only.',
    parameters: PATH_PARAMETERS,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return json(await openInPowerBi(args.path))
    },
  })
}
