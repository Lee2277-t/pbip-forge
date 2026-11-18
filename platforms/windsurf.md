# Windsurf

Windsurf reads MCP servers from its global `mcp_config.json` (typically
`~/.codeium/windsurf/mcp_config.json`).

## Configuration

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

Restart Windsurf, then use Cascade in Agent mode.

## Use it

> Use powerbi_help and then build a sales dashboard from C:\data\sales.csv into
> C:\work\sales.

## CLI fallback

```bash
node "<PBIP_FORGE_DIR>\\bin\\pbip-forge.mjs" build spec.json --output "C:\\work\\sales"
```

Copy [`AGENTS.md`](../AGENTS.md) into the project for terminal-based use.
