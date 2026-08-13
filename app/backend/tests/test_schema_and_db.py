from src.chemical_db import ChemicalDB
from src.schema import ChemicalAnalysis


def sample():
    return ChemicalAnalysis.model_validate({
        "product": {"name": "测试漂白剂", "barcode": "6900000000001"},
        "hazards": [{"type": "corrosive", "severity": "high", "evidence": "标签", "confidence": 0.9}],
        "risk_level": "high", "summary": "测试",
    })


def test_schema_and_database(tmp_path):
    analysis = sample()
    db = ChemicalDB(tmp_path / "test.db")
    product_id = db.upsert_product("6900000000001", "测试漂白剂")
    assert db.match(analysis)["id"] == product_id
    item_id = db.add_to_household("home-1", "test.jpg", analysis, product_id)
    assert item_id > 0

