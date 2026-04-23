#!/bin/bash
# Hackathon Demo Setup — runs all seed scripts in order
# Usage: ./scripts/hackathon-demo-setup.sh [email] [password]

set -e

BASE_URL="${MEDPLUM_BASE_URL:-http://localhost:8103}"
EMAIL="${1:-test@example.com}"
PASSWORD="${2:-MedplumHack2026!xQ9}"
SCRIPT_DIR="$(dirname "$0")"

echo "=== Hackathon Demo Setup ==="
echo "Server: $BASE_URL"
echo ""

# Authenticate
echo "1. Authenticating..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"scope\": \"openid\", \"codeChallenge\": \"x\", \"codeChallengeMethod\": \"plain\"}")
CODE=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
TOKEN_RESP=$(curl -s -X POST "$BASE_URL/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&code_verifier=x")
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "Authentication failed!"
  exit 1
fi
echo "   Authenticated."

# Helper function
seed_bundle() {
  local file=$1
  local desc=$2
  echo ""
  echo "2. Seeding $desc..."
  RESP=$(curl -s -X POST "$BASE_URL/fhir/R4" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/fhir+json" \
    -d @"$file")
  COUNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('entry',[])))" 2>/dev/null)
  echo "   Created $COUNT resources."
}

# Seed all data
seed_bundle "$SCRIPT_DIR/hackathon-seed.json" "patients, practitioners, organization"
seed_bundle "$SCRIPT_DIR/hackathon-seed-config.json" "ValueSet config (activity types, programs, CPT codes, consent categories)"
seed_bundle "$SCRIPT_DIR/hackathon-seed-consents.json" "consent form questionnaires"
seed_bundle "$SCRIPT_DIR/hackathon-seed-careplan-templates.json" "care plan templates"

# Verify
echo ""
echo "=== Verification ==="
get_count() {
  curl -s "$BASE_URL/fhir/R4/$1?_summary=count" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null
}

echo "  Patients:           $(get_count Patient)"
echo "  Practitioners:      $(get_count Practitioner)"
echo "  Organizations:      $(get_count Organization)"
echo "  Questionnaires:     $(get_count Questionnaire)"
echo "  PlanDefinitions:    $(get_count PlanDefinition)"
echo "  ValueSets:          $(get_count ValueSet)"

echo ""
echo "=== Demo Ready ==="
echo "Open http://localhost:3000 to start the demo."
echo ""
echo "Demo flow:"
echo "  1. Log time: Patient → Billing tab → Log Activity"
echo "  2. Billing threshold: /billing dashboard"
echo "  3. Capture consent: Patient → Consents tab → Capture Consent"
echo "  4. Care plan: Patient → Careplan tab → Create/Edit"
