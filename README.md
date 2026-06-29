# SQL Viz — SQL 可视化学习 · 测试数据生成 · 血缘分析 · BI 报表平台

> 一个面向 SQL 学习者与数据开发者的多功能工具平台：用 Canvas 动画「看见」SQL 函数的执行过程，用 LLM 一键生成测试数据集，对 SQL/HQL 脚本做表级血缘分析，并上传 Excel/CSV 自助生成可视化大屏报表。

前后端分离架构：**React 19 + Vite 7 + TypeScript**（前端）/ **FastAPI + Python**（后端）。

---

## ✨ 功能模块

| 模块 | 说明 |
|------|------|
| **SQL 函数可视化学习** | 覆盖 MySQL / PostgreSQL / Hive / Impala / SparkSQL / FlinkSQL / Cypher 7 种方言；按分类浏览函数，查看签名/参数/示例，并通过 Canvas 动画逐步骤演示 `WHERE` / `JOIN` / `GROUP BY` 等数据变换；支持 SQL 代码与动画联动高亮、全局搜索、收藏与最近查看。 |
| **测试数据集工具** | 用自然语言描述或自定义字段两种模式，调用 LLM 生成结构化测试数据，支持 xlsx / json / csv 一键导出；可上传 xlsx/csv 解析表头快速建表。 |
| **SQL 血缘分析** | 粘贴或上传 SQL/HQL 脚本，解析表级依赖，生成血缘图谱、依赖清单，并支持导出 Cypher / Excel / JSON、推送 Neo4j。 |
| **BI 报表工具** | 上传 xlsx/csv（支持 Excel 多级表头）由后端 pandas 解析落盘；前端维度/指标建模后生成 ECharts 大屏：柱状/折线/饼图/散点图/组合图/**中国地图**（省级↔城市级下钻联动）七种图表 + 四套配色；支持点击下钻、面包屑上钻、总览卡片与明细联动、表头与大屏排序；可导出 PNG / 数据 / 仪表盘配置。城市级地图经后端代理拉取 DataV 边界并磁盘缓存，规避浏览器跨域 403。 |

支持亮色 / 暗色主题切换、响应式布局、键盘快捷键（`Ctrl/Cmd+K` 搜索等）。

---

## 🧰 技术栈

**前端**：React 19 · Vite 7 · TypeScript 5 · React Router 7 · Zustand 5 · TanStack Query 5 · Tailwind CSS 4 · 原生 Canvas 2D · ECharts 6（+ echarts-for-react）· Shiki · @xyflow/react · Lucide · Sonner · xlsx
**后端**：FastAPI · Uvicorn · Pydantic 2 · OpenAI SDK（兼容 DeepSeek 等）· sqlglot · neo4j · pandas / openpyxl / pyarrow（BI 报表数据处理）· httpx · pytest
**包管理**：前端 pnpm，后端 pip + requirements.txt

---

## 📁 目录结构

```
LLM_PROJ_BD/
├── frontend/              # React + Vite 前端
│   ├── src/
│   │   ├── pages/         # 页面：HomePage / SqlIndexPage / DialectPage / FunctionDetailPage / DataTestPage / LineagePage / BiReportPage
│   │   ├── components/    # global / animation / code / datatest / lineage / bi / shared
│   │   ├── engine/        # Canvas 动画引擎（CanvasEngine / AnimationController / renderers）
│   │   ├── lib/bi/        # chinaMap：地图省级归一化 + 城市级 GeoJSON 懒加载
│   │   ├── stores/        # Zustand 全局状态
│   │   ├── api/           # 请求封装 + TanStack Query hooks
│   │   ├── hooks/ lib/ types/
│   │   └── App.tsx
│   ├── package.json  vite.config.ts  tsconfig.json
│
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── main.py       # 入口：CORS + 路由注册
│   │   ├── routers/      # dialects / functions / search / datatest / lineage / bi
│   │   ├── services/     # 业务逻辑（bi_service / bi_parser / bi_geo 等）
│   │   ├── core/         # 配置 / 加载器 / 响应封装 / 缓存
│   │   └── data/         # sql（7 方言 JSON）/ bi_datasets（落盘）/ geo_cache（城市地图缓存，gitignore）
│   ├── tests/            # pytest 测试
│   ├── requirements.txt
│   └── .env.example      # 环境变量模板（复制为 .env 后填写）
│
└── docs/                 # PRD、技术方案、设计文档
```

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 18，pnpm（`npm i -g pnpm`）
- Python ≥ 3.10

### 1. 启动后端（端口 8001）

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

# 配置环境变量：复制模板并填写你自己的密钥
cp .env.example .env      # Windows 用：copy .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 等

uvicorn app.main:app --port 8001 --reload
```

### 2. 启动前端（端口 5173）

```bash
cd frontend
pnpm install
pnpm dev
```

打开浏览器访问 http://localhost:5173 。前端开发服务器会把 `/api` 请求代理到后端 `127.0.0.1:8001`。

### 环境变量

后端所需变量见 `backend/.env.example`，主要包括：

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | LLM API 密钥（测试数据 / 血缘分析功能需要） |
| `OPENAI_BASE_URL` | LLM 接口地址（如使用 DeepSeek：`https://api.deepseek.com`） |
| `LLM_MODEL` | 模型名 |
| `NEO4J_*` | 可选，血缘结果推送 Neo4j 时使用 |
| `CORS_ORIGINS` | 可选，生产部署的允许来源（逗号分隔，未设则用本地开发地址） |
| `BI_MAX_UPLOAD_MB` | 可选，BI 报表上传文件大小上限（默认 10MB） |

> ⚠️ **切勿把真实的 `.env` 提交到仓库**。根目录 `.gitignore` 已忽略 `.env`，仅 `.env.example` 入库。

---

## 📜 可用脚本

**前端**（在 `frontend/` 下）
| 命令 | 作用 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm preview` | 预览构建产物 |
| `pnpm typecheck` | 仅类型检查 |

**后端**（在 `backend/` 下）
| 命令 | 作用 |
|------|------|
| `uvicorn app.main:app --port 8001 --reload` | 启动 API |
| `pytest` | 运行测试 |

---

## 📚 示例

<img width="1133" height="823" alt="6083021bb9ef3e8bf29cc005911128fd" src="https://github.com/user-attachments/assets/4fef70da-b2de-4a1c-8cb1-0cee8ea0fe5d" />
<img width="1134" height="900" alt="cc939dab8cff140dac1b08d94c73990e" src="https://github.com/user-attachments/assets/3364d1e4-fea0-4b09-9210-610f39c9fb78" />
<img width="1246" height="842" alt="81bd42d9e1c0c1a4d305b6a36823c292" src="https://github.com/user-attachments/assets/a96396f2-d7d3-4e5b-96ef-8703358f203c" />
<img width="738" height="568" alt="fd0a4b99dbffc79bd518df16acaf78fa" src="https://github.com/user-attachments/assets/42833586-b5f6-4bdc-ae40-916925c470c5" />

---

## 📄 许可证

[MIT](./LICENSE) © 2026 \ouyang19376
