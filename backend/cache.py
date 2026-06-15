import base64
import hashlib
import json
import math
import os
import time
import uuid

import boto3
from botocore.exceptions import ClientError

from db.dynamo import from_ddb, get_item, put_item, table

CACHE_TABLE = "GradeCache"
IMAGE_VECTOR_CACHE_TABLE = "ImageVectorCache"

DEFAULT_IMAGE_EMBEDDING_MODEL_ID = "amazon.titan-embed-image-v1"
DEFAULT_IMAGE_EMBEDDING_DIMENSIONS = 256
DEFAULT_IMAGE_SIMILARITY_THRESHOLD = 0.985


def make_cache_key(
    agent_name: str,
    primary_input: bytes,
    secondary_str: str,
    prompt_version: str,
    model_id: str,
) -> str:
    """
    Deterministic key for text-only/cache-control inputs.

    Image agents should use the vector-cache helpers below so visually similar
    inputs can hit cache without requiring byte-identical SHA-256 matches.
    """
    raw = (
        agent_name.encode()
        + b"||"
        + primary_input
        + b"||"
        + secondary_str.encode()
        + b"||"
        + prompt_version.encode()
        + b"||"
        + model_id.encode()
    )
    return hashlib.sha256(raw).hexdigest()


def cache_get(key: str) -> dict | None:
    row = get_item(CACHE_TABLE, {"cache_key": key})
    if row:
        return json.loads(row["result_json"])
    return None


def cache_put(key: str, agent: str, result: dict) -> None:
    put_item(
        CACHE_TABLE,
        {
            "cache_key": key,
            "agent": agent,
            "result_json": json.dumps(result),
        },
    )


def image_embedding_model_id() -> str:
    return os.environ.get(
        "BEDROCK_IMAGE_EMBED_MODEL_ID",
        DEFAULT_IMAGE_EMBEDDING_MODEL_ID,
    )


def image_embedding_dimensions() -> int:
    raw = os.environ.get("IMAGE_EMBEDDING_DIMENSIONS")
    if not raw:
        return DEFAULT_IMAGE_EMBEDDING_DIMENSIONS
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_IMAGE_EMBEDDING_DIMENSIONS
    return value if value in {256, 384, 1024} else DEFAULT_IMAGE_EMBEDDING_DIMENSIONS


def image_similarity_threshold() -> float:
    raw = os.environ.get("IMAGE_CACHE_SIMILARITY_THRESHOLD")
    if not raw:
        return DEFAULT_IMAGE_SIMILARITY_THRESHOLD
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_IMAGE_SIMILARITY_THRESHOLD
    return max(0.0, min(1.0, value))


def _bedrock_runtime():
    return boto3.client(
        "bedrock-runtime",
        region_name=os.environ.get(
            "BEDROCK_REGION",
            os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"),
        ),
    )


def embed_image_bytes(image_bytes: bytes) -> list[float]:
    """
    Generate an image embedding with Amazon Titan Multimodal Embeddings.

    AWS expects a base64-encoded image in `inputImage` and supports output
    lengths of 256, 384, or 1024 dimensions.
    """
    body = json.dumps(
        {
            "inputImage": base64.b64encode(image_bytes).decode("utf-8"),
            "embeddingConfig": {
                "outputEmbeddingLength": image_embedding_dimensions(),
            },
        }
    )
    response = _bedrock_runtime().invoke_model(
        body=body,
        modelId=image_embedding_model_id(),
        accept="application/json",
        contentType="application/json",
    )
    payload = json.loads(response["body"].read())
    message = payload.get("message")
    if message:
        raise RuntimeError(f"Titan image embedding failed: {message}")
    embedding = payload.get("embedding")
    if not isinstance(embedding, list) or not embedding:
        raise RuntimeError("Titan image embedding response did not include an embedding")
    return [float(v) for v in embedding]


def embed_image_set(image_bytes_list: list[bytes]) -> list[float]:
    """
    Embed one or more canonical images and average them into a single vector.

    Titan Multimodal Embeddings accepts one image per request. Averaging keeps
    multi-photo and video-frame cache entries searchable as one vector record.
    """
    embeddings = [embed_image_bytes(image_bytes) for image_bytes in image_bytes_list]
    if not embeddings:
        raise ValueError("Cannot embed an empty image set")
    if len(embeddings) == 1:
        return embeddings[0]

    dimensions = len(embeddings[0])
    averaged = []
    for i in range(dimensions):
        averaged.append(sum(e[i] for e in embeddings) / len(embeddings))
    return averaged


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def _iter_vector_rows() -> list[dict]:
    rows: list[dict] = []
    try:
        resp = table(IMAGE_VECTOR_CACHE_TABLE).scan()
        rows.extend(from_ddb(resp.get("Items", [])))
        while "LastEvaluatedKey" in resp:
            resp = table(IMAGE_VECTOR_CACHE_TABLE).scan(
                ExclusiveStartKey=resp["LastEvaluatedKey"]
            )
            rows.extend(from_ddb(resp.get("Items", [])))
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            return []
        raise
    return rows


def image_vector_cache_get(
    agent: str,
    embedding: list[float],
    metadata_signature: str,
    prompt_version: str,
    model_id: str,
    threshold: float | None = None,
) -> dict | None:
    """
    Return the closest cached result when the image vector is similar enough.

    `metadata_signature` remains an exact guardrail so a visually similar item
    does not reuse a result created with different listing/return context.
    """
    threshold = image_similarity_threshold() if threshold is None else threshold
    embedding_model_id = image_embedding_model_id()
    dimensions = len(embedding)
    best_row = None
    best_score = -1.0

    for row in _iter_vector_rows():
        if row.get("agent") != agent:
            continue
        if row.get("metadata_signature") != metadata_signature:
            continue
        if row.get("prompt_version") != prompt_version:
            continue
        if row.get("model_id") != model_id:
            continue
        if row.get("embedding_model_id") != embedding_model_id:
            continue
        if int(row.get("embedding_dimensions", 0)) != dimensions:
            continue

        score = cosine_similarity(embedding, [float(v) for v in row.get("embedding", [])])
        if score > best_score:
            best_score = score
            best_row = row

    if not best_row or best_score < threshold:
        return None

    result = json.loads(best_row["result_json"])
    result.update(
        {
            "image_cache_hit": True,
            "image_similarity_score": round(best_score, 4),
            "image_similarity_threshold": threshold,
            "image_embedding_model_id": best_row.get("embedding_model_id", embedding_model_id),
            "image_embedding_dimensions": best_row.get("embedding_dimensions", dimensions),
            "image_embedding_cache_id": best_row["vector_id"],
        }
    )
    return result


def image_vector_cache_put(
    agent: str,
    embedding: list[float],
    metadata_signature: str,
    prompt_version: str,
    model_id: str,
    result: dict,
    threshold: float | None = None,
) -> dict:
    threshold = image_similarity_threshold() if threshold is None else threshold
    vector_id = f"{agent}#{int(time.time() * 1000)}#{uuid.uuid4().hex[:12]}"
    now_ms = int(time.time() * 1000)
    result_with_meta = {
        **result,
        "image_cache_hit": False,
        "image_similarity_score": 1.0,
        "image_similarity_threshold": threshold,
        "image_embedding_model_id": image_embedding_model_id(),
        "image_embedding_dimensions": len(embedding),
        "image_embedding_cache_id": vector_id,
    }

    stored = True
    try:
        put_item(
            IMAGE_VECTOR_CACHE_TABLE,
            {
                "vector_id": vector_id,
                "agent": agent,
                "created_at": str(now_ms),
                "metadata_signature": metadata_signature,
                "prompt_version": prompt_version,
                "model_id": model_id,
                "embedding_model_id": image_embedding_model_id(),
                "embedding_dimensions": len(embedding),
                "similarity_threshold": threshold,
                "embedding": embedding,
                "result_json": json.dumps(result_with_meta),
            },
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "ResourceNotFoundException":
            raise
        stored = False

    if not stored:
        result_with_meta["image_embedding_cache_id"] = ""
        result_with_meta["image_similarity_score"] = 0.0

    return result_with_meta
