"""数据探查 - Pydantic 模型测试（F-DS-01 / F-DS-08）。"""
import pytest
from pydantic import ValidationError

from app.services.dataprofile_models import (
    ColumnInfo,
    DataSource,
    DataSourceConfig,
    GenerateProfileRequest,
    TableInfo,
    TestResult,
)


class TestDataSourceConfig:
    def _ok(self):
        return dict(
            name="local-mysql", dialect="mysql", host="127.0.0.1", port=3306,
            database="test", username="root", password="pw",
        )

    def test_valid_config(self):
        cfg = DataSourceConfig(**self._ok())
        assert cfg.dialect == "mysql" and cfg.port == 3306

    def test_extra_forbidden(self):
        bad = self._ok() | {"extra": "x"}
        with pytest.raises(ValidationError):
            DataSourceConfig(**bad)

    def test_port_out_of_range(self):
        bad = self._ok() | {"port": 70000}
        with pytest.raises(ValidationError):
            DataSourceConfig(**bad)

    def test_name_required(self):
        bad = self._ok(); bad["name"] = ""
        with pytest.raises(ValidationError):
            DataSourceConfig(**bad)

    def test_password_allows_empty_for_edit(self):
        """编辑时密码留空（""）表示不改 - 允许空串通过模型，由 service 层判断。"""
        bad = self._ok(); bad["password"] = ""
        cfg = DataSourceConfig(**bad)
        assert cfg.password == ""

    def test_database_optional(self):
        ok = self._ok(); ok.pop("database")
        cfg = DataSourceConfig(**ok)
        assert cfg.database is None


class TestCredentialSafety:
    """F-DS-08：DataSource 视图永不含 password。"""

    def test_datasource_model_has_no_password_field(self):
        assert "password" not in DataSource.model_fields

    def test_datasource_dump_excludes_password(self):
        ds = DataSource(
            id="ds_1", name="local", dialect="mysql", host="h", port=3306,
            database="test", username="root", status="connected", connectedAt=1,
        )
        dumped = ds.model_dump()
        assert "password" not in dumped
        assert dumped["status"] == "connected"


class TestOtherModels:
    def test_test_result_ok(self):
        r = TestResult(ok=True, dialect="mysql", version="8.0.32")
        assert r.ok and r.version == "8.0.32" and r.errorType is None

    def test_column_info(self):
        c = ColumnInfo(name="id", type="int", nullable=False)
        assert c.name == "id" and not c.nullable

    def test_table_info(self):
        t = TableInfo(name="users", schema="test")
        assert t.name == "users" and t.schema == "test"


class TestGenerateProfileRequest:
    """PRD §5.4：metricIds / customRuleIds 列表上限 20。"""

    def _ok(self, **over):
        base = dict(
            datasourceId="ds_1", dialect="mysql", sourceType="tables",
            tables=["t1"], metricIds=["row_count"], outputMode="split",
        )
        base.update(over)
        return base

    def test_metric_ids_allows_20(self):
        req = GenerateProfileRequest(**self._ok(metricIds=[f"m{i}" for i in range(20)]))
        assert len(req.metricIds) == 20

    def test_metric_ids_rejects_21(self):
        with pytest.raises(ValidationError):
            GenerateProfileRequest(**self._ok(metricIds=[f"m{i}" for i in range(21)]))

    def test_custom_rule_ids_allows_20(self):
        req = GenerateProfileRequest(**self._ok(customRuleIds=[f"r{i}" for i in range(20)]))
        assert len(req.customRuleIds) == 20

    def test_custom_rule_ids_rejects_21(self):
        with pytest.raises(ValidationError):
            GenerateProfileRequest(**self._ok(customRuleIds=[f"r{i}" for i in range(21)]))
