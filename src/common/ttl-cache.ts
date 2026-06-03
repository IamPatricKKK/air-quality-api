/**
 * Bộ nhớ đệm (cache) TTL trong RAM — cực nhẹ, không cần thư viện ngoài.
 *
 * Dùng cho các endpoint đọc công khai (vd /stations, /wards): kết quả được
 * giữ trong `ttlMs` mili-giây, nên hàng nghìn request trong khoảng đó chỉ
 * tốn ĐÚNG 1 query xuống PostgreSQL. Phù hợp deploy 1 container; nếu sau này
 * scale nhiều instance thì thay bằng Redis.
 *
 * Dữ liệu air-quality chỉ đổi theo cron (12h / 3h) nên cache vài chục giây
 * không làm web hiển thị số liệu cũ đáng kể.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expires: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  /** Xoá toàn bộ cache — gọi sau khi ingest ghi dữ liệu mới nếu muốn cập nhật ngay. */
  clear(): void {
    this.store.clear();
  }
}
