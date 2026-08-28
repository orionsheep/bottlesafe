from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .schema import ChemicalAnalysis


SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, barcode TEXT UNIQUE, name TEXT NOT NULL,
  brand TEXT, manufacturer TEXT, category TEXT, safety_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS household_items (
  id INTEGER PRIMARY KEY, household_id TEXT NOT NULL, product_id INTEGER,
  observed_name TEXT, image_path TEXT, analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY, household_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  overall_risk TEXT NOT NULL DEFAULT 'unknown',
  item_count INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL DEFAULT '{}'
);
"""


class ChemicalDB:
    def __init__(self, path: str | Path):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def match(self, analysis: ChemicalAnalysis) -> dict | None:
        p = analysis.product
        if p.barcode:
            row = self.conn.execute("SELECT * FROM products WHERE barcode = ?", (p.barcode,)).fetchone()
            if row:
                return dict(row)
        if p.name:
            row = self.conn.execute(
                "SELECT * FROM products WHERE lower(name) = lower(?) AND (? IS NULL OR lower(coalesce(brand,'')) = lower(?)) LIMIT 1",
                (p.name, p.brand, p.brand),
            ).fetchone()
            if row:
                return dict(row)
        return None

    def add_to_household(self, household_id: str, image_path: str, analysis: ChemicalAnalysis, product_id: int | None = None) -> int:
        cur = self.conn.execute(
            "INSERT INTO household_items(household_id, product_id, observed_name, image_path, analysis_json) VALUES(?,?,?,?,?)",
            (household_id, product_id, analysis.product.name, image_path, analysis.model_dump_json()),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def list_household(self, household_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM household_items WHERE household_id = ? ORDER BY id",
            (household_id,),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["analysis"] = json.loads(d.pop("analysis_json"))
            except json.JSONDecodeError:
                d["analysis"] = {}
            out.append(d)
        return out

    # ---------------- 排查快照（长期档案时间线） ----------------

    def add_checkin(self, household_id: str, overall_risk: str, item_count: int, report: dict) -> int:
        cur = self.conn.execute(
            "INSERT INTO checkins(household_id, overall_risk, item_count, report_json) VALUES(?,?,?,?)",
            (household_id, overall_risk, item_count, json.dumps(report, ensure_ascii=False)),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def list_checkins(self, household_id: str, limit: int = 50) -> list[dict]:
        rows = self.conn.execute(
            "SELECT id, created_at, overall_risk, item_count FROM checkins "
            "WHERE household_id = ? ORDER BY id DESC LIMIT ?",
            (household_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def latest_checkin(self, household_id: str, before_id: int | None = None) -> dict | None:
        """before_id 为 None 时返回最近一次；否则返回该次之前（不含）的最近一次。"""
        if before_id is None:
            row = self.conn.execute(
                "SELECT id, created_at, overall_risk, item_count, report_json FROM checkins "
                "WHERE household_id = ? ORDER BY id DESC LIMIT 1", (household_id,)).fetchone()
        else:
            row = self.conn.execute(
                "SELECT id, created_at, overall_risk, item_count, report_json FROM checkins "
                "WHERE household_id = ? AND id < ? ORDER BY id DESC LIMIT 1",
                (household_id, before_id)).fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["report"] = json.loads(d.pop("report_json"))
        except json.JSONDecodeError:
            d["report"] = {}
        return d

    def count_items_newer_than(self, household_id: str, since: str | None) -> int:
        """某时刻之后新入档的物品数（since 为 None 表示全部）。"""
        if since is None:
            row = self.conn.execute(
                "SELECT COUNT(*) AS n FROM household_items WHERE household_id = ?",
                (household_id,)).fetchone()
        else:
            row = self.conn.execute(
                "SELECT COUNT(*) AS n FROM household_items WHERE household_id = ? AND created_at > ?",
                (household_id, since)).fetchone()
        return int(row["n"])

    def upsert_product(self, barcode: str | None, name: str, brand: str | None = None, manufacturer: str | None = None, category: str | None = None, safety: dict | None = None) -> int:
        self.conn.execute(
            "INSERT INTO products(barcode,name,brand,manufacturer,category,safety_json) VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(barcode) DO UPDATE SET name=excluded.name,brand=excluded.brand,manufacturer=excluded.manufacturer,category=excluded.category,safety_json=excluded.safety_json",
            (barcode, name, brand, manufacturer, category, json.dumps(safety or {}, ensure_ascii=False)),
        )
        self.conn.commit()
        if barcode:
            return int(self.conn.execute("SELECT id FROM products WHERE barcode=?", (barcode,)).fetchone()[0])
        return int(self.conn.execute("SELECT last_insert_rowid()").fetchone()[0])
