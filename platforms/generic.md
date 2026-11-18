# Generic MCP client

PBIP Forge runs a dependency-free MCP stdio server at `mcp/server.mjs`.

## Server

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

- Transport: stdio, newline-delimited JSON-RPC 2.0
- Protocol versions: `2024-11-05`, `2025-03-26`, `2025-06-18`
- Capabilities: `tools`
- Server name: `pbip-forge`

## Tools

### `powerbi_create`

```json
{
  "spec": { "name": "Sales", "model": { "tables": [] }, "pages": [] },
  "outputDir": "C:\\work\\sales",
  "overwrite": true,
  "validate": true
}
```

Either `spec` or `specPath` is required.

### `powerbi_help`

Returns the full spec reference. Optional `topic`.

### `powerbi_validate`

```json
{ "path": "C:\\work\\sales\\Sales.pbip" }
```

### `powerbi_open`

```json
{ "path": "C:\\work\\sales\\Sales.pbip" }
```

## CLI fallback

<a id="cli-fallback"></a>

Any agent with terminal access can use the CLI; MCP is not required.

```bash
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" help
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" build spec.json --output ./pbip-out --overwrite
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" validate "./pbip-out/Sales.pbip"
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" open "./pbip-out/Sales.pbip"
```

The CLI prints human-readable output by default and `--json` for machines.

## Portable skill

Copy `skills/powerbi` into the agent's skills directory, or paste
[`AGENTS.md`](../AGENTS.md) into the project root. Both teach the agent to call
`powerbi_help` / `pbip-forge help` before writing a spec.
