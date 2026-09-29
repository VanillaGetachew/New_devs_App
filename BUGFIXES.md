# Bug Fixes — Property Revenue Dashboard

## Bugs Found & Fixed

### 1. Multi-tenant cache leak (Client B / Ocean Rentals privacy issue)

**Symptom:** Refreshing the dashboard sometimes showed another company's revenue.

**Root cause:** Redis cache key was only `revenue:{property_id}`. Both tenants share `prop-001` (Beach House Alpha vs Mountain Lodge Beta), so Tenant A's cached payload was served to Tenant B.

**Fix:** Scope the cache key by tenant: `revenue:{tenant_id}:{property_id}[:YYYY-MM]`.

**File:** `backend/app/services/cache.py`

---

### 2. March revenue mismatch (Client A / Sunset Properties timezone issue)

**Symptom:** March totals did not match Sunset's internal records.

**Root cause:** Month boundaries were built as naive UTC datetimes. Seed reservation `res-tz-1` checks in at `2024-02-29 23:30:00+00`, which is **March 1 00:30 in Europe/Paris** (property timezone). UTC-based filtering put it in February; the client's local books correctly put it in March (+€1,250).

**Fix:** Compute `[month_start, month_end)` in the property's IANA timezone (`Europe/Paris`, `America/New_York`, …) and compare aware timestamps. Dashboard defaults to March 2024 (seeded period).

**Files:** `backend/app/services/reservations.py`, `backend/app/api/v1/dashboard.py`

---

### 3. Off-by-a-few-cents totals (float precision)

**Symptom:** Finance saw totals slightly off by cents.

**Root cause:** `float(revenue_data['total'])` in the dashboard API (and `Math.round(n * 100) / 100` on the frontend) used IEEE-754 floats. Amounts like `333.333 + 333.333 + 333.334` are exact in `Decimal` / `NUMERIC(10,3)` but not in `float`.

**Fix:** Keep totals as `Decimal` → string end-to-end; format display without float rounding.

**Files:** `backend/app/api/v1/dashboard.py`, `backend/app/services/reservations.py`, `frontend/src/components/RevenueSummary.tsx`

---

## Additional hardening

- Dashboard property list filtered by authenticated tenant (shared `prop-001` IDs no longer mix brands).
- DB pool uses `DATABASE_URL` from docker-compose.
- Offline seed-aware fallbacks remain tenant-scoped for challenge mode when DB is down.

## How to verify

```bash
docker-compose up --build
```

1. Login as **Sunset** (`sunset@propertyflow.com` / `client_a_2024`) → `prop-001` March total **2250.00** (includes timezone edge reservation).
2. Login as **Ocean** (`ocean@propertyflow.com` / `client_b_2024`) → `prop-001` March total **0.00** (their Mountain Lodge has no reservations); refresh repeatedly — never see Sunset numbers.
3. Sunset `prop-001` sub-cent amounts display as exact **2,250.00** (not 2249.99 / 2250.01).
