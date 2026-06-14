GRADE_FACTOR = {"A": 0.70, "B": 0.55, "C": 0.35, "D": 0.05, "REVIEW": 0.0}
HIGH_VALUE = {"phone", "laptop", "appliance", "kettle"}


def compute_disposition(item: dict, grade: str, trade_in_requested: bool = False) -> dict:
    recovered = round(item["original_price_inr"] * GRADE_FACTOR[grade])

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
        "trade_in_credit_inr": credit_inr,
    }
