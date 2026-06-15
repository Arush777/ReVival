import io
import json
import os
import re
import subprocess
import tempfile

import boto3
from PIL import Image, ImageOps

from cache import embed_image_set, image_vector_cache_get, image_vector_cache_put

MODEL_ID = os.environ["BEDROCK_VISION_MODEL_ID"]
RUBRIC_VERSION = "v2-condition-rubric"
PROMPT_VERSION = "v2"

VALID_GRADES = {"A", "B", "C", "D", "REVIEW"}
VALID_GRADE_BUCKETS = {"new_like", "light_wear", "visible_wear", "not_resellable", "insufficient_evidence"}
VALID_CONFIDENCE = {"high", "medium", "low"}
VALID_FUNCTIONAL = {"works", "not_working", "not_applicable", "unknown"}
VALID_WEAR_LEVELS = {"none", "minor", "moderate", "heavy", "unknown"}

FUNCTION_SENSITIVE = {"phone", "laptop", "appliance", "headphones", "kettle"}
HYGIENE_SENSITIVE = {"food", "beauty", "personal_care"}

_STABLE_FIELDS = [
    "item_id", "category", "brand", "name",
    "listed_size", "listed_color",
    "return_reason_code", "return_reason_text",
    "history_note", "seller_claimed_condition",
]
_VECTOR_CACHE_METADATA_FIELDS = [f for f in _STABLE_FIELDS if f != "item_id"]

_ref = os.path.join(os.path.dirname(__file__), "..", "seed", "reference")
with open(os.path.join(_ref, "size_standard_map.json")) as _f:
    _SIZE_MAP = json.load(_f)

_s3 = boto3.client("s3", region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"))
_bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"),
)

_SYSTEM_PROMPT = (
    "You are a product-condition grader for Amazon Second Life Commerce.\n"
    "You receive one or more photos of a returned item plus what the seller's listing claimed.\n"
    "Your job is to assign the condition grade using product-specific judgment from the evidence.\n"
    "\n"
    "Use this universal resale rubric:\n"
    "A = New-like/open-box. Fully usable, no meaningful wear, no safety/hygiene issue, no critical missing part.\n"
    "B = Fully usable with light cosmetic wear or minor non-critical issues. No repair needed before resale.\n"
    "C = Usable but visibly worn, needs cleaning/minor repair, or has a non-critical missing accessory. Still safe and honest to resell/refurbish.\n"
    "D = Not currently resellable: non-functional, unsafe, expired/contaminated/open hygiene-sensitive item, major damage, counterfeit concern, or critical missing component.\n"
    "REVIEW = Evidence is insufficient or ambiguous, especially for high-value, safety-sensitive, food, beauty, or electronic items.\n"
    "\n"
    "Rules:\n"
    "- Grade the actual item shown, not the ideal catalog product.\n"
    "- Do not invent damage that is not visible or stated.\n"
    "- If photos cannot prove a safety/function claim that is necessary for resale, use REVIEW.\n"
    "- Use only the enum values in the schema. Do not output decimals or free-form scores.\n"
    "- Respond ONLY with valid JSON matching the exact schema. Do not add fields."
)

_SCHEMA_TEXT = (
    '{\n'
    '  "grade": "A|B|C|D|REVIEW",\n'
    '  "grade_bucket": "new_like|light_wear|visible_wear|not_resellable|insufficient_evidence",\n'
    '  "confidence_bucket": "high|medium|low",\n'
    '  "detected_category": "<string>",\n'
    '  "functional_status": "works|not_working|not_applicable|unknown",\n'
    '  "safety_or_hygiene_blocker": <true|false>,\n'
    '  "critical_missing_parts": ["<string>"],\n'
    '  "wear_level": "none|minor|moderate|heavy|unknown",\n'
    '  "defects": [{"type": "<brief name>", "severity": "minor|moderate|major", "evidence": "<visible/text evidence>"}],\n'
    '  "detected_color": "<string>",\n'
    '  "detected_size": "<string or \'unknown\'>",\n'
    '  "size_mismatch": <true|false>,\n'
    '  "color_mismatch": <true|false>,\n'
    '  "mismatch_notes": "<empty string if no mismatch>",\n'
    '  "evidence": ["<short objective observation>", "<short objective observation>"]\n'
    '}'
)


def _process_single_image(raw_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw_bytes))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > 1600:
        if w >= h:
            new_w, new_h = 1600, round(h * 1600 / w)
        else:
            new_h, new_w = 1600, round(w * 1600 / h)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def canonicalize_grade_input(item: dict, photo_bytes_by_name: dict[str, bytes]) -> tuple[bytes, str]:
    sorted_keys = sorted(photo_bytes_by_name.keys())
    canonical_images = [_process_single_image(photo_bytes_by_name[k]) for k in sorted_keys]
    canonical_image_bytes = b"".join(canonical_images)

    stable = {f: item.get(f) for f in _STABLE_FIELDS}
    if not stable.get("seller_claimed_condition"):
        stable["seller_claimed_condition"] = "returned_open_box"
    canonical_item_json = json.dumps(stable, sort_keys=True)

    return canonical_image_bytes, canonical_item_json


def _vector_cache_metadata_signature(item: dict) -> str:
    stable = {f: item.get(f) for f in _VECTOR_CACHE_METADATA_FIELDS}
    if not stable.get("seller_claimed_condition"):
        stable["seller_claimed_condition"] = "returned_open_box"
    return json.dumps(stable, sort_keys=True)


def finalize_grade(item: dict, obs: dict) -> str:
    grade = obs["grade"]
    if grade not in VALID_GRADES:
        return "REVIEW"

    if obs["confidence_bucket"] == "low":
        return "REVIEW"

    if obs["safety_or_hygiene_blocker"]:
        return "D"

    if obs["functional_status"] == "not_working":
        return "D"

    if item.get("category") in FUNCTION_SENSITIVE and obs["functional_status"] == "unknown":
        return "REVIEW"

    if item.get("category") in HYGIENE_SENSITIVE and obs["grade"] in {"A", "B", "C"}:
        sealed_or_safe = any(
            "sealed" in e.lower() or "unopened" in e.lower()
            for e in obs.get("evidence", [])
        )
        if not sealed_or_safe:
            return "REVIEW"

    return grade


def _extract_json(text: str) -> dict:
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object in response: {text[:300]}")
    return json.loads(match.group(0))


def _validate_obs(obs: dict) -> None:
    required_fields = [
        "grade", "grade_bucket", "confidence_bucket", "detected_category",
        "functional_status", "safety_or_hygiene_blocker", "critical_missing_parts",
        "wear_level", "defects", "detected_color", "detected_size",
        "size_mismatch", "color_mismatch", "mismatch_notes", "evidence",
    ]
    for field in required_fields:
        if field not in obs:
            raise ValueError(f"Missing required field: {field}")

    if obs["grade"] not in VALID_GRADES:
        raise ValueError(f"Invalid grade: {obs['grade']!r}")
    if obs["grade_bucket"] not in VALID_GRADE_BUCKETS:
        raise ValueError(f"Invalid grade_bucket: {obs['grade_bucket']!r}")
    if obs["confidence_bucket"] not in VALID_CONFIDENCE:
        raise ValueError(f"Invalid confidence_bucket: {obs['confidence_bucket']!r}")
    if obs["functional_status"] not in VALID_FUNCTIONAL:
        raise ValueError(f"Invalid functional_status: {obs['functional_status']!r}")
    if obs["wear_level"] not in VALID_WEAR_LEVELS:
        raise ValueError(f"Invalid wear_level: {obs['wear_level']!r}")


def _normalize_size(item: dict, obs: dict) -> None:
    category = item.get("category", "")
    cat_map = _SIZE_MAP.get(category)
    if not cat_map:
        return

    detected = obs.get("detected_size", "unknown")
    if not detected or detected == "unknown":
        return

    # If detected is a key in the map (e.g. "US 10"), translate it.
    # If not (e.g. model already returned "India 9"), treat it as already
    # normalized — still recompute size_mismatch against the listed size.
    if detected in cat_map:
        normalized_detected = cat_map[detected]
        obs["detected_size"] = normalized_detected
    else:
        normalized_detected = detected

    listed = item.get("listed_size", "")
    normalized_listed = cat_map.get(listed, listed)
    obs["size_mismatch"] = normalized_listed != normalized_detected


def _extract_video_frames(video_path: str, n_frames: int = 5) -> list[bytes]:
    """Extract up to n_frames evenly-spaced JPEG frames from a video using ffmpeg."""
    with tempfile.TemporaryDirectory() as tmpdir:
        out_pattern = os.path.join(tmpdir, "frame_%03d.jpg")
        subprocess.run(
            [
                "ffmpeg", "-i", video_path,
                "-vf", "fps=1",
                "-frames:v", str(n_frames),
                "-q:v", "3",
                out_pattern,
            ],
            capture_output=True,
            check=True,
            timeout=60,
        )
        frames = []
        for fname in sorted(os.listdir(tmpdir)):
            if fname.endswith(".jpg"):
                with open(os.path.join(tmpdir, fname), "rb") as f:
                    frames.append(f.read())
        if not frames:
            raise RuntimeError("ffmpeg produced no frames from video")
        return frames


def _build_user_content(item: dict, canonical_images: list[bytes]) -> list[dict]:
    content = []
    for img_bytes in canonical_images:
        content.append({
            "image": {
                "format": "jpeg",
                "source": {"bytes": img_bytes},
            }
        })

    text = (
        "Listed attributes:\n"
        f"Item name: {item.get('name', '')}\n"
        f"Category: {item.get('category', '')}\n"
        f"Brand: {item.get('brand', '')}\n"
        f"Listed size: {item.get('listed_size', '')}\n"
        f"Listed color: {item.get('listed_color', '')}\n"
        f"Seller claimed condition: {item.get('seller_claimed_condition') or 'returned_open_box'}\n"
        f"Return reason code: {item.get('return_reason_code', '')}\n"
        f"Return reason text: {item.get('return_reason_text', '')}\n"
        f"History note: {item.get('history_note', '')}\n"
        "\nInspect the photos and return exactly:\n"
        + _SCHEMA_TEXT
    )
    content.append({"text": text})
    return content


def _grade_from_bytes(item: dict, photo_bytes_by_name: dict[str, bytes]) -> dict:
    """Core grading logic shared by S3-backed and local-path-backed entry points."""
    sorted_keys = sorted(photo_bytes_by_name.keys())
    canonical_images = [_process_single_image(photo_bytes_by_name[k]) for k in sorted_keys]

    cache_metadata = _vector_cache_metadata_signature(item)

    image_embedding = embed_image_set(canonical_images)
    cached = image_vector_cache_get(
        "grading",
        image_embedding,
        cache_metadata,
        RUBRIC_VERSION,
        MODEL_ID,
    )
    if cached:
        return cached

    content = _build_user_content(item, canonical_images)

    raw_resp = _bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": content}],
        inferenceConfig={"temperature": 0},
    )
    raw_text = raw_resp["output"]["message"]["content"][0]["text"]

    obs = None
    try:
        obs = _extract_json(raw_text)
        _validate_obs(obs)
    except (ValueError, json.JSONDecodeError):
        repair_content = [{
            "text": (
                "The response below was not valid JSON or was missing required fields. "
                "Return ONLY the corrected JSON with no extra text:\n\n" + raw_text
            )
        }]
        repair_resp = _bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": _SYSTEM_PROMPT}],
            messages=[
                {"role": "user", "content": content},
                {"role": "assistant", "content": [{"text": raw_text}]},
                {"role": "user", "content": repair_content},
            ],
            inferenceConfig={"temperature": 0},
        )
        raw_text = repair_resp["output"]["message"]["content"][0]["text"]
        obs = _extract_json(raw_text)
        _validate_obs(obs)

    raw_llm_grade = obs["grade"]
    final_grade = finalize_grade(item, obs)
    _normalize_size(item, obs)

    result = {
        "grade": final_grade,
        "raw_llm_grade": raw_llm_grade,
        "grade_bucket": obs["grade_bucket"],
        "confidence_bucket": obs["confidence_bucket"],
        "detected_category": obs["detected_category"],
        "functional_status": obs["functional_status"],
        "safety_or_hygiene_blocker": obs["safety_or_hygiene_blocker"],
        "critical_missing_parts": obs["critical_missing_parts"],
        "wear_level": obs["wear_level"],
        "defects": obs["defects"],
        "detected_color": obs["detected_color"],
        "detected_size": obs["detected_size"],
        "size_mismatch": obs["size_mismatch"],
        "color_mismatch": obs["color_mismatch"],
        "mismatch_notes": obs["mismatch_notes"],
        "evidence": obs["evidence"],
        "rubric_version": RUBRIC_VERSION,
        "prompt_version": PROMPT_VERSION,
        "model_id": MODEL_ID,
    }

    return image_vector_cache_put(
        "grading",
        image_embedding,
        cache_metadata,
        RUBRIC_VERSION,
        MODEL_ID,
        result,
    )


def grade_item(item: dict, photo_keys: list[str]) -> dict:
    photo_bytes_by_name: dict[str, bytes] = {}
    for key in photo_keys:
        resp = _s3.get_object(Bucket=os.environ["S3_PHOTOS_BUCKET"], Key=key)
        photo_bytes_by_name[key] = resp["Body"].read()
    return _grade_from_bytes(item, photo_bytes_by_name)


def grade_item_from_paths(item: dict, local_paths: list[str]) -> dict:
    """Grade using local file paths — used by the preview endpoint (no S3 upload needed)."""
    photo_bytes_by_name: dict[str, bytes] = {}
    for path in local_paths:
        with open(path, "rb") as f:
            photo_bytes_by_name[path] = f.read()
    return _grade_from_bytes(item, photo_bytes_by_name)


def grade_from_video(item: dict, video_path: str) -> dict:
    """Grade an item by extracting frames from a local video file and running image grading."""
    cache_metadata = _vector_cache_metadata_signature(item)

    frames = _extract_video_frames(video_path)
    canonical_images = [_process_single_image(fb) for fb in frames]
    image_embedding = embed_image_set(canonical_images)
    cached = image_vector_cache_get(
        "grading_video",
        image_embedding,
        cache_metadata,
        RUBRIC_VERSION,
        MODEL_ID,
    )
    if cached:
        return cached

    content = _build_user_content(item, canonical_images)

    raw_resp = _bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": content}],
        inferenceConfig={"temperature": 0},
    )
    raw_text = raw_resp["output"]["message"]["content"][0]["text"]

    obs = None
    try:
        obs = _extract_json(raw_text)
        _validate_obs(obs)
    except (ValueError, json.JSONDecodeError):
        repair_content = [{
            "text": (
                "The response below was not valid JSON or was missing required fields. "
                "Return ONLY the corrected JSON with no extra text:\n\n" + raw_text
            )
        }]
        repair_resp = _bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": _SYSTEM_PROMPT}],
            messages=[
                {"role": "user", "content": content},
                {"role": "assistant", "content": [{"text": raw_text}]},
                {"role": "user", "content": repair_content},
            ],
            inferenceConfig={"temperature": 0},
        )
        raw_text = repair_resp["output"]["message"]["content"][0]["text"]
        obs = _extract_json(raw_text)
        _validate_obs(obs)

    raw_llm_grade = obs["grade"]
    final_grade = finalize_grade(item, obs)
    _normalize_size(item, obs)

    result = {
        "grade": final_grade,
        "raw_llm_grade": raw_llm_grade,
        "grade_bucket": obs["grade_bucket"],
        "confidence_bucket": obs["confidence_bucket"],
        "detected_category": obs["detected_category"],
        "functional_status": obs["functional_status"],
        "safety_or_hygiene_blocker": obs["safety_or_hygiene_blocker"],
        "critical_missing_parts": obs["critical_missing_parts"],
        "wear_level": obs["wear_level"],
        "defects": obs["defects"],
        "detected_color": obs["detected_color"],
        "detected_size": obs["detected_size"],
        "size_mismatch": obs["size_mismatch"],
        "color_mismatch": obs["color_mismatch"],
        "mismatch_notes": obs["mismatch_notes"],
        "evidence": obs["evidence"],
        "rubric_version": RUBRIC_VERSION,
        "prompt_version": PROMPT_VERSION,
        "model_id": MODEL_ID,
    }

    return image_vector_cache_put(
        "grading_video",
        image_embedding,
        cache_metadata,
        RUBRIC_VERSION,
        MODEL_ID,
        result,
    )
