"""
Claim-discrepancy agent (text-vs-text).

Complements the VISUAL grading mismatch in agents/grading.py. Where grading
compares photos against the listed size/colour, this agent compares the
SELLER's written description (what the catalog claimed) against what the
RETURNER actually reported (return reason + free-text comments).

Design goals (the demo must not produce false warnings):
  * temperature 0 + strict enum JSON
  * conservative system prompt: a *preference* ("too tight", "too loud",
    "changed mind") is NOT a discrepancy — only an explicit claim that the
    delivered attribute DIFFERED from the description counts.
  * defaults to NO flag on any parse/validation failure, so a malformed model
    response can never invent a warning.
  * cached by (seller_description, returner account) so re-runs are free.
"""

import json
import os
import re

import boto3

from cache import make_cache_key, cache_get, cache_put

MODEL_ID = os.environ["BEDROCK_TEXT_MODEL_ID"]

_bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"),
)

_SYSTEM = """You audit returned items for honesty of the original listing.

You are given:
  1. The SELLER'S claimed description (what the product listing promised:
     colour, size/fit, material, condition).
  2. The RETURNER'S account: the return reason and any free-text comments.

Decide whether the returner's account states that a SPECIFIC attribute of the
delivered item DIFFERED from what the seller claimed. Evaluate three attributes:

  color_mismatch     — delivered colour ≠ claimed colour.
  size_mismatch      — delivered item was mislabelled / sized differently than
                       claimed (e.g. claimed "true to size 32" but it fits like
                       a 30, or arrived a different labelled size).
  condition_mismatch — delivered condition was worse / different than claimed
                       (e.g. claimed "brand new with tags" but arrived used,
                       stained, or damaged).

CRITICAL RULES — be conservative, never guess:
  * A personal PREFERENCE is NOT a discrepancy. "Felt too tight", "too loud",
    "too spicy", "didn't suit me", "changed my mind", "no longer needed",
    "found a better price", "bought by mistake" → ALL three booleans false.
  * Only set a boolean true when the returner's words clearly contradict a
    SPECIFIC claim in the seller's description. If the seller's description does
    not mention the attribute, or the returner does not contradict it, keep it
    false.
  * "Wrong size" as a return reason means the labelled size was wrong vs the
    claim → size_mismatch true. "Different from what was ordered" or a colour
    complaint contradicting the claimed colour → color_mismatch true.
  * When genuinely unsure, default to false. A false warning is worse than a
    missed one.
  * notes: ONE short sentence quoting the contradiction, e.g.
    'Listing claimed Cloud White; returner reports the pair arrived navy blue.'
    Empty string if no discrepancy.

Respond with ONLY this JSON, no commentary:
{"color_mismatch": <bool>, "size_mismatch": <bool>, "condition_mismatch": <bool>, "notes": "<string>"}"""

_EMPTY = {
    "color_mismatch": False,
    "size_mismatch": False,
    "condition_mismatch": False,
    "notes": "",
}


def _extract_json(text: str) -> dict:
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object in response: {text[:300]!r}")
    return json.loads(match.group(0))


def _coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1")
    return bool(value)


def detect_claim_discrepancy(
    seller_description: str,
    return_reason_text: str,
    return_reason_code: str,
    user_comments: str,
) -> dict:
    """
    Compare the seller's claimed description against the returner's account.
    Returns {color_mismatch, size_mismatch, condition_mismatch, notes}.
    Always returns the full dict; defaults to no-flag on any failure.
    """
    seller_description = (seller_description or "").strip()
    # No claim to compare against → nothing to flag.
    if not seller_description:
        return dict(_EMPTY)

    returner_account = (
        f"Return reason code: {return_reason_code or 'unknown'}\n"
        f"Return reason: {return_reason_text or '(none)'}\n"
        f"Returner comments: {user_comments or '(none)'}"
    )

    cache_key = make_cache_key(
        "claim_discrepancy",
        seller_description.encode(),
        returner_account,
        "v1",
        MODEL_ID,
    )
    cached = cache_get(cache_key)
    if cached:
        return cached

    user_msg = (
        f"SELLER'S CLAIMED DESCRIPTION:\n{seller_description}\n\n"
        f"RETURNER'S ACCOUNT:\n{returner_account}\n\n"
        "Return the JSON verdict."
    )

    try:
        response = _bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": _SYSTEM}],
            messages=[{"role": "user", "content": [{"text": user_msg}]}],
            inferenceConfig={"temperature": 0},
        )
        content_blocks = response["output"]["message"]["content"]
        raw_text = next((c["text"] for c in content_blocks if "text" in c), "")
        obs = _extract_json(raw_text)
        result = {
            "color_mismatch": _coerce_bool(obs.get("color_mismatch")),
            "size_mismatch": _coerce_bool(obs.get("size_mismatch")),
            "condition_mismatch": _coerce_bool(obs.get("condition_mismatch")),
            "notes": str(obs.get("notes", "") or ""),
        }
    except Exception:
        # Never let a model/parse failure invent a warning.
        return dict(_EMPTY)

    cache_put(cache_key, "claim_discrepancy", result)
    return result
