# VS Code / GitHub Copilot

VS Code uses `servers` (not `mcpServers`) in `.vscode/mcp.json`, and each entry
declares `"type": "stdio"`.

## Configuration

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "powerbi": {
      "type": "stdio",
      "command": "node",
      "args": ["<PBIP_FORGE_DIR>\\mcp\\server.mjs"]
    }
  }
}
```

Open the file and use the inline **Start** action, or run
**MCP: List Servers** from the Command Palette.

## Use it

In Copilot Chat Agent mode:

> Use the powerbi server. Call powerbi_help, then build a sales report from
> C:\data\sales.csv into C:\work\sales.

## CLI fallback

```bash
node "<PBIP_FORGE_DIR>\\bin\\pbip-forge.mjs" build spec.json --output "C:\\work\\sales"
```

## Notes

- Copilot may ask to approve the server and tool calls.
- `powerbi_open` launches Power BI Desktop on Windows.
