"""Indian Financial Calendar & Covariate Engine for Python runtime and Strands agent.

Captures:
- Indian festivals (Diwali, Dhanteras, Navratri, Dussehra, Eid, etc.)
- Mega e-commerce sales (Flipkart Big Billion Days, Amazon Great Indian Festival)
- Statutory tax drain dates (GSTR-3B on 20th, TDS on 7th, Advance Tax on 15th)
- Banking holidays and weekend settlement friction
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any


@dataclass(frozen=True)
class IndianFestival:
    name: str
    category: str
    start_date: str
    end_date: str
    inflow_multiplier: float
    outflow_uplift: float
    description: str


INDIAN_FESTIVALS: list[IndianFestival] = [
    IndianFestival(
        name="Holi Festive Shopping",
        category="FESTIVAL_PEAK",
        start_date="2026-03-01",
        end_date="2026-03-05",
        inflow_multiplier=1.4,
        outflow_uplift=15000.0,
        description="Holi festival retail demand surge for sweets, apparel, and FMCG.",
    ),
    IndianFestival(
        name="Eid-ul-Fitr Celebrations",
        category="FESTIVAL_PEAK",
        start_date="2026-03-18",
        end_date="2026-03-22",
        inflow_multiplier=1.6,
        outflow_uplift=25000.0,
        description="High cash flow surge in retail apparel, footwear, and consumer goods.",
    ),
    IndianFestival(
        name="Raksha Bandhan",
        category="FESTIVAL_PEAK",
        start_date="2026-08-26",
        end_date="2026-08-29",
        inflow_multiplier=1.5,
        outflow_uplift=20000.0,
        description="Surge in gifts, confectionery, and retail footfall.",
    ),
    IndianFestival(
        name="Ganesh Chaturthi",
        category="FESTIVAL_PEAK",
        start_date="2026-09-12",
        end_date="2026-09-16",
        inflow_multiplier=1.45,
        outflow_uplift=20000.0,
        description="Festive purchasing peak across Western & Southern Indian markets.",
    ),
    IndianFestival(
        name="Great Indian Festival & Big Billion Days (BBD)",
        category="MEGA_SALE",
        start_date="2026-09-26",
        end_date="2026-10-06",
        inflow_multiplier=2.2,
        outflow_uplift=80000.0,
        description="Nationwide retail discounting and consumer shopping frenzy.",
    ),
    IndianFestival(
        name="Navratri & Durga Puja",
        category="FESTIVAL_PEAK",
        start_date="2026-10-11",
        end_date="2026-10-19",
        inflow_multiplier=1.9,
        outflow_uplift=40000.0,
        description="9-day sustained retail purchasing surge across all MSME sectors.",
    ),
    IndianFestival(
        name="Dussehra (Vijayadashami)",
        category="FESTIVAL_PEAK",
        start_date="2026-10-20",
        end_date="2026-10-21",
        inflow_multiplier=2.1,
        outflow_uplift=25000.0,
        description="Auspicious purchase day for electronics, vehicles, and capital goods.",
    ),
    IndianFestival(
        name="Dhanteras Auspicious Buying",
        category="FESTIVAL_PEAK",
        start_date="2026-10-27",
        end_date="2026-10-29",
        inflow_multiplier=3.2,
        outflow_uplift=60000.0,
        description="Highest single-day retail cash velocity of the fiscal year.",
    ),
    IndianFestival(
        name="Diwali (Deepavali) Peak",
        category="FESTIVAL_PEAK",
        start_date="2026-10-30",
        end_date="2026-11-03",
        inflow_multiplier=2.8,
        outflow_uplift=50000.0,
        description="Grand festive gifting, bonuses, and maximum annual sales volume.",
    ),
    IndianFestival(
        name="Winter Wedding Season Surge",
        category="FESTIVAL_PEAK",
        start_date="2026-11-20",
        end_date="2026-12-15",
        inflow_multiplier=1.65,
        outflow_uplift=45000.0,
        description="Sustained wholesale and retail wedding purchases (apparel, jewelry, catering).",
    ),
]


def get_date_context(target_date: date | str) -> dict[str, Any]:
    """Return Indian market features for a given date."""
    if isinstance(target_date, str):
        dt = date.fromisoformat(target_date)
    else:
        dt = target_date

    iso_str = dt.isoformat()
    day = dt.day
    month = dt.month
    weekday = dt.weekday()  # Monday is 0, Sunday is 6

    active_festivals = [
        f.name for f in INDIAN_FESTIVALS if f.start_date <= iso_str <= f.end_date
    ]
    max_multiplier = max(
        [f.inflow_multiplier for f in INDIAN_FESTIVALS if f.start_date <= iso_str <= f.end_date],
        default=1.0,
    )

    # Weekend lift
    if weekday in (5, 6):
        max_multiplier *= 1.25

    # Statutory tax check
    is_statutory = False
    statutory_name = None
    if day == 7:
        is_statutory = True
        statutory_name = "TDS Monthly Deposit (Section 194C/J)"
    elif day == 15:
        if month in (3, 6, 9, 12):
            is_statutory = True
            q_num = {3: 4, 6: 1, 9: 2, 12: 3}[month]
            statutory_name = f"Advance Tax Q{q_num} & EPFO/ESIC Deposit"
        else:
            is_statutory = True
            statutory_name = "EPFO / ESIC Monthly Remittance"
    elif day == 20:
        is_statutory = True
        statutory_name = "GSTR-3B Monthly Tax Challan Settlement"

    return {
        "date": iso_str,
        "is_festival": len(active_festivals) > 0,
        "active_festivals": active_festivals,
        "inflow_multiplier": round(max_multiplier, 2),
        "is_statutory_drain": is_statutory,
        "statutory_name": statutory_name,
        "day_of_week": weekday,
    }
