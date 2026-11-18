/**
 * Self-test for PBIP Forge. No framework, no network, no Power BI window.
 *
 *   node test/self-test.mjs
 *
 * Builds projects in a temp folder, validates them the way the tools do, and
 * removes everything afterwards. When Power BI Desktop is installed the TMDL
 * parser runs too; elsewhere that check reports "skipped" and the test still
 * passes.
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { buildProject } from '../src/forge.mjs'
import { validateProject } from '../src/inspect.mjs'

const results = []

async function check(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: error?.message ?? String(error) })
  }
}

const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbip-forge-test-'))

const spec = {
  name: 'Self Test',
  model: {
    tables: [
      {
        name: 'Product',
        columns: [
          { name: 'ProductKey', type: 'int64', summarizeBy: 'none', hidden: true },
          { name: 'Product', type: 'string' },
          { name: 'Category', type: 'string' },
        ],
        rows: [
          [1, 'Trail Bike', 'Bikes'],
          [2, 'Road Bike', 'Bikes'],
          [3, 'Helmet', 'Accessories'],
        ],
      },
      {
        name: 'Sales',
        columns: [
          { name: 'Date', type: 'date' },
          { name: 'ProductKey', type: 'int64', summarizeBy: 'none' },
          { name: 'Region', type: 'string' },
          { name: 'Amount', type: 'double', format: '$ #,##0' },
        ],
        rows: [
          ['2024-01-05', 1, 'North', 2400],
          ['2024-02-02', 2, 'South', 1800],
          ['2024-03-08', 3, 'West', 320],
        ],
        measures: [
          { name: 'Total Sales', expression: "SUM('Sales'[Amount])", format: '$ #,##0', folder: 'KPIs' },
          { name: 'Average Sale', expression: 'DIVIDE([Total Sales], COUNTROWS(\'Sales\'))', format: '$ #,##0.00' },
        ],
      },
    ],
    relationships: [{ from: 'Sales[ProductKey]', to: 'Product[ProductKey]', cardinality: 'manyToOne' }],
    roles: [{ name: 'Region North', tables: { Sales: '[Region] = "North"' } }],
  },
  pages: [
    {
      title: 'Overview',
      visuals: [
        { type: 'card', values: ['Sales[Total Sales]'], title: 'Revenue' },
        { type: 'bar', category: 'Product[Category]', values: ['Sales[Total Sales]'], title: 'By category' },
      ],
    },
    {
      title: 'Detail',
      visuals: [{ type: 'table', values: ['Sales[Date]', 'Product[Product]', 'Sales[Amount]'], title: 'Rows' }],
    },
  ],
}

let built

try {
  await check('builds a complete project', async () => {
    built = await buildProject({ spec }, { outputDir: workDir })
    assert.equal(built.ok, true)
    assert.equal(built.summary.tables, 2)
    assert.equal(built.summary.measures, 2)
    assert.equal(built.summary.relationships, 1)
    assert.equal(built.summary.pages, 2)
    // 3 declared visuals + one title textbox per page
    assert.equal(built.summary.visuals, 5)
    assert.notEqual(built.validation.tmdl.status, 'failed', built.validation.tmdl.error)
  })

  await check('writes the PBIP / TMDL / PBIR file tree', async () => {
    const pbip = JSON.parse(await fs.readFile(built.project, 'utf8'))
    assert.equal(pbip.version, '1.0')
    assert.ok(pbip.artifacts[0].report.path.endsWith('.Report'))
    for (const file of [
      'definition.pbir',
      path.join('definition', 'report.json'),
      path.join('definition', 'pages', 'pages.json'),
    ]) {
      await fs.access(path.join(built.reportDir, file))
    }
    for (const file of ['definition.pbism', path.join('definition', 'database.tmdl'), path.join('definition', 'model.tmdl')]) {
      await fs.access(path.join(built.modelDir, file))
    }
    const tmdl = await fs.readFile(path.join(built.modelDir, 'definition', 'tables', 'Sales.tmdl'), 'utf8')
    assert.ok(tmdl.includes('measure'), 'measures are missing from the TMDL table')
    const roles = await fs.readFile(path.join(built.modelDir, 'definition', 'roles', 'Region North.tmdl'), 'utf8').catch(() => '')
    assert.ok(roles.includes('Region North'), 'RLS role was not written')
  })

  await check('validates the generated project back', async () => {
    const result = await validateProject(built.project)
    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal(result.pages, 2)
    assert.equal(result.visuals, 5)
  })

  await check('refuses to overwrite without overwrite: true', async () => {
    await assert.rejects(() => buildProject({ spec }, { outputDir: workDir }), /already exists/)
  })

  await check('overwrite: true replaces the project', async () => {
    const again = await buildProject({ spec: { ...spec, overwrite: true } }, { outputDir: workDir })
    assert.equal(again.ok, true)
  })

  await check('rejects a visual field that does not exist', async () => {
    await assert.rejects(
      () => buildProject(
        { spec: { ...spec, name: 'Bad Field', pages: [{ title: 'P', visuals: [{ type: 'card', values: ['Sales[Nope]'] }] }] } },
        { outputDir: path.join(workDir, 'bad-field') },
      ),
      /Nope/,
    )
  })

  await check('rejects a relationship to a missing column', async () => {
    await assert.rejects(
      () => buildProject(
        {
          spec: {
            ...spec,
            name: 'Bad Relationship',
            model: { ...spec.model, relationships: [{ from: 'Sales[Nope]', to: 'Product[ProductKey]' }] },
          },
        },
        { outputDir: path.join(workDir, 'bad-rel') },
      ),
      /Nope/,
    )
  })

  await check('handles names with spaces and quotes', async () => {
    const odd = {
      name: "Manager's Report",
      model: {
        tables: [
          {
            name: 'Sales Fact',
            columns: [{ name: 'Amount', type: 'double' }, { name: 'Order Date', type: 'date' }],
            rows: [['2024-01-01T00:00:00', 10], ['2024-01-02T00:00:00', 20]],
            measures: [{ name: "Total Amount's", expression: "SUM('Sales Fact'[Amount])" }],
          },
        ],
      },
      pages: [{ title: 'Summary', visuals: [{ type: 'card', values: ["Sales Fact[Total Amount's]"] }] }],
    }
    const result = await buildProject({ spec: odd }, { outputDir: path.join(workDir, 'odd') })
    assert.equal(result.ok, true)
    const model = await fs.readFile(path.join(result.modelDir, 'definition', 'model.tmdl'), 'utf8')
    assert.ok(model.includes("'Sales Fact'"), 'quoted table name missing from model.tmdl')
  })
} finally {
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
}

const failed = results.filter((result) => !result.ok)
for (const result of results) {
  console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.ok ? '' : `\n      ${result.error}`}`)
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
