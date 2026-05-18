"""Sinh seed danh mục địa giới hành chính VN sau cải cách 2025 (2 cấp).

Nguồn chuẩn: danh sách 3321 xã/phường/đặc khu thuộc 34 tỉnh/thành
(GSO / Nghị quyết UBTVQH15, hiệu lực 2025).

Input : file .xls do người dùng cung cấp (cột: Mã, Tên, Cấp, Nghị quyết,
        Mã TP, Tỉnh/Thành Phố).
Output: - db/data/areas_vn_2025.csv      (dữ liệu sạch, version-control)
        - db/migrations/018_areas_vn_2025.sql (upsert idempotent vào catalog.areas)

Chạy lại khi có danh sách mới:
    python db/scripts/gen_areas_vn_2025.py /path/to/danh-sach.xls

Idempotent: migration dùng ON CONFLICT (level, code) DO UPDATE; KHÔNG xoá
các area cũ (tránh vỡ FK từ catalog.stations). Province dùng mã số 2 chữ số,
ward dùng mã số 5 chữ số — khác namespace với province mã chữ cũ.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
DEFAULT_XLS = "/Users/truongpham/Downloads/danh-sach-3321-xa-phuong.xls"
CSV_OUT = REPO / "db" / "data" / "areas_vn_2025.csv"
SQL_OUT = REPO / "db" / "migrations" / "018_areas_vn_2025.sql"


def clean(s: object) -> str:
    return re.sub(r"\s+", " ", str(s).replace("\n", " ")).strip()


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLS
    df = pd.read_excel(src, dtype=str)
    df.columns = ["ma", "ten", "cap", "nq", "ma_tp", "tinh"]
    df = df.dropna(subset=["ma"]).copy()
    for col in ("ma", "ten", "cap", "ma_tp", "tinh"):
        df[col] = df[col].map(clean)

    provinces = (
        df[["ma_tp", "tinh"]]
        .drop_duplicates()
        .sort_values("ma_tp")
        .reset_index(drop=True)
    )
    wards = df[["ma", "ten", "cap", "ma_tp"]].sort_values("ma").reset_index(drop=True)

    # ── CSV (dữ liệu sạch, dễ review/diff) ─────────────────────────────
    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ward_code", "ward_name", "level", "province_code", "province_name"])
        prov_name = dict(zip(provinces.ma_tp, provinces.tinh))
        for r in wards.itertuples(index=False):
            w.writerow([r.ma, r.ten, r.cap, r.ma_tp, prov_name[r.ma_tp]])

    # ── SQL migration (idempotent upsert) ──────────────────────────────
    lines: list[str] = []
    lines.append("-- Migration 018: danh mục địa giới VN 2025 (2 cấp: tỉnh → xã/phường)")
    lines.append("-- Nguồn chuẩn GSO: 34 tỉnh/thành, 3321 xã/phường/đặc khu.")
    lines.append("-- Sinh tự động bởi db/scripts/gen_areas_vn_2025.py — KHÔNG sửa tay.")
    lines.append("-- Idempotent: ON CONFLICT (level, code) DO UPDATE. Không xoá area cũ.")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    # Provinces
    lines.append("INSERT INTO catalog.areas (level, code, name, metadata) VALUES")
    pv = []
    for r in provinces.itertuples(index=False):
        meta = f"jsonb_build_object('source','gso-2025','kind','province')"
        pv.append(
            f"  ('province', {sql_str(r.ma_tp)}, {sql_str(r.tinh)}, {meta})"
        )
    lines.append(",\n".join(pv))
    lines.append(
        "ON CONFLICT (level, code) DO UPDATE SET "
        "name = EXCLUDED.name, metadata = catalog.areas.metadata || EXCLUDED.metadata, "
        "updated_at = now();"
    )
    lines.append("")

    # Wards (parent gán sau bằng UPDATE join — tránh 3321 subquery tương quan)
    lines.append("INSERT INTO catalog.areas (level, code, name, metadata) VALUES")
    wv = []
    for r in wards.itertuples(index=False):
        meta = (
            "jsonb_build_object('source','gso-2025','cap',"
            f"{sql_str(r.cap)},'province_code',{sql_str(r.ma_tp)})"
        )
        wv.append(f"  ('ward', {sql_str(r.ma)}, {sql_str(r.ten)}, {meta})")
    lines.append(",\n".join(wv))
    lines.append(
        "ON CONFLICT (level, code) DO UPDATE SET "
        "name = EXCLUDED.name, metadata = catalog.areas.metadata || EXCLUDED.metadata, "
        "updated_at = now();"
    )
    lines.append("")

    # Gán parent cho ward = province tương ứng
    lines.append("UPDATE catalog.areas w")
    lines.append("SET parent_id = p.id, updated_at = now()")
    lines.append("FROM catalog.areas p")
    lines.append("WHERE w.level = 'ward'")
    lines.append("  AND w.metadata->>'source' = 'gso-2025'")
    lines.append("  AND p.level = 'province'")
    lines.append("  AND p.code = w.metadata->>'province_code'")
    lines.append("  AND (w.parent_id IS DISTINCT FROM p.id);")
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    SQL_OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"provinces={len(provinces)} wards={len(wards)}")
    print(f"wrote {CSV_OUT.relative_to(REPO)}")
    print(f"wrote {SQL_OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
