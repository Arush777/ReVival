import json
import os

_base = os.path.join(os.path.dirname(__file__), "..", "seed", "reference")
with open(os.path.join(_base, "carbon_table.json")) as f:
    CARBON_TABLE = json.load(f)


def compute_credits(item: dict, grading: dict, nearest_buyer_dist_km: float) -> dict:
    carbon = CARBON_TABLE.get(item["category"], {"manufacturing_kg_co2": 10.0, "weight_kg": 0.5})
    co2_manufacturing = carbon["manufacturing_kg_co2"]
    avg_distance_km = 1200
    shipping_saved = max(0, avg_distance_km - nearest_buyer_dist_km)
    co2_shipping = shipping_saved * carbon["weight_kg"] * 0.0001
    co2_saved_kg = round(co2_manufacturing + co2_shipping, 1)
    credits = round(co2_saved_kg * 10)
    return {"co2_saved_kg": co2_saved_kg, "credits": credits}
