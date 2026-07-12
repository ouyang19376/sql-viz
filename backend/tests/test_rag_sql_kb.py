"""RAG for NL2SQL - 文档切片单元测试（F-KB-03，plan §6.7）。

纯函数测试，无 LLM / Milvus / embedding 依赖。
"""
from app.services.rag_sql_kb import chunk_doc


def test_chunk_paragraph_split():
    """多段 -> 每段一个分片（段落优先）。"""
    content = "第一条规范：SELECT 必须列出列名。\n\n第二条规范：禁用 SELECT *。\n\n第三条规范：表必须带别名。"
    chunks = chunk_doc(content)
    assert len(chunks) == 3
    assert chunks[0].startswith("第一条规范")
    assert chunks[2].endswith("带别名。")


def test_chunk_short_single_returns_one():
    assert chunk_doc("这是一段简短规范。") == ["这是一段简短规范。"]


def test_chunk_strips_blank_paragraphs():
    """空段 / 纯空白段被丢弃。"""
    content = "段一\n\n\n   \n\n段二"
    chunks = chunk_doc(content)
    assert chunks == ["段一", "段二"]


def test_chunk_sliding_window_long_paragraph():
    """单段超上限 -> 滑窗切分，窗口间有 overlap。"""
    para = "字" * 2500  # > _CHUNK_MAX_CHARS(1000)
    chunks = chunk_doc(para)
    assert len(chunks) >= 3
    # 每片不超过窗口上限
    assert all(len(c) <= 1000 for c in chunks)
    # 拼接还原后字符等长（overlap 不丢内容：相邻片首尾重叠）
    assert len("".join(chunks)) >= 2500
    # overlap 存在：第二片起始 = 第一片的第 900 字符
    assert chunks[1][0] == chunks[0][900]


def test_chunk_all_whitespace_returns_empty():
    """全空白内容 -> 空列表（ingest_doc 兜底为整段，见 rag_sql_kb.ingest_doc）。"""
    assert chunk_doc("\n\n   \n\n") == []
