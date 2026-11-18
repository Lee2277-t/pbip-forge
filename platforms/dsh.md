# DSH (DeepSeek Harness)

PBIP Forge is a DSH bundle **and** an MCP server. In this profile it is already
installed as a native plugin, so no MCP configuration is needed.

## Native tools

| Tool | Purpose |
|---|---|
| `powerbi_create` | Build a `.pbip` from a spec object or spec file |
| `powerbi_help` | Full spec reference |
| `powerbi_validate` | Validate an existing `.pbip` |
| `powerbi_open` | Open in Power BI Desktop (Windows) |

Ask the agent:

> 用 powerbi_create 做一个销售分析报表，数据用 C:\data\sales.csv，
> 输出到 C:\work\sales，包含 3 张卡片、品类柱状图、月度趋势折线图。

## Reinstall / install on another DSH profile

The package is a bundle: `package.json` declares `dsh.bundle.patch` and
`index.js` registers the tools.

```bash
# from a DSH session with the plugin_manager tool:
# install_bundle target = <PBIP_FORGE_DIR>
```

Or use MCP instead:

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

## Notes

- The native plugin has no npm dependencies beyond DSH itself.
- `powerbi_open` and TMDL validation require Power BI Desktop on Windows; other
  platforms still generate and validate the report JSON.
