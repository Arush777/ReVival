#!/usr/bin/env bash
# ReVival — finish the Lightsail deploy in one shot.
# Run this AFTER the AWS Lightsail container-service limit increase is approved.
#
#   ./deploy-lightsail.sh
#
# Prereqs already done by this point:
#   - colima running (docker daemon, amd64)  -> `colima status`
#   - image built + tested: revival-backend:latest
#   - IAM user creds saved at ~/.revival-backend-key.json
#   - DynamoDB tables + S3 buckets exist and are seeded
set -euo pipefail

REGION=ap-south-1
SERVICE=revival-backend
ACCOUNT=478982785786
KEYFILE="$HOME/.revival-backend-key.json"
# CORS: starts as localhost; re-run Phase 6 to add the real Vercel domain.
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000}"

# Admin creds (the user that can create Lightsail). Uses your normal profile.
export AWS_PROFILE=secondlife-local-dev
export AWS_DEFAULT_REGION="$REGION"

# lightsailctl looks for the Docker daemon at /var/run/docker.sock, but colima
# puts its socket elsewhere. Point DOCKER_HOST at colima's socket so the image
# push can find the daemon. (Harmless if you use Docker Desktop instead.)
if docker context inspect colima >/dev/null 2>&1; then
  export DOCKER_HOST="$(docker context inspect colima --format '{{.Endpoints.docker.Host}}')"
fi

echo "==> 1/5  Ensure container service exists (micro, scale 1)"
if ! aws lightsail get-container-services --region "$REGION" --service-name "$SERVICE" >/dev/null 2>&1; then
  aws lightsail create-container-service --region "$REGION" \
    --service-name "$SERVICE" --power micro --scale 1 >/dev/null
  echo "    created."
else
  echo "    already exists."
fi

echo "==> 2/5  Wait for READY"
while true; do
  STATE=$(aws lightsail get-container-services --region "$REGION" \
    --service-name "$SERVICE" --query "containerServices[0].state" --output text)
  echo "    state=$STATE"
  { [ "$STATE" = "READY" ] || [ "$STATE" = "RUNNING" ]; } && break
  sleep 15
done

echo "==> 3/5  Build + push image revival-backend:latest"
(cd backend && docker build --platform linux/amd64 -t revival-backend:latest .)
PUSH_OUT=$(aws lightsail push-container-image --region "$REGION" \
  --service-name "$SERVICE" --label app --image revival-backend:latest 2>&1)
echo "$PUSH_OUT"
IMG_REF=$(echo "$PUSH_OUT" | grep -oE ":${SERVICE}\.app\.[0-9]+" | tail -1)
[ -z "$IMG_REF" ] && { echo "ERROR: could not parse image ref"; exit 1; }
echo "    image ref = $IMG_REF"

echo "==> 4/5  Build deployment.json (secret injected from key file)"
AKID=$(python3 -c "import json;print(json.load(open('$KEYFILE'))['AccessKey']['AccessKeyId'])")
SECRET=$(python3 -c "import json;print(json.load(open('$KEYFILE'))['AccessKey']['SecretAccessKey'])")
python3 - "$IMG_REF" "$AKID" "$SECRET" "$ACCOUNT" "$CORS_ORIGINS" > /tmp/revival-deployment.json <<'PY'
import json, sys
img, akid, secret, acct, cors = sys.argv[1:6]
print(json.dumps({
  "containers": {
    "app": {
      "image": img,
      "ports": {"8080": "HTTP"},
      "environment": {
        "APP_ENV": "prod",
        "DEMO_MODE": "true",
        "AWS_DEFAULT_REGION": "ap-south-1",
        "BEDROCK_REGION": "ap-south-1",
        "AWS_ACCESS_KEY_ID": akid,
        "AWS_SECRET_ACCESS_KEY": secret,
        "DDB_TABLE_PREFIX": "SecondLife",
        "S3_PHOTOS_BUCKET": f"secondlife-photos-{acct}",
        "S3_PASSPORTS_BUCKET": f"secondlife-passports-{acct}",
        "BEDROCK_VISION_MODEL_ID": "qwen.qwen3-vl-235b-a22b",
        "BEDROCK_TEXT_MODEL_ID": "mistral.mistral-large-3-675b-instruct",
        "BEDROCK_VIDEO_MODEL_ID": "amazon.nova-pro-v1:0",
        "BEDROCK_IMAGE_EMBED_MODEL_ID": "amazon.titan-embed-image-v1",
        "IMAGE_EMBEDDING_DIMENSIONS": "256",
        "IMAGE_CACHE_SIMILARITY_THRESHOLD": "0.985",
        "GENERAL_ECOMMERCE_AOV_INR": "1000",
        "CORS_ORIGINS": cors,
      },
    }
  },
  "publicEndpoint": {
    "containerName": "app",
    "containerPort": 8080,
    "healthCheck": {"path": "/health", "successCodes": "200"},
  },
}))
PY
echo "    wrote /tmp/revival-deployment.json"

echo "==> 5/5  Create deployment"
aws lightsail create-container-service-deployment --region "$REGION" \
  --service-name "$SERVICE" --cli-input-json "file:///tmp/revival-deployment.json" >/dev/null

echo "    waiting for RUNNING + active deployment..."
while true; do
  STATE=$(aws lightsail get-container-services --region "$REGION" \
    --service-name "$SERVICE" --query "containerServices[0].state" --output text)
  DEPLOY=$(aws lightsail get-container-services --region "$REGION" \
    --service-name "$SERVICE" --query "containerServices[0].currentDeployment.state" --output text 2>/dev/null || echo "-")
  echo "    state=$STATE deployment=$DEPLOY"
  [ "$STATE" = "RUNNING" ] && [ "$DEPLOY" = "ACTIVE" ] && break
  [ "$DEPLOY" = "FAILED" ] && { echo "DEPLOYMENT FAILED — check Lightsail console logs"; exit 1; }
  sleep 20
done

URL=$(aws lightsail get-container-services --region "$REGION" \
  --service-name "$SERVICE" --query "containerServices[0].url" --output text)
echo ""
echo "============================================================"
echo " BACKEND LIVE:  $URL"
echo " Health check:  ${URL}health"
echo " Use this as NEXT_PUBLIC_API_BASE_URL in Vercel (no trailing slash):"
echo "   ${URL%/}"
echo "============================================================"
rm -f /tmp/revival-deployment.json
