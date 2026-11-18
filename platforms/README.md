# Platforms

The same core is exposed three ways. Use whichever your agent supports:

1. **MCP** — Codex, Qoder, Claude Code, Cursor, Windsurf, VS Code/Copilot, WorkBuddy, DSH, any MCP client
2. **CLI** — any agent with terminal access; no MCP support required
3. **Portable skill / `AGENTS.md`** — for agents that only read project instructions

Set `PBIP_FORGE_DIR` to the absolute path of this repository, for example:

```text
C:\tools\pbip-forge
```

Replace `<PBIP_FORGE_DIR>` in the snippets below.

| Client | MCP config | Notes |
|---|---|---|
| Codex CLI | [`codex.md`](codex.md) | `~/.codex/config.toml`, `[mcp_servers.powerbi]` |
| Qoder | [`qoder.md`](qoder.md) | Custom MCP connector; CLI fallback |
| Claude Code | [`claude-code.md`](claude-code.md) | `.mcp.json` or `claude mcp add` |
| Cursor | [`cursor.md`](cursor.md) | `.cursor/mcp.json` |
| Windsurf | [`windsurf.md`](windsurf.md) | `mcp_config.json` |
| VS Code / Copilot | [`vscode.md`](vscode.md) | `.vscode/mcp.json` with `servers` |
| WorkBuddy | [`workbuddy.md`](workbuddy.md) | Connectors → Custom Connector |
| DSH | [`dsh.md`](dsh.md) | Native plugin already installed here |
| Other MCP clients | [`generic.md`](generic.md) | stdio JSON-RPC |
| No MCP | [`generic.md`](generic.md#cli-fallback) | CLI via terminal |

## Which path is best?

- **Agent supports MCP** → use MCP. The model sees `powerbi_create` as a tool.
- **Agent is CLI-only** → give it `AGENTS.md` and use the CLI.
- **Agent supports skills** → copy `skills/powerbi` into its skills directory.
- **You are in DSH** → nothing to configure; the native tools are installed.

## Verify

```bash
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" help
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" build "<PBIP_FORGE_DIR>/examples/sales-dashboard.json" --output ./pbip-out
```

If that works, the MCP server will work too: `node "<PBIP_FORGE_DIR>/mcp/server.mjs"`.
