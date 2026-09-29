import json
import redis.asyncio as redis
from typing import Dict, Any, Optional
import os

# Initialize Redis client (typically configured centrally).
redis_client = redis.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))

async def get_revenue_summary(
    property_id: str,
    tenant_id: str,
    month: Optional[int] = None,
    year: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fetches revenue summary, utilizing caching to improve performance.

    Cache keys are tenant-scoped so tenants that share property IDs
    (e.g. both have prop-001) never receive each other's cached totals.
    """
    # BUG FIX: include tenant_id so multi-tenant data cannot leak across clients
    period = f":{year}-{month:02d}" if month and year else ""
    cache_key = f"revenue:{tenant_id}:{property_id}{period}"

    # Try to get from cache
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception as e:
        print(f"Cache read error (continuing without cache): {e}")

    # Revenue calculation is delegated to the reservation service.
    from app.services.reservations import calculate_total_revenue, calculate_monthly_revenue

    if month and year:
        from app.services.reservations import get_property_timezone

        timezone = await get_property_timezone(property_id, tenant_id)
        monthly_total = await calculate_monthly_revenue(
            property_id=property_id,
            month=month,
            year=year,
            tenant_id=tenant_id,
            timezone=timezone,
        )
        # Also get reservation count for the same period via total helper metadata
        base = await calculate_total_revenue(
            property_id, tenant_id, month=month, year=year, timezone=timezone
        )
        result = {
            "property_id": property_id,
            "tenant_id": tenant_id,
            "total": str(monthly_total),
            "currency": base.get("currency", "USD"),
            "count": base.get("count", 0),
            "month": month,
            "year": year,
            "timezone": timezone,
        }
    else:
        result = await calculate_total_revenue(property_id, tenant_id)

    # Cache the result for 5 minutes
    try:
        await redis_client.setex(cache_key, 300, json.dumps(result))
    except Exception as e:
        print(f"Cache write error (continuing without cache): {e}")

    return result
