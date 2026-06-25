"""Neo4j 直接推送服务（F-EX-07）。"""
from __future__ import annotations

from typing import Any

from app.core.config import NEO4J_DATABASE, NEO4J_PASSWORD, NEO4J_URI, NEO4J_USERNAME
from app.services.lineage_models import LineageAnalysisResult, LineageNeo4jPushResult


class Neo4jPushError(RuntimeError):
    """Neo4j 推送失败。"""


class Neo4jNotConfiguredError(Neo4jPushError):
    """Neo4j 连接未配置。"""


def push_lineage_to_neo4j(result: LineageAnalysisResult) -> LineageNeo4jPushResult:
    """将结构化血缘结果幂等写入 Neo4j。"""
    if not (NEO4J_URI and NEO4J_USERNAME and NEO4J_PASSWORD):
        raise Neo4jNotConfiguredError("Neo4j 连接未配置，请设置 NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD")

    try:
        from neo4j import GraphDatabase
    except ImportError as exc:
        raise Neo4jPushError("Neo4j driver 未安装，请先安装 backend/requirements.txt") from exc

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    try:
        with driver.session(database=NEO4J_DATABASE or None) as session:
            for table in result.tables:
                session.execute_write(_merge_table, table.model_dump())
            table_names = {table.id: table.name for table in result.tables}
            for dep in result.dependencies:
                source = table_names.get(dep.source, dep.source)
                target = table_names.get(dep.target, dep.target)
                session.execute_write(
                    _merge_dependency,
                    {
                        "source": source,
                        "target": target,
                        "key": "|".join(
                            [
                                source,
                                target,
                                dep.kind,
                                str(dep.statementIndex or ""),
                                dep.description or "",
                            ]
                        ),
                        "kind": dep.kind,
                        "statementIndex": dep.statementIndex,
                        "description": dep.description,
                    },
                )
    except Exception as exc:
        raise Neo4jPushError(str(exc)) from exc
    finally:
        driver.close()

    return LineageNeo4jPushResult(
        tables=len(result.tables),
        dependencies=len(result.dependencies),
        database=NEO4J_DATABASE or None,
    )


def _merge_table(tx: Any, table: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (t:Table {name: $name})
        SET t.type = $type,
            t.database = $database,
            t.schema = $schema,
            t.alias = $alias
        """,
        name=table["name"],
        type=table.get("type"),
        database=table.get("database"),
        schema=table.get("schema"),
        alias=table.get("alias"),
    )


def _merge_dependency(tx: Any, dep: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (target:Table {name: $target})
        MERGE (source:Table {name: $source})
        MERGE (target)-[r:DEPENDS_ON {key: $key}]->(source)
        SET r.kind = $kind,
            r.statementIndex = $statementIndex,
            r.description = $description
        """,
        target=dep["target"],
        source=dep["source"],
        key=dep["key"],
        kind=dep.get("kind"),
        statementIndex=dep.get("statementIndex"),
        description=dep.get("description"),
    )
