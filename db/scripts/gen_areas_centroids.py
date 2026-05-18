"""Suy toạ độ centroid cho từng xã/phường (catalog.areas level=ward) từ
ranh giới GeoJSON xã 2025, để dashboard/grid có thể gắn dữ liệu phân tích
theo từng địa phương.

Nguồn ranh giới: air-quality-fe/public/vn-wards.geojson (OSM, mô hình 2 cấp
2025). GeoJSON KHÔNG có mã GSO → khớp theo (tên tỉnh đã bỏ tiền tố) + (tên
xã). Toạ độ dùng representative_point() (đảm bảo nằm trong ranh giới, an
toàn hơn centroid với hình lõm).

Output:
  - db/migrations/019_areas_vn_2025_centroids.sql  (UPDATE idempotent theo mã xã)

Chạy: python db/scripts/gen_areas_centroids.py [path/to/vn-wards.geojson]
Idempotent: chỉ UPDATE center_lat/lng, dùng được nhiều lần.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import psycopg2
from shapely.geometry import shape

REPO = Path(__file__).resolve().parents[2]
DEFAULT_GEOJSON = (
    REPO.parent / "air-quality-fe" / "public" / "vn-wards.geojson"
)
SQL_OUT = REPO / "db" / "migrations" / "019_areas_vn_2025_centroids.sql"
DB_URL = "postgresql://postgres:postgres@localhost:5432/sky_pulse"

_PREFIX = re.compile(r"^(thành phố|tỉnh|tp\.?)\s+", re.IGNORECASE)


def norm(s: object) -> str:
    return re.sub(r"\s+", " ", str(s)).strip().casefold()


def prov_key(s: object) -> str:
    return _PREFIX.sub("", norm(s)).strip()


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_GEOJSON
    gj = json.loads(src.read_text(encoding="utf-8"))

    geo: dict[tuple[str, str], tuple[float, float]] = {}
    for ft in gj["features"]:
        p = ft["properties"]
        pk = prov_key(p.get("province_name") or "")
        wn = norm(p.get("name") or p.get("shapeName") or "")
        if not pk or not wn:
            continue
        rp = shape(ft["geometry"]).representative_point()
        geo[(pk, wn)] = (round(rp.y, 6), round(rp.x, 6))

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT a.code, a.name, p.name AS prov
        FROM catalog.areas a
        JOIN catalog.areas p ON p.id = a.parent_id
        WHERE a.level = 'ward' AND a.metadata->>'source' = 'gso-2025'
        """
    )
    rows = cur.fetchall()

    updates: list[tuple[str, float, float]] = []
    unmatched: list[tuple[str, str]] = []
    for code, name, prov in rows:
        hit = geo.get((prov_key(prov), norm(name)))
        if hit:
            updates.append((code, hit[0], hit[1]))
        else:
            unmatched.append((prov, name))

    # Áp vào DB
    for code, lat, lng in updates:
        cur.execute(
            "UPDATE catalog.areas SET center_lat=%s, center_lng=%s, updated_at=now() "
            "WHERE level='ward' AND code=%s",
            (lat, lng, code),
        )
    conn.commit()

    # Sinh migration tái lập (không cần python/shapely ở prod)
    lines = [
        "-- Migration 019: toạ độ centroid xã/phường VN 2025",
        "-- Sinh tự động bởi db/scripts/gen_areas_centroids.py — KHÔNG sửa tay.",
        "-- Suy từ air-quality-fe/public/vn-wards.geojson (representative_point).",
        "-- Idempotent: chỉ UPDATE center_lat/lng theo mã xã.",
        "",
        "BEGIN;",
        "",
    ]
    for code, lat, lng in updates:
        lines.append(
            f"UPDATE catalog.areas SET center_lat={lat}, center_lng={lng}, "
            f"updated_at=now() WHERE level='ward' AND code='{code}';"
        )
    lines += ["", "COMMIT;", ""]
    SQL_OUT.write_text("\n".join(lines), encoding="utf-8")

    total = len(rows)
    print(f"matched={len(updates)} ({len(updates) * 100 // total}%) "
          f"unmatched={len(unmatched)} of {total}")
    if unmatched:
        print("unmatched (giữ NULL):")
        for pr, nm in unmatched[:40]:
            print(f"  {pr} | {nm}")
    print(f"wrote {SQL_OUT.relative_to(REPO)}")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
