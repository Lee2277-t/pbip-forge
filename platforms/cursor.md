# Cursor

Cursor reads project MCP servers from `.cursor/mcp.json`.

## Configuration

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "powerbi": {
      "command": "node",
      "args": ["<PBIP_FORGE_DIR>\\mcp\\server.mjs"]
    }
  }
}
```

Restart Cursor or reload the window. The Power BI tools appear in Agent mode.

## Use it

> Call powerbi_help, then create a sales report from C:\data\sales.csv in
> C:\work\sales.

## CLI fallback

```bash
node "<PBIP_FORGE_DIR>\\bin\\pbip-forge.mjs" build spec.json --output "C:\\work\\sales"
```

Add [`AGENTS.md`](../AGENTS.md) to the project root for CLI-only workflows.
