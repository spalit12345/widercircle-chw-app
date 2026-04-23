#!/bin/bash
# Hackathon seed script - seeds synthetic clinical data into local Medplum
# Usage: ./scripts/hackathon-seed.sh [email] [password]

set -e

BASE_URL="${MEDPLUM_BASE_URL:-http://localhost:8103}"
EMAIL="${1:-test@example.com}"
PASSWORD="${2:-MedplumHack2026!xQ9}"

echo "Seeding hackathon data into $BASE_URL..."

# Step 1: Login with PKCE to get access token
echo "Logging in as $EMAIL..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"scope\": \"openid\", \"codeChallenge\": \"x\", \"codeChallengeMethod\": \"plain\"}")

CODE=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
if [ -z "$CODE" ]; then
  echo "Login failed. Response: $LOGIN_RESPONSE"
  exit 1
fi

# Exchange code for token (PKCE flow)
TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&code_verifier=x")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
if [ -z "$ACCESS_TOKEN" ]; then
  echo "Token exchange failed. Response: $TOKEN_RESPONSE"
  exit 1
fi
echo "Authenticated successfully."

# Step 2: Post the seed bundle
echo "Posting seed data bundle..."
SEED_RESPONSE=$(curl -s -X POST "$BASE_URL/fhir/R4" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d @"$(dirname "$0")/hackathon-seed.json")

# Check for errors
python3 -c "
import sys, json
d = json.loads('''$SEED_RESPONSE''')
entries = d.get('entry', [])
errors = [e for e in entries if e.get('response',{}).get('status','').startswith(('4','5'))]
print(f'Successfully seeded {len(entries) - len(errors)}/{len(entries)} resources.')
if errors:
    print(f'WARNING: {len(errors)} entries had errors:')
    for e in errors:
        print(f'  {e[\"response\"][\"status\"]} {e[\"response\"].get(\"location\",\"?\")}')
"

# Step 3: Verify
echo ""
echo "Verifying seed data..."
get_count() {
  curl -s "$BASE_URL/fhir/R4/$1?_summary=count" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))"
}
PATIENT_COUNT=$(get_count Patient)
PRACTITIONER_COUNT=$(get_count Practitioner)
ORG_COUNT=$(get_count Organization)

echo "  Patients:      $PATIENT_COUNT"
echo "  Practitioners:  $PRACTITIONER_COUNT"
echo "  Organizations:  $ORG_COUNT"
echo ""
echo "Seed complete!"
