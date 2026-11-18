# Qoder

Qoder supports MCP connectors in the IDE, JetBrains plugin, and CLI. The exact
settings page depends on the Qoder version; the server definition is always the
same stdio command.

## 1. Add a custom MCP server

Open **Settings → MCP → Add / Custom MCP**, choose **stdio**, and enter:

- Name: `powerbi`
- Command: `node`
- Args: `["<PBIP_FORGE_DIR>\\mcp\\server.mjs"]`

If Qoder asks for a JSON block, use [`examples/qoder.mcp.json`](examples/qoder.mcp.json):

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

Some Qoder builds read a project-level `.qoder/mcp.json` with the same
`mcpServers` shape. If yours does, save the block there.

## 2. Use it

In Qoder Agent mode:

> Call powerbi_help, then build a two-page sales report from
> C:\data\sales.csv into C:\work\sales.

## CLI fallback

Qoder's terminal can always run:

```bash
node "<PBIP_FORGE_DIR>\bin\pbip-forge.mjs" build spec.json --output "C:\work\sales" --json
```

Add [`AGENTS.md`](../AGENTS.md) to the project root so Qoder knows the spec
workflow even without MCP.

## Notes

- Use an absolute output directory; Qoder's working directory may not be the
  project folder.
- If Qoder sandboxes terminal commands, allow the output directory.
