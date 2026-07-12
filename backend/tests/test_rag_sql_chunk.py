"""RAG for NL2SQL - 文本块生成单元测试（F-CK-02/03/09，API-CK-01）。

真实 sqlglot 解析；LLM 增强注入 fake chat_fn（无实 LLM / 不耗 token）。
"""
import json

from app.services.rag_sql_chunk import (
    build_raw_text,
    chunk_ddl,
    parse_ddl,
)
from app.services.rag_sql_models import TableFieldDetail, TableSummary

DDL_HIVE = """
CREATE TABLE dwd_trade_order_info (
  order_id BIGINT NOT NULL COMMENT '订单编号',
  user_id BIGINT COMMENT '用户ID',
  final_amount DECIMAL(18,2) COMMENT '最终金额'
) COMMENT='交易订单明细事实表'
PARTITIONED BY (dt STRING COMMENT '分区日期');
"""

DDL_MYSQL = """
CREATE TABLE `dim_user` (
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `nickname` VARCHAR(64) COMMENT '昵称'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='用户维度表';
"""


def _chat_ok(system, user):
    return json.dumps(
        {
            "chineseName": "交易订单明细事实表",
            "topic": "交易域",
            "description": "订单明细",
            "keyFields": ["order_id", "final_amount", "not_a_real_column"],
            "partitionField": "dt",
            "granularity": "一行一个订单SKU",
            "fieldExtras": {"order_id": "订单主键"},
        }
    )


# ─── F-CK-02：sqlglot 结构化解析（零 LLM） ───────────────
def test_parse_hive_extracts_columns_comment_partition():
    tables = parse_ddl(DDL_HIVE)
    assert len(tables) == 1
    t = tables[0]
    assert t.tableName == "dwd_trade_order_info"
    assert t.partitionFields == ["dt"]  # 分区列归 partitionField
    # 分区列 dt 不进 fields（PRD §6.2 示例）
    assert [f.name for f in t.fields] == ["order_id", "user_id", "final_amount"]
    od = next(f for f in t.fields if f.name == "order_id")
    assert od.type == "BIGINT"
    assert od.nullable is False  # NOT NULL
    assert od.comment == "订单编号"
    fa = next(f for f in t.fields if f.name == "final_amount")
    assert fa.nullable is True


def test_parse_mysql_backticks_stripped():
    tables = parse_ddl(DDL_MYSQL)
    assert len(tables) == 1
    t = tables[0]
    assert t.tableName == "dim_user"  # 反引号剥离
    assert [f.name for f in t.fields] == ["user_id", "nickname"]
    assert next(f for f in t.fields if f.name == "user_id").nullable is False


def test_parse_multi_table():
    tables = parse_ddl(DDL_HIVE + "\n" + DDL_MYSQL)
    assert len(tables) == 2
    assert {t.tableName for t in tables} == {"dwd_trade_order_info", "dim_user"}


def test_parse_non_ddl_returns_empty():
    assert parse_ddl("这是普通文本，不是建表语句") == []
    assert parse_ddl("SELECT 1;") == []


# ─── F-CK-03：LLM 语义增强 ─────────────────────────────
def test_enhance_merges_semantic_and_filters_keyfields():
    resp = chunk_ddl(DDL_HIVE, chat_fn=_chat_ok)
    assert resp.refused is False
    assert len(resp.chunks) == 1
    c = resp.chunks[0]
    s = c.summary
    assert s.chineseName == "交易订单明细事实表"
    assert s.topic == "交易域"
    assert s.partitionField == "dt"
    # keyFields 中杜撰字段被剔除（减幻觉，plan §6.2 #4）
    assert s.keyFields == ["order_id", "final_amount"]
    # fieldExtras 合并
    od = next(f for f in c.fields if f.name == "order_id")
    assert od.extra == "订单主键"
    # 字段结构来自 sqlglot，未被 LLM 篡改
    assert len(c.fields) == 3


def test_enhance_llm_fail_degrades_to_minimal_summary():
    def boom(system, user):
        raise RuntimeError("LLM 不可用")

    resp = chunk_ddl(DDL_HIVE, chat_fn=boom)
    assert resp.refused is False  # 解析成功不 refused
    c = resp.chunks[0]
    assert c.summary.chineseName is None  # 缺字段留空（§7.2 部分失败）
    assert c.summary.partitionField == "dt"  # 结构层信息保留
    assert len(c.fields) == 3  # 字段仍来自 sqlglot


def test_enhance_bad_json_degrades():
    resp = chunk_ddl(DDL_HIVE, chat_fn=lambda s, u: "not json {")
    assert resp.refused is False
    assert resp.chunks[0].summary.chineseName is None


# ─── F-CK-09：解析失败降级 ─────────────────────────────
def test_chunk_non_ddl_refused_with_message():
    resp = chunk_ddl("这是普通文本", chat_fn=_chat_ok)
    assert resp.refused is True
    assert resp.chunks == []
    assert "CREATE TABLE" in (resp.message or "")


def test_build_raw_text_shape():
    summary = TableSummary(
        tableName="t", chineseName="表", topic="域", description="d",
        keyFields=["a"], partitionField="dt", granularity="g",
    )
    fields = [TableFieldDetail(name="a", type="INT", comment="列a", nullable=False)]
    raw = build_raw_text(summary, fields)
    assert "### 表概要" in raw
    assert "表名：t" in raw
    assert "关键列：a" in raw
    assert "### 表结构详情" in raw
    assert "| a | INT | 否 | 列a |" in raw


# ─── LLM 兜底降级（plan §6.2 #3）：sqlglot 失败 -> LLM 自由解析 ──
def _chat_parse_ok(system, user):
    return json.dumps({"tables": [{
        "tableName": "dwd_order",
        "chineseName": "订单表",
        "topic": "交易域",
        "keyFields": ["order_id"],
        "partitionField": "dt",
        "fields": [
            {"name": "order_id", "type": "bigint", "nullable": False, "comment": "订单编号"},
            {"name": "user_id", "type": "bigint", "nullable": True},
        ],
    }]})


def test_chunk_llm_fallback_parses_nonstandard_ddl():
    """sqlglot 失败（非标准文本）-> LLM 自由解析返回结构化 chunks。"""
    resp = chunk_ddl("建表 dwd_order 含 order_id 与 user_id 两字段", chat_fn=_chat_parse_ok)
    assert resp.refused is False
    assert len(resp.chunks) == 1
    c = resp.chunks[0]
    assert c.tableName == "dwd_order"
    assert c.summary.chineseName == "订单表"
    assert c.summary.topic == "交易域"
    assert [f.name for f in c.fields] == ["order_id", "user_id"]
    assert c.summary.keyFields == ["order_id"]
    assert "### 表概要" in c.rawText


def test_chunk_llm_fallback_filters_dubious_keyfields():
    """LLM 兜底返回的 keyFields 必须落在 fields 名内（减幻觉）。"""

    def chat(system, user):
        return json.dumps({"tables": [{
            "tableName": "t",
            "fields": [{"name": "a", "type": "int"}],
            "keyFields": ["a", "fake_col"],
        }]})

    resp = chunk_ddl("非标准建表语句", chat_fn=chat)
    assert resp.refused is False
    assert resp.chunks[0].summary.keyFields == ["a"]  # fake_col 剔除


def test_chunk_llm_fallback_refused_on_bad_json():
    """LLM 兜底返回非 JSON -> refused。"""
    resp = chunk_ddl("非标准建表语句", chat_fn=lambda s, u: "not a json")
    assert resp.refused is True
    assert resp.chunks == []
    assert "CREATE TABLE" in (resp.message or "")


def test_chunk_llm_fallback_refused_on_empty_tables():
    """LLM 兜底返回空 tables -> refused。"""

    def chat(system, user):
        return json.dumps({"tables": []})

    resp = chunk_ddl("非标准建表语句", chat_fn=chat)
    assert resp.refused is True
    assert resp.chunks == []
