# SQL Viz — SQL 可视化学习 · 测试数据生成 · 血缘分析 · BI 报表 · 数据探查 · RAG 转 SQL · 数据建模平台

> 一个面向 SQL 学习者与数据开发者的多功能工具平台：用 Canvas 动画「看见」SQL 函数的执行过程，用 LLM 一键生成测试数据集，对 SQL/HQL 脚本做表级血缘分析，上传 Excel/CSV 自助生成可视化大屏报表，连接真实库做只读探查并一键生成数据质量脚本，以及基于 RAG 知识库用自然语言生成对齐业务模型的 SQL。

前后端分离架构：**React 19 + Vite 7 + TypeScript**（前端）/ **FastAPI + Python**（后端）。

---

## ✨ 功能模块

| 模块 | 说明 |
|------|------|
| **SQL 函数可视化学习** | 覆盖 MySQL / PostgreSQL / Hive / Impala / SparkSQL / FlinkSQL / Cypher 7 种方言；按分类浏览函数，查看签名/参数/示例，并通过 Canvas 动画逐步骤演示 `WHERE` / `JOIN` / `GROUP BY` 等数据变换；支持 SQL 代码与动画联动高亮、全局搜索、收藏与最近查看。 |
| **测试数据集工具** | 用自然语言描述或自定义字段两种模式，调用 LLM 生成结构化测试数据，支持 xlsx / json / csv 一键导出；可上传 xlsx/csv 解析表头快速建表。 |
| **SQL 血缘分析** | 粘贴或上传 SQL/HQL 脚本，解析表级依赖，生成血缘图谱、依赖清单，并支持导出 Cypher / Excel / JSON、推送 Neo4j。 |
| **BI 报表工具** | 上传 xlsx/csv（支持 Excel 多级表头）由后端 pandas 解析落盘；前端维度/指标建模后生成 ECharts 大屏：柱状/折线/饼图/散点图/组合图/**中国地图**（省级↔城市级下钻联动）七种图表 + 四套配色；支持点击下钻、面包屑上钻、总览卡片与明细联动、表头与大屏排序；可导出 PNG / 数据 / 仪表盘配置。城市级地图经后端代理拉取 DataV 边界并磁盘缓存，规避浏览器跨域 403。 |
| **数据探查工具** | 配置连接 MySQL / Hive / PostgreSQL 数据源（会话级连接池、凭证内存驻留不落盘），在工作台做只读 SQL 查询与分页预览（sqlglot 静态拦截 DML/DDL/多语句、超时与行数护栏、结果下载）；内置 10 项常见质量指标模板（零 LLM）+ 自定义规则（few-shot 仿写 LLM 生成），为指定表或库一键生成数据质量探查脚本，经静态分析与 EXPLAIN 试运行校验后可导入工作台执行或下载 .sql。 |
| **RAG 转 SQL 工具** | 粘贴建表 DDL 由 sqlglot 结构化解析 + LLM 语义改写为可入 RAG 的表元数据文本块，上传 SQL/建模/质量规范文档切片入库（外部托管 Milvus/Zilliz）；自然语言提问时混合检索（向量 + BM25，RRF 融合）召回相关表与文档、Rerank 重排后作为上下文增强 LLM 生成符合业务模型的 SQL，sqlglot 静态校验、来源可追溯，支持多轮会话与流式输出。 |
| **数据建模平台** | 并入的完整建模子系统（原独立项目）：业务调研（主题域/业务需求）→ 模型设计（字段/表级约束/索引/关系）→ 22 条规范校验 → 评审发布 → 版本差异 → DDL 预览（PG/MySQL/Hive 三引擎，只生成不执行）全链路；附模型关系图画布、图谱快照四视图、最短路径、外部血缘导入（dbt manifest 连接器）、业务总线矩阵，以及平台 admin + 项目 owner/editor/viewer 两级 RBAC 与账号密码登录。前端经首页「数据建模平台」卡片以全屏 iframe 进入。 |

支持亮色 / 暗色主题切换、响应式布局、键盘快捷键（`Ctrl/Cmd+K` 搜索等）。

---

## 🧰 技术栈

**前端**：React 19 · Vite 7 · TypeScript 5 · React Router 7 · Zustand 5 · TanStack Query 5 · Tailwind CSS 4 · 原生 Canvas 2D · ECharts 6（+ echarts-for-react）· Shiki · @xyflow/react · Lucide · Sonner · xlsx
**后端**：FastAPI · Uvicorn · Pydantic 2 · OpenAI SDK（兼容 DeepSeek / 火山 doubao 等）· sqlglot · neo4j · SQLAlchemy 2.x + Alembic（数据建模平台 ORM 与迁移）· pandas / openpyxl / pyarrow（BI 报表数据处理）· pymilvus / rank-bm25（RAG 向量检索 + BM25）· pymysql / psycopg[binary] / pyhive+thrift（数据探查数据源连接）· httpx · pytest
**包管理**：前端 pnpm，后端 pip + requirements.txt

---

## 📁 目录结构

```
LLM_PROJ_BD/
├── frontend/              # React + Vite 前端
│   ├── src/
│   │   ├── pages/         # HomePage / SqlIndexPage / DialectPage / FunctionDetailPage / DataTestPage / LineagePage / BiReportPage / dataprofile / rag-sql（后两者单页多 Tab）
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
│   │   ├── routers/      # dialects / functions / search / datatest / lineage / bi / dataprofile / rag_sql
│   │   ├── services/     # 业务逻辑（bi_* / dataprofile_* / rag_sql_* / lineage_* 等）
│   │   ├── core/         # 配置 / 加载器 / 响应封装 / 缓存
│   │   ├── modeling/     # 数据建模平台（并入的独立子系统，挂载于 /modeling）
│   │   │                 #   main/config/db/models/auth/ddl/validation + alembic.ini
│   │   │                 #   + migrations/ + frontend/static/（其自带的工作台页面）
│   │   └── data/         # sql（7 方言 JSON）/ bi_datasets（落盘）/ profile_rules（探查自定义规则落盘）/ geo_cache（城市地图缓存，gitignore）
│   ├── tests/            # pytest 测试（conftest.py 把建模平台的库指到临时目录）
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
| `OPENAI_API_KEY` | LLM API 密钥（测试数据 / 血缘分析 / 数据探查 / RAG 转 SQL 的 LLM 功能需要） |
| `OPENAI_BASE_URL` | LLM 接口地址（如使用 DeepSeek：`https://api.deepseek.com`） |
| `LLM_MODEL` | 模型名 |
| `NEO4J_*` | 可选，血缘结果推送 Neo4j 时使用 |
| `CORS_ORIGINS` | 可选，生产部署的允许来源（逗号分隔，未设则用本地开发地址） |
| `BI_MAX_UPLOAD_MB` | 可选，BI 报表上传文件大小上限（默认 10MB） |
| `PROFILE_*` | 可选，数据探查资源护栏：会话 TTL、查询超时、行数/单元格上限、Hive offset 上限、生成 EXPLAIN 重试次数等（见 `.env.example`，均有默认值） |
| `MILVUS_URI` / `MILVUS_TOKEN` | RAG 转 SQL：外部托管 Milvus / Zilliz Cloud 连接串与令牌（留空则入库/问答返回明确错误） |
| `EMBEDDING_*` | RAG 转 SQL：火山引擎 doubao 文本 embedding 的 `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` |
| `RERANK_*` | RAG 转 SQL：模力方舟 bge-reranker-v2-m3 的 `RERANK_API_KEY` / `RERANK_BASE_URL` / `RERANK_MODEL` |

> ⚠️ **切勿把真实的 `.env` 提交到仓库**。根目录 `.gitignore` 已忽略 `.env`，仅 `.env.example` 入库。

> ℹ️ **新增模块依赖说明**：数据探查的 MySQL / PostgreSQL 开箱即用（`pymysql` / `psycopg`）；Hive 依赖 `pyhive` + `thrift`，Windows 下安装易失败，代码会自动降级禁用该方言而不阻断启动。RAG 转 SQL 需外部 Milvus/Zilliz 向量库 + doubao embedding API + bge rerank API；未配置时该模块入库/问答返回明确错误，但不影响其余模块运行。

> ℹ️ **数据建模平台配置**：该子系统自带一套配置（`DATABASE_URL` / `AUTH_MODE` / `APP_ENV` / `AUTO_MIGRATE` / `SEED_DEMO_DATA` 等），优先级为「环境变量 > 仓库根目录 `config.yaml` > 内置默认值」。模板见 `backend/app/modeling/config.example.yaml`，需要自定义时复制到**仓库根目录**并命名为 `config.yaml`。不配置也能直接跑：默认在 `backend/data/platform.db` 自动建库迁移，并在空库时注入最小演示数据。

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
