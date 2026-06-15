import os

GRADE_FACTOR = {"A": 0.70, "B": 0.55, "C": 0.35, "D": 0.05, "REVIEW": 0.0}
HIGH_VALUE = {"phone", "laptop", "appliance", "kettle"}
GENERAL_ECOMMERCE_AOV_LOW_INR = 800
GENERAL_ECOMMERCE_AOV_HIGH_INR = 1200
DEFAULT_GENERAL_ECOMMERCE_AOV_INR = 1000


def general_ecommerce_aov_inr() -> int:
    raw = os.environ.get("GENERAL_ECOMMERCE_AOV_INR")
    if not raw:
        return DEFAULT_GENERAL_ECOMMERCE_AOV_INR
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_GENERAL_ECOMMERCE_AOV_INR
    return max(GENERAL_ECOMMERCE_AOV_LOW_INR, min(GENERAL_ECOMMERCE_AOV_HIGH_INR, value))


def compute_disposition(item: dict, grade: str, trade_in_requested: bool = False) -> dict:
    grade_factor = GRADE_FACTOR[grade]
    recovered = round(item["original_price_inr"] * grade_factor)
    aov_basis = general_ecommerce_aov_inr()
    portfolio_recovered = round(aov_basis * grade_factor)

    if grade == "REVIEW":
        route = "manual_review"
        credit_inr = 0
    elif trade_in_requested:
        route = "exchange"
        credit_inr = round(recovered * 0.90)
    elif grade in ("A", "B"):
        route = "resell"
        credit_inr = 0
    elif grade == "C":
        route = "refurbish" if item["category"] in HIGH_VALUE else "donate"
        credit_inr = 0
    else:
        route = "recycle"
        credit_inr = 0

    return {
        "disposition": route,
        "recovered_value_inr": recovered,
        "portfolio_recovered_value_inr": portfolio_recovered,
        "portfolio_recovery_basis_inr": aov_basis,
        "portfolio_recovery_aov_low_inr": GENERAL_ECOMMERCE_AOV_LOW_INR,
        "portfolio_recovery_aov_high_inr": GENERAL_ECOMMERCE_AOV_HIGH_INR,
        "recovery_metric_basis": "general_ecommerce_aov",
        "trade_in_credit_inr": credit_inr,
    }
