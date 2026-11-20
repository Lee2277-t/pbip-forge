# PBIP Forge

**直接生成完整的 Power BI 项目（`.pbip`），不再用 computer-use 一页页点 Power BI Desktop。**

生成内容同时包含：

- **语义模型**：TMDL 表、列、DAX 度量值、计算列、关系、层级、RLS 角色
- **报表**：PBIR 页面、文本框、卡片、柱状图/条形图、折线图、面积图、饼图/环形图、表格、矩阵、切片器、散点图、仪表、KPI
- **可验证**：TMDL 用 Power BI 引擎解析；PBIR 用微软官方 JSON Schema 校验
- **跨平台入口**：MCP、CLI、DSH 原生插件

生成后直接用 Power BI Desktop 打开 `.pbip` 即可；需要单文件时在 Desktop 里 `File > Save as` 保存为 `.pbix`，或直接发布到 Fabric。

> 非微软官方项目。PBIP/TMDL/PBIR 均为微软公开格式。

---

## 已验证

- 生成 2 页、9 个视觉对象的示例报表
- TMDL 通过 Power BI Tabular 引擎解析（2 张表、1 条关系）
- PBIR 的 `report.json`、`pages.json`、`page.json`、每个 `visual.json` 均通过微软官方 Schema
- 在 Power BI Desktop 2.159 中实际打开，卡片显示 `$23K` / `54` / `$1.52K`，柱状图与折线图正常出数
- CSV、Excel（openpyxl）、原生 Power Query M、RLS、含空格/中文的表名和列名均已测试

---

## 无窗口（headless）

生成和校验**全程不启动 Power BI Desktop，不弹任何窗口**：

- `powerbi_create` 只写 TMDL/PBIR 文件并做文件级校验
- `powerbi_validate` 只读取文件做结构/TMDL 校验
- `--headless` 是默认行为；即使传了 `--open` 也会被 `--headless` 覆盖

只有显式调用 `powerbi_open`（或 CLI `pbip-forge open`）才会打开可见的 Power BI 窗口。

---

## 快速开始

### 方式一：DSH 原生插件

```bash
dsh plugin --profile web add /path/to/pbip-forge
# 或者：dsh plugin add /path/to/pbip-forge
```

Desktop 应用管自己的 profile，那边用应用内 **Settings → Plugins** 装。
装好后直接对 Agent 说：

> 用 powerbi_create 做一个销售分析报表，数据用这个 CSV，包含……
> 输出到 `C:\work\sales`

Agent 会调用 4 个原生工具：

- `powerbi_create` — 生成项目（不打开窗口）
- `powerbi_help` — 返回完整 spec 参考
- `powerbi_validate` — 校验已有 `.pbip`（不打开窗口）
- `powerbi_open` — 仅在你明确要求时，用 Power BI Desktop 打开（会弹窗）

### 方式二：CLI（所有能跑终端的平台）

```bash
node bin/pbip-forge.mjs build examples/sales-dashboard.json \
  --output "C:\work\sales" --overwrite
```

需要查看时，再单独执行：

```bash
node bin/pbip-forge.mjs open "C:\work\sales\Sales Performance.pbip"
```

常用命令：

```bash
node bin/pbip-forge.mjs help
node bin/pbip-forge.mjs validate "C:\work\sales\Sales Performance.pbip"
node bin/pbip-forge.mjs config codex
node bin/pbip-forge.mjs install --target "C:\tools\pbip-forge"
```

### 方式三：MCP（Codex / Qoder / Claude Code / Cursor / Windsurf / VS Code / WorkBuddy / DSH）

```bash
node mcp/server.mjs
```

MCP 工具：`powerbi_create`、`powerbi_help`、`powerbi_validate`、`powerbi_open`。

各平台配置见 [`platforms/`](platforms/)：

| 平台 | 配置 |
|---|---|
| Codex CLI | [`platforms/codex.md`](platforms/codex.md) |
| Qoder | [`platforms/qoder.md`](platforms/qoder.md) |
| Claude Code | [`platforms/claude-code.md`](platforms/claude-code.md) |
| Cursor | [`platforms/cursor.md`](platforms/cursor.md) |
| Windsurf | [`platforms/windsurf.md`](platforms/windsurf.md) |
| VS Code / Copilot | [`platforms/vscode.md`](platforms/vscode.md) |
| WorkBuddy | [`platforms/workbuddy.md`](platforms/workbuddy.md) |
| 其他 MCP 客户端 | [`platforms/generic.md`](platforms/generic.md) |

没有 MCP 的 Agent 也能用：让它读取 [`AGENTS.md`](AGENTS.md) 并调用 CLI。

---

## 最小示例

```json
{
  "name": "Sales Overview",
  "model": {
    "tables": [
      {
        "name": "Sales",
        "columns": [
          { "name": "Date", "type": "date" },
          { "name": "Product", "type": "string" },
          { "name": "Amount", "type": "double", "format": "#,##0" }
        ],
        "rows": [
          ["2024-01-01", "Alpha", 1200],
          ["2024-01-02", "Beta", 1850],
          ["2024-01-03", "Alpha", 990]
        ],
        "measures": [
          { "name": "Total Sales", "expression": "SUM('Sales'[Amount])", "format": "#,##0" }
        ]
      }
    ]
  },
  "pages": [
    {
      "title": "Sales Overview",
      "visuals": [
        {
          "type": "bar",
          "title": "Sales by product",
          "category": "Sales[Product]",
          "values": ["Sales[Total Sales]"]
        }
      ]
    }
  ]
}
```

```bash
node bin/pbip-forge.mjs build spec.json --output ./out
```

完整字段说明：

- 在 Agent 里调用 `powerbi_help`
- 或看 [`docs/SPEC.md`](docs/SPEC.md)
- 可运行示例：[`examples/sales-dashboard.json`](examples/sales-dashboard.json)

---

## 支持的视觉对象

| `type` | PBIR visualType | 默认字段 |
|---|---|---|
| `bar` / `column` | barChart / columnChart | `category` → Category，`values` → Y |
| `line` / `area` | lineChart / areaChart | `category` → Category，`values` → Y |
| `pie` / `donut` | pieChart / donutChart | `category` → Category，`values` → Y |
| `card` | cardVisual | `values` → Data |
| `table` | tableEx | `values` → Values |
| `matrix` | pivotTable | `rows` / `columns` / `values` |
| `slicer` | slicer | `field` 或 `values` → Values |
| `scatter` | scatterChart | `xField` / `yField` / `series` / `size` |
| `gauge` | gauge | `values` / `min` / `max` / `target` |
| `kpi` | kpi | `values` / `trend` / `goal` |
| `textbox` | textbox | `text` 或 `runs` |

任意 PBIR 视觉对象都可以用 `visualType` + `roles` 直接指定：

```json
{
  "visualType": "funnel",
  "roles": {
    "Category": ["Sales[Stage]"],
    "Y": ["Sales[Total Sales]"]
  }
}
```

---

## 数据源

- `rows`：内联数组（数组或对象），适合中小数据/演示
- `csv`：读取 UTF-8 CSV，自动识别表头和类型
- `excel`：读取 `.xlsx/.xlsm`（需要 Python + openpyxl）
- `expression`：原生 Power Query M，适合 SQL/API/大数据
- `mode: "directQuery"`：生成 DirectQuery 分区

内联数据会写进 M 的 `#table(...)`，所以模型是自包含的；大表建议用 `expression` 或 CSV。

---

## 校验

每次生成都会检查：

- 表、列、度量值、关系端点是否存在
- 关系两端类型是否兼容
- 视觉对象字段是否能解析
- 页面坐标是否越界

Windows 上如果安装了 Power BI Desktop，还会调用 `Microsoft.PowerBI.Tabular` 对生成的 TMDL 做真实解析；失败会返回错误，未安装则标记为 `skipped`。

---

## 项目结构

```text
<Name>.pbip
<Name>.SemanticModel/
  .platform
  definition.pbism
  definition/
    database.tmdl
    model.tmdl
    relationships.tmdl
    tables/*.tmdl
    roles/*.tmdl
<Name>.Report/
  .platform
  definition.pbir
  definition/
    report.json
    version.json
    pages/pages.json
    pages/<pageId>/page.json
    pages/<pageId>/visuals/<visualId>/visual.json
  StaticResources/RegisteredResources/theme.json
```

全部是文本文件，适合 Git 版本管理和 Agent 修改。

---

## 安装为本地命令

```bash
node bin/pbip-forge.mjs install --target "C:\tools\pbip-forge"
```

会复制运行时文件，并生成 `pbip-forge.cmd` / `pbip-forge.sh`。之后任何 Agent 都可以调用：

```bash
C:\tools\pbip-forge\pbip-forge.cmd build spec.json --output C:\work\sales
```

## 自测

```bash
npm test
```

临时目录里建一个带关系、度量值、RLS 角色、两页报表的项目，再把生成的文件读回来校验：
文件树、TMDL、PBIR、覆盖保护、错误字段/错误关系的报错、带空格和引号的表名列名。
不需要网络，也不打开 Power BI 窗口；跑完自动删掉临时文件。
Windows 上装了 Power BI Desktop 时会额外跑一次真实 TMDL 解析，其它平台该项标 `skipped`。

---

## 限制

- `.pbip` 是源格式；要 `.pbix` 单文件，请在 Power BI Desktop 中另存为，或发布到 Fabric
- Power BI Desktop 本身仅支持 Windows；生成 PBIP、MCP、CLI 在 macOS/Linux 也可用（TMDL 引擎校验和自动打开会跳过）
- 视觉对象格式化目前覆盖标题、图例、数据标签、切片器模式；复杂主题/条件格式请用 `theme` 或直接改 PBIR
- 不负责数据刷新；打开后如需刷新，在 Desktop 点一次“刷新”即可
- 自定义视觉对象（AppSource）只写入 visualType，不负责安装

---

## License

AGPL-3.0-only。见 [`LICENSE`](LICENSE)。

---

## English

**PBIP Forge** writes a complete Power BI project (`.pbip`) straight to disk — no computer-use, no ribbon clicking.

It generates the **semantic model** (TMDL tables, columns, DAX measures, calculated columns, relationships, hierarchies, RLS roles) and the **report** (PBIR pages and native visuals: card, bar, column, line, area, pie, donut, table, matrix, slicer, scatter, gauge, KPI, textbox), then validates both: TMDL through the Power BI Tabular engine on Windows, PBIR against Microsoft's JSON schemas.

**Three entry points, one core:**

- **DSH plugin** — `dsh plugin add /path/to/pbip-forge`, then use `powerbi_create`, `powerbi_help`, `powerbi_validate`, `powerbi_open`.
- **CLI** — `node bin/pbip-forge.mjs build examples/sales-dashboard.json --output ./out --json`
- **MCP** — `node mcp/server.mjs`; per-client setup in [`platforms/`](platforms/).

**Data sources:** inline rows, CSV (UTF-8), Excel (needs Python + openpyxl), or native Power Query M. `mode: "directQuery"` emits a DirectQuery partition.

**Headless by default.** Generation and validation never open a Power BI window; only `powerbi_open` / `pbip-forge open` launches Desktop, and `PBIP_FORGE_HEADLESS=1` blocks even that.

**Requirements:** Node.js 20+. Power BI Desktop is optional and Windows-only — without it everything still generates and validates, minus the engine-level TMDL parse.

**Test:** `npm test` — builds and re-validates a project in a temp folder, including overwrite protection and the error paths for bad fields and bad relationships.

This is not a Microsoft project; PBIP, TMDL and PBIR are public Microsoft formats.

