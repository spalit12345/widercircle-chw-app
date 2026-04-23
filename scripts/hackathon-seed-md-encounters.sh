#!/bin/bash
# Seeds 20-min MD E/M Visit encounters for patients who have existing billing data.
# Run after hackathon-seed.sh and hackathon-seed-config.json are loaded.

set -e
BASE_URL="${MEDPLUM_BASE_URL:-http://localhost:8103}"
EMAIL="${1:-test@example.com}"
PASSWORD="${2:-MedplumHack2026!xQ9}"

echo "Seeding MD E/M visits..."

# Authenticate
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"scope\": \"openid\", \"codeChallenge\": \"x\", \"codeChallengeMethod\": \"plain\"}")
CODE=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)
TOKEN_RESP=$(curl -s -X POST "$BASE_URL/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&code_verifier=x")
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

# Seed PCP practitioner
echo "  Seeding PCP practitioner..."
curl -s -X POST "$BASE_URL/fhir/R4" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d @"$(dirname "$0")/hackathon-seed-md-visits.json" > /dev/null

# Get all patients with encounters
echo "  Creating MD E/M encounters..."
PATIENTS=$(curl -s "$BASE_URL/fhir/R4/Patient?_count=10" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for e in d.get('entry',[]):
    p=e['resource']
    print(f'{p[\"id\"]}|{p[\"name\"][0][\"given\"][0]} {p[\"name\"][0][\"family\"]}')
")

# Get PCP practitioner ID
PCP_ID=$(curl -s "$BASE_URL/fhir/R4/Practitioner?identifier=http://medplum.com/hackathon|pcp-smith" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('entry'):
    print(d['entry'][0]['resource']['id'])
else:
    print('')
")

if [ -z "$PCP_ID" ]; then
  echo "  WARNING: PCP practitioner not found, using placeholder"
  PCP_ID="placeholder"
fi

echo "$PATIENTS" | while IFS='|' read -r PID PNAME; do
  # Check if patient already has an MD encounter
  EXISTING=$(curl -s "$BASE_URL/fhir/R4/Encounter?subject=Patient/$PID&type=http://medplum.com/activity-type|md-em-visit&_summary=count" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))" 2>/dev/null)

  if [ "$EXISTING" = "0" ]; then
    curl -s -X POST "$BASE_URL/fhir/R4/Encounter" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/fhir+json" \
      -d "{
        \"resourceType\": \"Encounter\",
        \"status\": \"finished\",
        \"class\": {\"code\": \"AMB\"},
        \"type\": [{\"coding\": [{\"system\": \"http://medplum.com/activity-type\", \"code\": \"md-em-visit\", \"display\": \"MD E/M Visit\"}]}],
        \"serviceType\": {\"coding\": [{\"system\": \"http://medplum.com/program\", \"code\": \"CHI\"}]},
        \"subject\": {\"reference\": \"Patient/$PID\", \"display\": \"$PNAME\"},
        \"participant\": [{
          \"type\": [{\"coding\": [{\"system\": \"http://medplum.com/credential\", \"code\": \"MD\", \"display\": \"MD\"}]}],
          \"individual\": {\"reference\": \"Practitioner/$PCP_ID\", \"display\": \"Dr. Robert Smith\"}
        }],
        \"length\": {\"value\": 20, \"unit\": \"min\", \"system\": \"http://unitsofmeasure.org\", \"code\": \"min\"},
        \"period\": {\"start\": \"2026-04-01T09:00:00Z\", \"end\": \"2026-04-01T09:20:00Z\"},
        \"reasonCode\": [{\"text\": \"Initiating E/M visit — CHI/PIN enrollment\"}]
      }" > /dev/null 2>&1
    echo "  Created MD visit for $PNAME (20 min)"
  else
    echo "  Skipped $PNAME (already has MD visit)"
  fi
done

echo "Done."
