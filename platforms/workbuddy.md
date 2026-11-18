# WorkBuddy

WorkBuddy (Tencent) supports custom MCP connectors.

## 1. Add a custom connector

1. Open **Connectors** in the left sidebar.
2. Click **Custom Connector**.
3. Choose **stdio / local command**.
4. Fill in:
   - Name: `Power BI`
   - Command: `node`
   - Args: `["<PBIP_FORGE_DIR>\\mcp\\server.mjs"]`

If WorkBuddy asks for JSON, use [`examples/qoder.mcp.json`](examples/qoder.mcp.json)
(the same `mcpServers` shape).

## 2. Enable it

Turn the connector on, start a task, and ask:

> 用 Power BI 连接器，先调用 powerbi_help，然后把这个 CSV 做成两页销售报表，
> 输出到 C:\work\sales。

## 3. Permissions

WorkBuddy runs tasks in a workspace with folder permissions. Make sure:

- the output directory is inside an authorized workspace folder;
- `node` is available to the WorkBuddy process (or use the absolute Node path in
  the command field).

## CLI fallback

WorkBuddy's task agent can run terminal commands:

```bash
node "<PBIP_FORGE_DIR>\\bin\\pbip-forge.mjs" build spec.json --output "C:\\work\\sales" --json
```

Copy [`AGENTS.md`](../AGENTS.md) into the workspace so the agent knows the
workflow.

## Notes

- WorkBuddy is a desktop agent; Power BI Desktop output is Windows-only, which
  matches its main platform.
- If the custom connector UI only accepts a URL, run the MCP server behind a
  local stdio-to-HTTP bridge, or use the CLI fallback.
