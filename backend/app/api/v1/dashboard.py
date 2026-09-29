from fastapi import APIRouter, Depends, Query
from typing import Dict, Any, Optional, Union
from decimal import Decimal
from app.services.cache import get_revenue_summary
from app.core.auth import authenticate_request as get_current_user

router = APIRouter()


@router.get("/dashboard/summary")
async def get_dashboard_summary(
    property_id: str,
    month: Optional[int] = Query(None, ge=1, le=12, description="Calendar month (1-12)"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Calendar year"),
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Returns revenue for a property belonging to the authenticated tenant.

    Money is returned as a string (Decimal-serialized) to avoid IEEE-754
    float rounding that was producing off-by-a-few-cents totals.
    """
    # Prefer attribute access on AuthenticatedUser; fall back safely
    tenant_id = getattr(current_user, "tenant_id", None) or "default_tenant"

    # Default the dashboard to March 2024 (seeded reporting period) when
    # the UI asks for monthly insights without explicit params.
    if month is None and year is None:
        month, year = 3, 2024

    revenue_data = await get_revenue_summary(
        property_id, tenant_id, month=month, year=year
    )

    # BUG FIX: do NOT cast money to float — keep exact Decimal as string
    total = revenue_data["total"]
    if isinstance(total, (int, float, Decimal)):
        total_revenue: Union[str, Decimal] = str(Decimal(str(total)))
    else:
        total_revenue = str(total)

    return {
        "property_id": revenue_data["property_id"],
        "tenant_id": tenant_id,
        "total_revenue": total_revenue,
        "currency": revenue_data["currency"],
        "reservations_count": revenue_data["count"],
        "month": revenue_data.get("month", month),
        "year": revenue_data.get("year", year),
        "timezone": revenue_data.get("timezone"),
    }
