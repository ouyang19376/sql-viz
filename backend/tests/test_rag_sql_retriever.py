"""RAG for NL2SQL - 检索器单元测试（F-AS-04/05/10/11，plan §6.3 RRF 融合正确性）。

无实 Milvus / embedding / rerank：注入 FakeMilvus + fake embed + fake/真 rerank。
"""
from app.services.rag_sql_rerank import RerankError
from app.services.rag_sql_retriever import (
    _bm25_topk,
    _degrade,
    _tokenize,
    retrieve,
    rrf_merge,
)


# ============================================================
# RRF 融合正确性（plan §6.3）
# ============================================================
def _cand(key, text="t"):
    return {"key": key, "text": text, "title": key, "type": "table", "collection": "table_meta", "chunkText": text}


def test_rrf_merge_overlapping_key_sums_scores():
    """同 key 在两路均出现 -> RRF 分数 = 1/(60+0)+1/(60+0)，排第一。"""
    a = [_cand("x"), _cand("y")]
    b = [_cand("x"), _cand("z")]
    merged = rrf_merge([a, b])
    keys = [m["key"] for m in merged]
    assert keys[0] == "x"  # 两路第一 -> 最高分
    assert set(keys) == {"x", "y", "z"}  # 去重，三个唯一 key


def test_rrf_merge_empty_lists_returns_empty():
    assert rrf_merge([[], []]) == []
    assert rrf_merge([]) == []


def test_rrf_merge_score_is_sum_of_reciprocals():
    a = [_cand("x")]  # rank 0
    b = [_cand("x")]  # rank 0
    merged = rrf_merge([a, b])
    assert len(merged) == 1
    expected = 1 / 60 + 1 / 60
    assert abs(merged[0]["score"] - expected) < 1e-9


# ============================================================
# 分词 + BM25（plan §6.7）
# ============================================================
def test_tokenize_splits_cjk_chars():
    """中文按单字切（无 jieba 兜底）。"""
    assert _tokenize("查询订单") == ["查", "询", "订", "单"]
    assert _tokenize("SELECT order_id") == ["select", "order_id"]


def test_bm25_topk_ranks_by_relevance():
    cands = [
        {"key": "a", "text": "查询订单金额", "type": "table", "title": "a", "collection": "table_meta", "chunkText": "查询订单金额"},
        {"key": "b", "text": "用户登录日志", "type": "table", "title": "b", "collection": "table_meta", "chunkText": "用户登录日志"},
    ]
    ranked = _bm25_topk(cands, "订单", top_k=2)
    assert ranked[0]["key"] == "a"  # 命中「订」「单」更多


def test_bm25_topk_empty_corpus_returns_empty():
    assert _bm25_topk([], "q", 5) == []
    # 全空文本候选 -> 跳过 BM25（不参与，仅向量路）
    assert _bm25_topk([{"key": "a", "text": ""}], "q", 5) == []


# ============================================================
# 降级判定（F-AS-10 空库 / F-AS-11 无命中）
# ============================================================
def test_degrade_empty_kb():
    degraded, reason = _degrade(sources=[], table_count=0, kb_count=0)
    assert degraded is True
    assert "知识库为空" in reason


def test_degrade_no_hit_when_kb_nonempty():
    """库非空但检索无命中（边界，§6.3 理论不会）-> 基于通用能力降级。"""
    degraded, reason = _degrade(sources=[], table_count=3, kb_count=0)
    assert degraded is True
    assert "未检索到相关知识" in reason


def test_degrade_not_degraded_when_sources_present():
    degraded, reason = _degrade(sources=[object()], table_count=1, kb_count=1)
    assert degraded is False
    assert reason is None


# ============================================================
# retrieve 集成（FakeMilvus + fake embed）
# ============================================================
class FakeMilvus:
    """记录调用；可配置向量命中与全量扫描语料。"""

    def __init__(self, tables=None, kb=None, vec_t=None, vec_k=None, fail_search=False):
        self.tables = tables or []
        self.kb = kb or []
        self.vec_t = vec_t or []
        self.vec_k = vec_k or []
        self.fail_search = fail_search

    def search_table_meta(self, vector, top_k):
        if self.fail_search:
            from app.services.rag_sql_milvus import MilvusError

            raise MilvusError("向量库暂不可用")
        return self.vec_t[:top_k]

    def search_kb_docs(self, vector, top_k):
        if self.fail_search:
            from app.services.rag_sql_milvus import MilvusError

            raise MilvusError("向量库暂不可用")
        return self.vec_k[:top_k]

    def scan_table_meta_all(self):
        return self.tables

    def scan_kb_chunks_all(self):
        return self.kb


def _embed(texts):
    return [[0.1, 0.2] for _ in texts]


TABLE_HIT = {
    "id": 1,
    "tableName": "dwd_order",
    "rawText": "表名：dwd_order 主题域：交易域 字段：order_id order_amount",
    "topic": "交易域",
}
KB_HIT = {
    "id": 10,
    "docId": "doc_1",
    "title": "SQL编码规范",
    "chunkText": "SELECT 必须显式列出列名 禁止 SELECT 星号",
    "chunkIndex": 0,
}


def test_retrieve_happy_path_returns_table_and_doc_sources():
    fake = FakeMilvus(tables=[TABLE_HIT], kb=[KB_HIT], vec_t=[TABLE_HIT], vec_k=[KB_HIT])
    sources, degraded, reason = retrieve(
        "查询订单金额", _embed, fake, rerank_fn=None, top_k=8, top_n=5
    )
    assert degraded is False
    assert reason is None
    types = {s.type for s in sources}
    assert "table" in types
    assert "doc" in types
    # 来源标题 / chunkText 落位
    tbl = next(s for s in sources if s.type == "table")
    assert tbl.title == "dwd_order"
    assert "dwd_order" in tbl.chunkText


def test_retrieve_empty_kb_degrades():
    fake = FakeMilvus(tables=[], kb=[], vec_t=[], vec_k=[])
    sources, degraded, reason = retrieve(
        "查询订单金额", _embed, fake, rerank_fn=None, top_k=8, top_n=5
    )
    assert sources == []
    assert degraded is True
    assert "知识库为空" in reason


def test_retrieve_rerank_failure_falls_back_to_rrf():
    """rerank 抛 RerankError -> 降级用 RRF 排序，不阻断（F-AS-05 / plan §6.4）。"""
    fake = FakeMilvus(tables=[TABLE_HIT], kb=[KB_HIT], vec_t=[TABLE_HIT], vec_k=[KB_HIT])

    def boom(query, cands, top_n):
        raise RerankError("rerank 上游超时")

    sources, degraded, reason = retrieve(
        "查询订单金额", _embed, fake, rerank_fn=boom, top_k=8, top_n=5
    )
    assert degraded is False
    assert len(sources) > 0  # 降级仍返回来源


def test_retrieve_rerank_reorders_candidates():
    fake = FakeMilvus(tables=[TABLE_HIT], kb=[KB_HIT], vec_t=[TABLE_HIT], vec_k=[KB_HIT])

    def custom(query, cands, top_n):
        # 把 doc 排到最前
        ordered = sorted(cands, key=lambda c: 0 if c["type"] == "doc" else 1)
        for i, c in enumerate(ordered):
            c["score"] = 1.0 - i * 0.1
        return ordered[:top_n]

    sources, _, _ = retrieve("查询", _embed, fake, rerank_fn=custom, top_k=8, top_n=5)
    assert sources[0].type == "doc"  # rerank 重排生效
