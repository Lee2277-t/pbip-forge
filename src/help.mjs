export const HELP = `# PBIP Forge — build a Power BI project without UI automation

PBIP Forge writes a complete Power BI Project (PBIP) on disk:

  <Name>.pbip
  <Name>.SemanticModel/   TMDL model (tables, columns, DAX measures, relationships, RLS)
  <Name>.Report/          PBIR report (pages and native visuals)

Generation and validation are fully headless: no Power BI Desktop window is opened.
Opening the result is an explicit, separate action ("powerbi_open" or "--open").

## Minimal spec

{
  "name": "Sales Overview",
  "outputDir": "C:\\\\work\\\\sales",
  "model": {
    "tables": [
      {
        "name": "Sales",
        "columns": [
          { "name": "Date", "type": "date" },
          { "name": "Product", "type": "string" },
          { "name": "Amount", "type": "double", "format": "#,##0" }
        ],
        "rows": [
          ["2024-01-01", "Alpha", 1200],
          ["2024-01-02", "Beta", 1850],
          ["2024-01-03", "Alpha", 990]
        ],
        "measures": [
          { "name": "Total Sales", "expression": "SUM('Sales'[Amount])", "format": "#,##0" }
        ]
      }
    ]
  },
  "pages": [
    {
      "title": "Sales Overview",
      "visuals": [
        { "type": "card", "values": ["Sales[Total Sales]"], "x": 24, "y": 88, "width": 296, "height": 104 },
        { "type": "bar", "title": "Sales by product", "category": "Sales[Product]", "values": ["Sales[Total Sales]"], "x": 336, "y": 88, "width": 600, "height": 300 }
      ]
    }
  ]
}

## Top-level keys

- name (required)             Project and file name.
- outputDir                   Optional. Absolute directory, or a path ending in .pbip.
- overwrite                   Optional boolean. Replace an existing generated project.
- model.tables (required)     Array of table objects.
- model.relationships        Array of relationships.
- model.roles                Array of row-level-security roles.
- report.pages               Array of report pages. "pages" at top level also works.
- report.theme               Theme object, path to a theme JSON, or false.
- theme                      Top-level alias for report.theme.

## Table

{
  "name": "Sales",
  "description": "Fact table",
  "rows": [ ... ],                    // inline data (array of arrays or objects)
  "csv": "C:\\\\data\\\\sales.csv",   // alternatively read a CSV file
  "excel": { "path": "C:\\\\data\\\\sales.xlsx", "sheet": "Sales" },
  "header": true,                     // CSV/Excel header row; inferred by default
  "expression": "let Source = ... in Source", // raw Power Query M instead of rows
  "mode": "import",                   // import | directQuery
  "columns": [ ... ],
  "measures": [ ... ],
  "hierarchies": [ ... ]
}

Data precedence: expression > csv/excel > rows.
Inline rows: array of arrays aligned with columns, or array of objects keyed by column name.
CSV: UTF-8, quoted fields supported. Excel requires Python + openpyxl on PATH, or export to CSV.
The inline limit is 200,000 rows; large models should use a Power Query expression.

## Column

{ "name": "Amount", "type": "double", "format": "#,##0.00", "summarizeBy": "sum", "hidden": false }

Types: string | text, int64 | int, double | number, decimal | currency, date, datetime,
boolean, binary, variant.

Also supported:
- "sourceName": M/source column name when it differs from the model name.
- "expression": DAX expression for a calculated column.
- "sortByColumn": sort this text column by another column.
- "description", "hidden".
- "summarizeBy": none | sum | avg | min | max | count | distinctCount.

Numeric columns default to sum; ID/Key/Code/Number-like columns default to none.

## Measure

{ "name": "Total Sales", "expression": "SUM('Sales'[Amount])", "format": "#,##0", "folder": "KPIs", "description": "..." }

Use single quotes around table names in DAX when the name contains spaces or punctuation:
SUM('Internet Sales'[Amount]). Measure names may contain spaces.

## Relationship

{ "from": "Sales[ProductKey]", "to": "Product[ProductKey]", "active": true }

or { "fromTable": "Sales", "fromColumn": "ProductKey", "toTable": "Product", "toColumn": "ProductKey" }.
Optional: "cardinality": "manyToOne" | "oneToMany" | "oneToOne" | "manyToMany",
"crossFilter": "bothDirections".

## RLS role

{
  "name": "West",
  "tables": { "Sales": "[Region] = \\"West\\"" }
}

## Page

{
  "title": "Overview",            // also drawn as a textbox at the top
  "displayName": "Overview",      // optional tab name
  "width": 1280,
  "height": 720,
  "visuals": [ ... ]
}

Visuals with explicit x/y/width/height keep their position. Others are placed in a
two-column grid (cards four per row). A page with one visual gets a full-page visual.

## Visual

Common shape:

{
  "type": "bar",
  "title": "Sales by product",
  "category": "Sales[Product]",
  "values": ["Sales[Total Sales]"],
  "series": "Sales[Channel]",
  "sort": "desc",
  "legend": false,
  "dataLabels": true,
  "x": 24, "y": 88, "width": 600, "height": 300
}

Supported type aliases and default roles:

- bar / column / line / area   Category, Y (values), Series (optional)
- pie / donut                  Category, Y
- card                         Data (one or more measures)
- table                        Values (raw columns or measures)
- matrix                       Rows, Columns, Values
- slicer                       Values (a column)
- scatter                      X, Y, Series, Size (use xField/yField)
- gauge                        Y, MinValue, MaxValue, TargetValue
- kpi                          Indicator, TrendAxis, Goal
- textbox                      no query; use "text" or "runs"
- shape                        no query

Field references accept:
  "Sales[Product]"  |  "Sales.Product"  |  { "table": "Sales", "column": "Product" }
  "Sales[Total Sales]"  |  { "table": "Sales", "measure": "Total Sales" }
  { "column": "Product" } when the column name is unique across the model.
  { "table": "Sales", "column": "Amount", "aggregation": "sum" }

A column placed in a chart values role is aggregated with sum by default.
For table/matrix values, raw columns are used unless an explicit aggregation is given.

## Custom roles

For a visual type that is not in the alias list, pass "visualType" and "roles":

{
  "visualType": "funnel",
  "roles": {
    "Category": [ "Sales[Stage]" ],
    "Y": [ "Sales[Total Sales]" ]
  }
}

"roles" maps exact PBIR role names to one field or an array of fields.

## Textbox

{ "type": "textbox", "text": "Quarterly review", "fontSize": 24, "bold": true, "color": "#111827" }

For mixed formatting:
{ "type": "textbox", "runs": [ { "text": "Q1 ", "bold": true }, { "text": "results" } ] }

## Theme

Default palette:
{ "dataColors": ["#2563EB", "#0EA5E9", "#14B8A6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#64748B"] }

Pass a full theme object, a path to a theme JSON, or false for the native Power BI theme.

## Validation

Every build validates:
- table, column, measure, and relationship references;
- relationship endpoint types;
- visual fields and roles;
- page bounds and positions.

On Windows, if Power BI Desktop is installed, the generated TMDL is also parsed by the
Power BI Tabular engine before the tool reports success. A failed parse is reported as
an error; an unavailable engine is reported as "skipped".

## Output and next steps

The result contains project/report/model paths, counts, warnings, and validation status.
Open the .pbip in Power BI Desktop. Use File > Save as to create a .pbix, or publish to
a Fabric workspace. The same spec can be rebuilt at any time; generated files are text
and Git-friendly.

## CLI

node bin/pbip-forge.mjs build spec.json --output C:\\\\work\\\\sales --overwrite
node bin/pbip-forge.mjs validate C:\\\\work\\\\sales\\\\Sales.pbip
node bin/pbip-forge.mjs help

## MCP

Run the stdio server:
node mcp/server.mjs

Tools: powerbi_create (headless), powerbi_help, powerbi_validate (headless), powerbi_open (explicit UI).
`
