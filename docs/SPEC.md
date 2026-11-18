# PBIP Forge spec reference

The input is a single JSON object. It is intentionally close to the Power BI
object model, but omits PBIR plumbing (IDs, schema URLs, resource packages,
`definition.pbir`, TMDL formatting) so an agent can describe the result instead
of the file format.

```json
{
  "name": "Sales Overview",
  "outputDir": "C:\\work\\sales",
  "overwrite": true,
  "model": { "tables": [], "relationships": [], "roles": [] },
  "report": { "theme": {}, "pages": [] }
}
```

`outputDir` and `overwrite` can also be passed as tool/CLI arguments.

---

## Model

```json
"model": {
  "tables": [ ... ],
  "relationships": [ ... ],
  "roles": [ ... ]
}
```

At least one table is required.

### Table

```json
{
  "name": "Sales",
  "description": "Fact table",
  "hidden": false,
  "rows": [ ["2024-01-01", "Alpha", 1200] ],
  "csv": "C:\\data\\sales.csv",
  "excel": { "path": "C:\\data\\sales.xlsx", "sheet": "Sales" },
  "header": true,
  "expression": "let Source = ... in Source",
  "mode": "import",
  "columns": [ ... ],
  "measures": [ ... ],
  "hierarchies": [ ... ]
}
```

Data precedence: `expression` > `csv`/`excel` > `rows`.

- `rows`: array of arrays aligned with `columns`, or array of objects keyed by
  column name. Inline rows are written to an M `#table(...)` so the model is
  self-contained.
- `csv`: UTF-8 file. The first row is the header unless `header: false`.
- `excel`: `.xlsx` / `.xlsm`, requires Python + openpyxl on `PATH` (or
  `PBIP_FORGE_PYTHON`). `sheet` defaults to the active sheet.
- `expression`: raw Power Query M. Provide `columns` with types; no rows are
  read at generation time.
- `mode`: `import` (default) or `directQuery`.

Inline limit: 200,000 rows. Above 20,000 rows a warning is returned.

### Column

```json
{
  "name": "Amount",
  "type": "double",
  "format": "$ #,##0.00",
  "summarizeBy": "sum",
  "hidden": false,
  "description": "Net amount",
  "sourceName": "Amount",
  "sortByColumn": "Amount Order",
  "expression": "Sales[Quantity] * Sales[Unit Price]"
}
```

Types:

| Input aliases | TMDL type | M type |
|---|---|---|
| `string`, `text` | string | text |
| `int`, `integer`, `int64`, `long` | int64 | Int64.Type |
| `double`, `number`, `float` | double | number |
| `decimal`, `currency`, `money` | decimal | number |
| `date`, `datetime`, `timestamp` | dateTime | date / datetime |
| `bool`, `boolean` | boolean | logical |
| `binary`, `variant` | binary / variant | binary / any |

`format` is the Power BI format string (`#,##0`, `$ #,##0`, `0.0%`,
`yyyy-mm-dd`, ...).

`summarizeBy`: `none`, `sum`, `avg`, `min`, `max`, `count`, `distinctCount`.
Numeric columns default to `sum`; ID/Key/Code/Number-like names default to
`none`.

`expression` makes the column a calculated column. `sourceName` is the source
(or M) column name when it differs from the model name.

### Measure

```json
{
  "name": "Total Sales",
  "expression": "SUM('Sales'[Amount])",
  "format": "$ #,##0",
  "folder": "KPIs",
  "description": "Total revenue",
  "hidden": false
}
```

DAX uses normal Power BI quoting: `SUM('Sales'[Amount])`, `'Internet Sales'`.
Measure names may contain spaces; reference them in visuals as
`"Sales[Total Sales]"` or `{ "table": "Sales", "measure": "Total Sales" }`.

### Hierarchy

```json
{
  "name": "Product Hierarchy",
  "levels": ["Category", "Subcategory", "Product"]
}
```

Levels may also be objects: `{ "name": "Category", "column": "Category" }`.
The referenced columns must exist in the same table.

### Relationship

```json
{ "from": "Sales[ProductKey]", "to": "Product[ProductKey]" }
```

or:

```json
{
  "fromTable": "Sales",
  "fromColumn": "ProductKey",
  "toTable": "Product",
  "toColumn": "ProductKey",
  "cardinality": "manyToOne",
  "active": true,
  "crossFilter": "oneDirection"
}
```

- `cardinality`: `manyToOne` (default), `oneToMany`, `oneToOne`, `manyToMany`
- `active`: default true
- `crossFilter`: `oneDirection` (default) or `bothDirections`

Endpoints must exist and have compatible types (numeric types are compatible
with each other; other types must match).

### RLS role

```json
{
  "name": "West",
  "modelPermission": "read",
  "tables": {
    "Sales": "[Region] = \"West\""
  }
}
```

or:

```json
{
  "name": "West",
  "permissions": [
    { "table": "Sales", "filter": "[Region] = \"West\"" }
  ]
}
```

---

## Report

```json
"report": {
  "theme": { ... },
  "pages": [ ... ]
}
```

`pages` may also be placed at the top level.

### Page

```json
{
  "title": "Overview",
  "displayName": "Overview",
  "width": 1280,
  "height": 720,
  "visuals": [ ... ]
}
```

`title` is drawn as a textbox at the top of the page. Set
`"hideTitleVisual": true` to disable that textbox. `displayName` is the tab
label.

Visuals without `x`/`y` are placed in a two-column grid (cards four per row).
A page with a single visual gets a full-page visual.

### Visual

Common shape:

```json
{
  "type": "bar",
  "title": "Sales by product",
  "category": "Sales[Product]",
  "values": ["Sales[Total Sales]"],
  "series": "Sales[Channel]",
  "sort": "desc",
  "legend": false,
  "dataLabels": true,
  "x": 24,
  "y": 88,
  "width": 600,
  "height": 300
}
```

Supported types:

| Type | PBIR visualType | Default roles |
|---|---|---|
| `bar` | barChart | Category ← `category`; Y ← `values`; Series ← `series` |
| `column` | columnChart | same |
| `line` | lineChart | same |
| `area` | areaChart | same |
| `pie` | pieChart | Category ← `category`; Y ← `values` |
| `donut` | donutChart | same |
| `card` | cardVisual | Data ← `values` |
| `table` | tableEx | Values ← `values` |
| `matrix` | pivotTable | Rows ← `rows`; Columns ← `columns`; Values ← `values` |
| `slicer` | slicer | Values ← `field`/`values` |
| `scatter` | scatterChart | X ← `xField`; Y ← `yField`; Series ← `series`; Size ← `size` |
| `gauge` | gauge | Y ← `values`; MinValue ← `min`; MaxValue ← `max`; TargetValue ← `target` |
| `kpi` | kpi | Indicator ← `values`; TrendAxis ← `trend`; Goal ← `goal` |
| `textbox` | textbox | no query; `text` or `runs` |
| `shape` | shape | no query |

Any other PBIR visual type can be used explicitly:

```json
{
  "visualType": "funnel",
  "roles": {
    "Category": ["Sales[Stage]"],
    "Y": ["Sales[Total Sales]"]
  }
}
```

`roles` maps exact PBIR role names to a field or array of fields and overrides
the alias mapping.

Formatting currently supported: `title`, `showTitle`, `legend`, `dataLabels`,
`slicerMode`, `sort`, `z`, `tabOrder`, explicit `x`/`y`/`width`/`height`.

`sort`: `"asc"`, `"desc"`, or `{ "field": "Sales[Total Sales]", "direction": "desc" }`.

### Textbox

```json
{ "type": "textbox", "text": "Quarterly review", "fontSize": 24, "bold": true, "color": "#111827" }
```

Mixed formatting:

```json
{
  "type": "textbox",
  "runs": [
    { "text": "Q1 ", "bold": true },
    { "text": "results", "color": "#2563EB" }
  ]
}
```

### Field references

All of these are accepted:

```text
"Sales[Product]"
"Sales.Product"
{ "table": "Sales", "column": "Product" }
{ "table": "Sales", "measure": "Total Sales" }
{ "measure": "Total Sales" }          // must be unique across the model
{ "column": "Product" }               // must be unique across the model
{ "table": "Sales", "column": "Amount", "aggregation": "sum" }
```

A column placed in a chart values role (Y/Data/X) is aggregated with `sum` by
default. Table/matrix values use the raw column unless an explicit
`aggregation` is supplied. Supported aggregations: `sum`, `avg`, `min`, `max`,
`count`.

### Theme

```json
"theme": {
  "name": "Corporate",
  "dataColors": ["#2563EB", "#0EA5E9", "#14B8A6", "#F59E0B"],
  "background": "#FFFFFF",
  "foreground": "#1F2937",
  "tableAccent": "#2563EB"
}
```

`theme` can also be a path to a Power BI theme JSON. `theme: false` uses the
native Power BI theme. The default palette is applied when `theme` is omitted.

---

## Result

```json
{
  "ok": true,
  "project": "C:\\work\\sales\\Sales Overview.pbip",
  "projectDir": "C:\\work\\sales",
  "reportDir": "C:\\work\\sales\\Sales Overview.Report",
  "modelDir": "C:\\work\\sales\\Sales Overview.SemanticModel",
  "summary": {
    "tables": 2,
    "columns": 8,
    "measures": 3,
    "relationships": 1,
    "roles": 0,
    "pages": 2,
    "visuals": 9
  },
  "validation": {
    "tmdl": { "status": "passed", "tables": 2, "relationships": 1 }
  },
  "warnings": [],
  "next": [ ... ]
}
```

`validation.tmdl.status` is `passed`, `failed`, or `skipped`. A failed parse
returns `ok: false` while leaving the generated files on disk for inspection.

---

## CLI

```bash
node bin/pbip-forge.mjs build spec.json --output C:\work\sales --overwrite --open
node bin/pbip-forge.mjs validate C:\work\sales\Sales.pbip
node bin/pbip-forge.mjs open C:\work\sales\Sales.pbip
node bin/pbip-forge.mjs config codex
node bin/pbip-forge.mjs install --target C:\tools\pbip-forge
```

## MCP

```bash
node mcp/server.mjs
```

Tools: `powerbi_create`, `powerbi_help`, `powerbi_validate`, `powerbi_open`.
The server uses newline-delimited JSON-RPC over stdio and has no runtime
dependencies.
