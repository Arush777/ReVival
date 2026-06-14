import math
import json
import os

_base = os.path.join(os.path.dirname(__file__), "..", "seed", "reference")
with open(os.path.join(_base, "city_coords.json")) as f:
    CITY_COORDS = json.load(f)
with open(os.path.join(_base, "demand_table.json")) as f:
    DEMAND_TABLE = json.load(f)


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def buyer_price(buyer: dict, base_price_inr: int, item: dict) -> int:
    hub = CITY_COORDS.get(item["return_hub_city"], [20.0, 78.0])
    dist = haversine(hub[0], hub[1], buyer["lat"], buyer["lng"])
    proximity_discount = min(0.25, max(0, 0.25 * (1 - dist / 1500)))
    demand = DEMAND_TABLE.get(buyer["region"], {}).get(item["category"], 0.3)
    demand_factor = 1 + 0.2 * demand
    return round(base_price_inr * (1 - proximity_discount) * demand_factor)


# Grade factors for circular listing price recommendation (seller-facing, not internal recovery)
_LISTING_GRADE_FACTORS = {"A": 0.70, "B": 0.55, "C": 0.40, "D": 0.20}


def recommend_circular_price(
    original_price: int,
    grade: str,
    category: str,
    region: str,
) -> dict:
    """
    Compute a recommended listing price for a circular-economy resale.
    RecPrice = OriginalPrice × GradeFactor × DemandFactor

    DemandFactor linearly maps the demand_table signal (0.5–0.95) to [0.8, 1.1].
    Returns a breakdown dict for XAI transparency.
    """
    grade_factor = _LISTING_GRADE_FACTORS.get(grade.upper(), 0.40)

    raw_demand = DEMAND_TABLE.get(region, {}).get(category.lower())
    if raw_demand is None:
        demand_factor = 1.0
    else:
        demand_factor = round(max(0.8, min(1.1, 0.8 + (raw_demand - 0.5) / 0.45 * 0.3)), 3)

    recommended_price = round(original_price * grade_factor * demand_factor)
    return {
        "grade_factor": grade_factor,
        "demand_factor": demand_factor,
        "recommended_price": recommended_price,
    }
