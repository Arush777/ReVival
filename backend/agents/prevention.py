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
    # Only overwrite with a CONFIDENT detection. A vision model often flags a
    # mismatch while reporting detected_size/color="unknown" (e.g. it can't read
    # a jeans waist tag) — overwriting with "unknown" would render "Size:
    # unknown" on the resold listing. Keep the original listed value in that case.
    detected_size = (grading.get("detected_size") or "").strip()
    if grading["size_mismatch"] and detected_size and detected_size.lower() != "unknown":
        updates["listed_size"] = grading["detected_size"]
    detected_color = (grading.get("detected_color") or "").strip()
    if grading["color_mismatch"] and detected_color and detected_color.lower() != "unknown":
        updates["listed_color"] = grading["detected_color"]
    if updates:
        update_item("Items", {"item_id": item["item_id"]}, updates)


def write_listing_flag(item: dict, grading: dict, text_discrepancy: dict | None = None) -> None:
    """
    Demand-side prevention: write/update the ListingFlags record for the
    original product listing so the PDP widget can show the warning.
    Read-then-write (not an atomic counter) — sufficient for demo scale.

    Two complementary signals are OR-ed together:
      * VISUAL  — grading compared the photos against the listed size/colour.
      * CLAIM   — the discrepancy agent compared the seller's written
                  description against what the returner reported (text-vs-text).
    A claim-only discrepancy (photos look fine, but the returner says the colour
    was wrong) still produces a flag.
    """
    text_discrepancy = text_discrepancy or {}

    visual_size = bool(grading.get("size_mismatch"))
    visual_color = bool(grading.get("color_mismatch"))
    claim_size = bool(text_discrepancy.get("size_mismatch"))
    claim_color = bool(text_discrepancy.get("color_mismatch"))
    claim_condition = bool(text_discrepancy.get("condition_mismatch"))

    size = visual_size or claim_size
    color = visual_color or claim_color
    condition = claim_condition

    if not (size or color or condition):
        return

    # Pick the dominant flag type. Colour and size carry dedicated PDP copy;
    # condition is the catch-all claim discrepancy.
    if color:
        flag_type = "color"
    elif size:
        flag_type = "size"
    else:
        flag_type = "condition"

    # flag_source lets the PDP distinguish a photo-detected issue from a
    # seller-vs-returner claim discrepancy.
    visual_hit = (flag_type == "size" and visual_size) or (flag_type == "color" and visual_color)
    claim_hit = (
        (flag_type == "size" and claim_size)
        or (flag_type == "color" and claim_color)
        or (flag_type == "condition" and claim_condition)
    )
    flag_source = "both" if (visual_hit and claim_hit) else ("visual" if visual_hit else "claim")

    rec = get_item("ListingFlags", {"listing_id": item["listing_id"]}) or {}
    count = rec.get("return_count_for_reason", 0) + 1

    if flag_type == "size":
        recommendation = f"Runs small — {count} buyers found this. Consider sizing up."
    elif flag_type == "color":
        recommendation = f"Color may differ from listing — {count} buyers noted this."
    else:
        recommendation = f"Condition may differ from listing — {count} buyers noted this."

    # Prefer the claim agent's specific note (e.g. "Listing said X; returner
    # reported Y") when present; fall back to the visual mismatch note.
    evidence = text_discrepancy.get("notes") or grading.get("mismatch_notes", "")

    put_item("ListingFlags", {
        "listing_id": item["listing_id"],
        "flag_type": flag_type,
        "flag_source": flag_source,
        "evidence": evidence,
        "return_count_for_reason": count,
        "recommendation": recommendation,
        "last_item_id": item["item_id"],
    })


def write_catalog_listing_flag(listing_id: str, catalog_id: str, audit: dict) -> None:
    """
    Write a ListingFlag for a new product listing where the AI detected a
    description-vs-image mismatch.  Unlike write_listing_flag this is a
    pre-purchase audit signal — there is no return count.

    Only called when audit["has_mismatch"] is True and confidence != "low".
    """
    if not audit.get("has_mismatch") or audit.get("confidence") == "low":
        return

    raw_flag_type = audit.get("flag_type", "type")
    flag_type = "color" if raw_flag_type == "color" else "condition"

    detected = audit.get("detected", "")
    claimed = audit.get("claimed", "")

    if flag_type == "color":
        recommendation = (
            f"AI detected colour mismatch — photo shows {detected} "
            f"but listing says {claimed}."
        )
    else:
        recommendation = (
            "AI detected a potential mismatch between the product photo "
            "and the listing description."
        )

    put_item("ListingFlags", {
        "listing_id": listing_id,
        "flag_type": flag_type,
        "flag_source": "listing_audit",
        "evidence": audit.get("mismatch_description", ""),
        "return_count_for_reason": 0,
        "recommendation": recommendation,
        "catalog_id": catalog_id,
    })
