# Power BI authoring for agents

This project creates Power BI projects (`.pbip`) directly. **Do not drive the
Power BI Desktop UI** (no computer-use, no clicking through the ribbon, no
canvas automation). Describe the model and report in JSON; the generator writes
TMDL and PBIR files.

## Choose an entry point

1. If a `powerbi_create` tool exists, use it.
2. Otherwise call the CLI:

```bash
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" build spec.json --output "<OUT_DIR>" --json
```

3. Otherwise use the MCP server `node "<PBIP_FORGE_DIR>/mcp/server.mjs"`.

Always read the spec reference first:

- Tool: `powerbi_help`
- CLI: `node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" help`
- File: `docs/SPEC.md`

## Workflow

1. Inspect the user's data (CSV/Excel/M query) and confirm the output directory.
2. Write a JSON spec with `name`, `model.tables`, and `report.pages`.
3. Call `powerbi_create` / `pbip-forge build`.
4. If validation fails, fix the reported names/paths and rebuild.
5. Report the `.pbip` path. Tell the user to open it in Power BI Desktop and
   use `File > Save as` for `.pbix`, or publish to Fabric.

## Minimal spec

```json
{
  "name": "Sales Overview",
  "outputDir": "C:\\work\\sales",
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
        { "type": "bar", "category": "Sales[Product]", "values": ["Sales[Total Sales]"], "title": "By product" }
      ]
    }
  ]
}
```

## Rules

- **Do not launch Power BI Desktop during generation or validation.** `powerbi_create` and `powerbi_validate` never open a window. Only call `powerbi_open` when the user explicitly asks to view the report.
- **Absolute paths** for `outputDir`, `csv`, `excel`, and `specPath`.
- **Only reference fields that exist** in the model. Use `Table[Column]` or
  `Table[Measure]`. Measures win when a name matches both.
- **Define a measure** for anything used in a chart values role; raw numeric
  columns are summed automatically but an explicit measure is clearer.
- Use `type` on columns when the source is raw M (no rows to infer from).
- Use `relationships` for multi-table models. Endpoint types must match.
- Keep inline rows small (< 20k). For large data use `expression` (Power SQL/M)
  or `csv`.
- The generated `.pbip` is the deliverable. Do not create a `.pbix` by zipping
  files; use Power BI Desktop `Save as` if the user needs `.pbix`.

## Validation

The build validates fields, relationships, visual roles, and page bounds. On
Windows with Power BI Desktop installed, the generated TMDL is also parsed by
the Power BI engine. A failed validation returns `ok: false` with details.
