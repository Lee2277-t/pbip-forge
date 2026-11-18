# Claude Code

Claude Code supports project-scoped MCP servers in `.mcp.json`.

## 1. Add the server

Create `.mcp.json` in the project root:

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

Or from the terminal:

```bash
claude mcp add --transport stdio powerbi -- node "<PBIP_FORGE_DIR>/mcp/server.mjs"
```

Use `--scope user` to make it available in every project.

## 2. Add the skill (optional but recommended)

```bash
mkdir -p ~/.claude/skills
cp -r "<PBIP_FORGE_DIR>/skills/powerbi" ~/.claude/skills/
```

Claude Code will load `skills/powerbi/SKILL.md` and know when to use the tools.

## 3. Use it

> Use the powerbi tools. Read powerbi_help, then create a sales dashboard from
> C:\data\sales.csv. Save the project to C:\work\sales.

## CLI fallback

```bash
node "<PBIP_FORGE_DIR>/bin/pbip-forge.mjs" build spec.json --output ./pbip-out
```

## Notes

- Claude Code may ask permission for the MCP server and for writing files; allow
  the output directory.
- `powerbi_open` launches Power BI Desktop on Windows.
