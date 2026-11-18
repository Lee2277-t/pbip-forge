# Codex CLI

Codex supports stdio MCP servers in `~/.codex/config.toml`.

## 1. Add the server

```toml
[mcp_servers.powerbi]
command = "node"
args = ["<PBIP_FORGE_DIR>\\mcp\\server.mjs"]
startup_timeout_sec = 30
```

If `node` is not on `PATH`, use the absolute Node executable:

```toml
command = "C:\\Program Files\\nodejs\\node.exe"
```

On macOS/Linux:

```toml
[mcp_servers.powerbi]
command = "node"
args = ["/absolute/path/to/pbip-forge/mcp/server.mjs"]
```

## 2. Restart Codex

Start a new Codex session, then ask:

> Use the powerbi MCP server. Call powerbi_help, then create a sales report
> from this CSV at C:\data\sales.csv. Output to C:\work\sales.

Codex will call `powerbi_create`, `powerbi_validate`, etc.

## 3. Project instructions

Copy [`AGENTS.md`](../AGENTS.md) to the project root (or add it to an existing
`AGENTS.md`). Codex reads it automatically and will know the CLI fallback and
the spec workflow.

## CLI fallback

If MCP is unavailable:

```bash
node "<PBIP_FORGE_DIR>\bin\pbip-forge.mjs" build spec.json --output "<OUT_DIR>"
node "<PBIP_FORGE_DIR>\bin\pbip-forge.mjs" validate "<OUT_DIR>\<Name>.pbip"
```

## Notes

- Codex may run in a sandbox. Allow the output directory and the Power BI
  Desktop install path if TMDL validation or `--open` is needed.
- No API keys or environment variables are required.
