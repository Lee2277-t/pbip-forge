# Changelog

## 1.0.1 — 2026-11-18

- Headless by default: `powerbi_create` and `powerbi_validate` never launch
  Power BI Desktop and never open a window.
- Removed the `open` parameter from the DSH and MCP `powerbi_create` schemas.
- Added `--headless` / `PBIP_FORGE_HEADLESS=1`; it also blocks the explicit
  `powerbi_open` path.
- `powerbi_open` is now documented as the only visible-UI action.

## 1.0.0 — 2026-11-18

- Initial release.
- PBIP generator: TMDL semantic model + PBIR report pages/visuals.
- Tables from inline rows, CSV, Excel (openpyxl), or raw Power Query M.
- Columns, calculated columns, measures, hierarchies, relationships, RLS roles.
- Visuals: bar, column, line, area, pie, donut, card, table, matrix, slicer,
  scatter, gauge, kpi, textbox, shape; raw `visualType` + `roles` escape hatch.
- Theme support, auto layout, page titles, field validation.
- TMDL validation through the Power BI Tabular engine on Windows.
- Interfaces: native DSH plugin, MCP stdio server, CLI, installable launcher.
- Platform guides for Codex, Qoder, Claude Code, Cursor, Windsurf, VS Code,
  WorkBuddy, DSH, and generic MCP clients.
