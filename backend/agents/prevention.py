from db.dynamo import get_item, put_item, update_item


def predict_listing_flag(item: dict) -> None:
    """
    Called at item creation time, before grading starts.
    If the same listing_id already has a flag from prior returns of this product,
    the existing record stays live — PDP widget fires immediately on new inventory.
    """
    existing = get_item("ListingFlags", {"listing_id": item["listing_id"]})
    if existing and existing.get("return_count_for_reason", 0) >= 1:
        pass  # flag already live; do not increment — grading will do that if needed


def correct_listing(item: dict, grading: dict) -> None:
    """
    Supply-side correction: update the Items record with detected (real) values
    so the item cannot be re-listed with the original wrong attributes.
    """
    updates = {}
    if grading["size_mismatch"]:
        updates["listed_size"] = grading["detected_size"]
    if grading["color_mismatch"]:
        updates["listed_color"] = grading["detected_color"]
    if updates:
        update_item("Items", {"item_id": item["item_id"]}, updates)


def write_listing_flag(item: dict, grading: dict) -> None:
    """
    Demand-side prevention: write/update the ListingFlags record for the
    original product listing so the PDP widget can show the warning.
    Read-then-write (not an atomic counter) — sufficient for demo scale.
    """
    if not (grading["size_mismatch"] or grading["color_mismatch"]):
        return

    flag_type = "size" if grading["size_mismatch"] else "color"
    rec = get_item("ListingFlags", {"listing_id": item["listing_id"]}) or {}
    count = rec.get("return_count_for_reason", 0) + 1

    if flag_type == "size":
        recommendation = f"Runs small — {count} buyers found this. Consider sizing up."
    else:
        recommendation = f"Color may differ from photos — {count} buyers noted this."

    put_item("ListingFlags", {
        "listing_id": item["listing_id"],
        "flag_type": flag_type,
        "evidence": grading["mismatch_notes"],
        "return_count_for_reason": count,
        "recommendation": recommendation,
        "last_item_id": item["item_id"],
    })
