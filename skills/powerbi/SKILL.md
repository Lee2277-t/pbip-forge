---
name: powerbi
description: Create complete Power BI projects (.pbip) directly — TMDL semantic model, DAX measures, relationships, RLS, PBIR pages and native visuals — without Power BI Desktop UI automation. Use for any request to build, generate, or modify a Power BI report/dashboard/model.
---

# Power BI authoring

Use PBIP Forge. Do **not** automate the Power BI Desktop UI. Generation and
validation are fully headless and never open a Power BI window.

## Entry point

- Tool available: `powerbi_create` (call `powerbi_help` first).
- CLI: `node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" build <spec.json> --output <dir> --json`.
- MCP: `powerbi_create` from `node "<PBIP_FORGE_DIR>/mcp/server.mjs"`.

## Process

1. Read `powerbi_help` (or `docs/SPEC.md`) before the first build.
2. Inspect the data source: CSV path, Excel path/sheet, or a raw Power Query M
   expression. Confirm the output directory.
3. Write a spec JSON:
   - `name` — project/report name.
   - `model.tables` — columns, rows/csv/excel/expression, measures,
     relationships.
   - `report.pages` — page title and visuals.
4. Build. On failure, read the exact missing field/table/column and fix it.
5. Report the `.pbip` path. Open in Power BI Desktop to review; `File > Save as`
   creates `.pbix`; publish for Fabric.

## Spec essentials

```json
{
  "name": "Sales Overview",
  "model": {
    "tables": [
      {
        "name": "Sales",
        "csv": "C:\\data\\sales.csv",
        "measures": [
          { "name": "Total Sales", "expression": "SUM('Sales'[Amount])", "format": "$ #,##0" }
        ]
      }
    ]
  },
  "pages": [
    {
      "title": "Overview",
      "visuals": [
        { "type": "card", "values": ["Sales[Total Sales]"], "title": "Revenue" },
        { "type": "bar", "category": "Sales[Product]", "values": ["Sales[Total Sales]"] }
      ]
    }
  ]
}
```

## Visual types

`bar`, `column`, `line`, `area`, `pie`, `donut`, `card`, `table`, `matrix`,
`slicer`, `scatter` (use `xField`/`yField`), `gauge`, `kpi`, `textbox`.

Any PBIR visual: pass `visualType` plus exact `roles`:

```json
{ "visualType": "funnel", "roles": { "Category": ["Sales[Stage]"], "Y": ["Sales[Total Sales]"] } }
```

## Field syntax

- `"Sales[Product]"` — column
- `"Sales[Total Sales]"` — measure
- `{ "table": "Sales", "measure": "Total Sales" }`
- `{ "table": "Sales", "column": "Amount", "aggregation": "sum" }`

## Rules

- **Never launch Power BI during build or validation.** `powerbi_create` and
  `powerbi_validate` are file-level/headless. Only call `powerbi_open` when the
  user explicitly asks to view the report.
- Absolute paths for output and data files.
- Every visual field must exist; the build fails with the exact name.
- Multi-table models need relationships (`"from": "Sales[ProductKey]", "to": "Product[ProductKey]"`).
- Inline rows < 20k; larger data → `expression` or CSV.
- Never write a `.pbix` by hand; use Desktop Save As.

See `docs/SPEC.md` for the full reference.
