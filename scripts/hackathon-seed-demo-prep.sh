#!/bin/bash
# Idempotent demo-data seed for the WiderCircle CHW app.
# Adds: CarePlans (v1 + v2 for one member), ECM Communications, pending review
# Task, SDoH triggered case, field-visit Encounter, today appointment, ECM
# enrollment Consent. Each block re-counts before creating so re-runs don't
# duplicate.
set -euo pipefail

CLIENT_ID="${CLIENT_ID:?CLIENT_ID env var required (Medplum ClientApplication.id)}"
CLIENT_SECRET="${CLIENT_SECRET:?CLIENT_SECRET env var required (Medplum ClientApplication.secret)}"
BASE="${MEDPLUM_BASE_URL:-https://api.medplum.com}"

echo "=== Authenticating ==="
TOKEN=$(curl -s -X POST "$BASE/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

post() {
  curl -s -X POST "$BASE/fhir/R4/$1" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/fhir+json" \
    -d @-
}

count() {
  curl -s "$BASE/fhir/R4/$1&_summary=count" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('total',0))"
}

# Patient IDs (from earlier survey)
P_MARIA="a87dfe69-3647-4152-bb44-13eaac013ae2"      # Maria Garcia (female, 90012)
P_TRAN="a38a0c14-1bd6-435b-b9d1-dc035ce5790e"        # Tran Nguyen (male, 90045)
P_MARCUS="d6386713-3650-4fad-b698-e2b95d51e296"      # Marcus Davis (male, 90035) — ECM demo
P_JAMES="a4841c4a-5922-47af-8778-052c322c24c2"       # James Wilson (male, 90015)
P_LINDA="be95ea1a-6f01-4519-bc02-f310900332a5"       # Linda Thompson (female, 90030)
P_ROSA="e7e2362f-60e0-48af-9009-de989b3f61f6"        # Rosa Martinez (female, 90040)
P_DOROTHY="27ad7f1a-a3ae-4ed5-b6b5-137ae8c3b235"     # Dorothy Johnson (female, 90025)
P_ROBERT="ffcfd825-5285-4ea8-95b6-0da123026126"      # Robert Chen (male, 90020)

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TODAY=$(date -u +"%Y-%m-%d")

echo ""
echo "=== 1. CarePlans for the demo members (skip if already present) ==="
seed_careplan() {
  local pid=$1
  local pname=$2
  local title=$3
  local existing=$(count "CarePlan?subject=Patient/$pid&status=active")
  if [ "$existing" -gt 0 ]; then
    echo "  · $pname has $existing active CarePlan(s) — skipping"
    return
  fi
  echo "  · Creating CarePlan for $pname"
  cat <<JSON | post "CarePlan" >/dev/null
{
  "resourceType":"CarePlan",
  "status":"active",
  "intent":"plan",
  "title":"$title",
  "description":"Demo plan seeded for the 5/5 board presentation. Provider authoring lands at /plan-of-care; CHW review at /plan-review.",
  "subject":{"reference":"Patient/$pid","display":"$pname"},
  "created":"$NOW",
  "extension":[{"url":"https://widercircle.com/fhir/StructureDefinition/plan-version","valueInteger":1}],
  "activity":[
    {"detail":{"status":"in-progress","description":"Stabilize blood pressure through weekly check-ins","code":{"coding":[{"code":"step-1","display":"billable"}]}}},
    {"detail":{"status":"not-started","description":"Coordinate diabetes self-management education","code":{"coding":[{"code":"step-2"}]}}},
    {"detail":{"status":"not-started","description":"Refer to community pharmacist for medication review","code":{"coding":[{"code":"step-3"}]}}}
  ]
}
JSON
}
seed_careplan "$P_TRAN"     "Tran Nguyen"     "Plan of Care · CHI"
seed_careplan "$P_MARCUS"   "Marcus Davis"    "Plan of Care · CHI"
seed_careplan "$P_JAMES"    "James Wilson"    "Plan of Care · PIN"
seed_careplan "$P_LINDA"    "Linda Thompson"  "Plan of Care · CHI"

echo ""
echo "=== 2. v2 CarePlan for Maria Garcia (Plan diff demo) ==="
v2_count=$(count "CarePlan?subject=Patient/$P_MARIA&_sort=-_lastUpdated&_count=10")
if [ "$v2_count" -ge 2 ]; then
  echo "  · Maria already has $v2_count CarePlan version(s) — skipping"
else
  echo "  · Creating v2 CarePlan for Maria Garcia"
  cat <<JSON | post "CarePlan" >/dev/null
{
  "resourceType":"CarePlan",
  "status":"active",
  "intent":"plan",
  "title":"Plan of Care",
  "description":"v2 — adds SNAP referral and removes weekly call cadence per CHW field assessment.",
  "subject":{"reference":"Patient/$P_MARIA","display":"Maria Garcia"},
  "created":"$NOW",
  "extension":[{"url":"https://widercircle.com/fhir/StructureDefinition/plan-version","valueInteger":2}],
  "activity":[
    {"detail":{"status":"completed","description":"Connect with housing authority","code":{"coding":[{"code":"step-1","display":"billable"}]}}},
    {"detail":{"status":"in-progress","description":"Weekly follow-up calls","code":{"coding":[{"code":"step-2"}]}}},
    {"detail":{"status":"not-started","description":"SNAP application assistance","code":{"coding":[{"code":"step-3-new"}]}}},
    {"detail":{"status":"not-started","description":"Medical transport enrollment","code":{"coding":[{"code":"step-4-new"}]}}}
  ]
}
JSON
fi

echo ""
echo "=== 3. ECM enrollment Consent for Marcus Davis (so attempts are billable) ==="
ecm_consent_count=$(count "Consent?patient=Patient/$P_MARCUS&status=active&category=ecm-enrollment")
if [ "$ecm_consent_count" -gt 0 ]; then
  echo "  · Marcus already has ECM consent — skipping"
else
  echo "  · Creating ECM enrollment consent for Marcus Davis"
  CONSENT_DATE=$(date -u -v-90d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "90 days ago" +"%Y-%m-%dT%H:%M:%SZ")
  cat <<JSON | post "Consent" >/dev/null
{
  "resourceType":"Consent",
  "status":"active",
  "scope":{"coding":[{"system":"http://terminology.hl7.org/CodeSystem/consentscope","code":"patient-privacy"}]},
  "category":[{"coding":[{"system":"https://widercircle.com/fhir/CodeSystem/consent-category","code":"ecm-enrollment","display":"ECM enrollment"}]}],
  "patient":{"reference":"Patient/$P_MARCUS","display":"Marcus Davis"},
  "policyRule":{"coding":[{"system":"https://widercircle.com/fhir/CodeSystem/consent-policy","code":"ecm-enrollment","display":"ECM enrollment policy v1"}]},
  "dateTime":"$CONSENT_DATE"
}
JSON
fi

echo ""
echo "=== 4. ECM Communications for Marcus Davis (8 billable + 2 non-billable) ==="
ecm_count=$(count "Communication?subject=Patient/$P_MARCUS&category=ecm-outreach")
if [ "$ecm_count" -ge 8 ]; then
  echo "  · Marcus already has $ecm_count ECM attempts — skipping"
else
  echo "  · Seeding 10 ECM attempts for Marcus Davis"
  declare -a CHANNELS=("call" "sms" "call" "in-person" "call" "sms" "call" "call" "call" "call")
  declare -a OUTCOMES=("reached" "voicemail" "no-answer" "successful-terminating" "reached" "voicemail" "reached" "reached" "refused" "wrong-number")
  declare -a BILLABLES=(true     true        true        true                       true      true        true       true       false      false)
  for i in 0 1 2 3 4 5 6 7 8 9; do
    DAY_AGO=$((45 - i*4))
    SENT=$(date -u -v-${DAY_AGO}d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "${DAY_AGO} days ago" +"%Y-%m-%dT%H:%M:%SZ")
    CH="${CHANNELS[$i]}"
    OC="${OUTCOMES[$i]}"
    BI="${BILLABLES[$i]}"
    cat <<JSON | post "Communication" >/dev/null
{
  "resourceType":"Communication",
  "status":"completed",
  "category":[{"coding":[{"system":"https://widercircle.com/fhir/CodeSystem/communication-category","code":"ecm-outreach","display":"ECM outreach attempt"}]}],
  "subject":{"reference":"Patient/$P_MARCUS","display":"Marcus Davis"},
  "sent":"$SENT",
  "payload":[{"contentString":"Demo seeded ECM outreach attempt $((i+1)) of 10."}],
  "extension":[
    {"url":"https://widercircle.com/fhir/StructureDefinition/ecm-channel","valueString":"$CH"},
    {"url":"https://widercircle.com/fhir/StructureDefinition/ecm-outcome","valueString":"$OC"},
    {"url":"https://widercircle.com/fhir/StructureDefinition/ecm-billable","valueBoolean":$BI}
  ]
}
JSON
  done
fi

echo ""
echo "=== 5. Pending review Task for Plan sign-off queue (Tran Nguyen) ==="
pending_count=$(count "Task?patient=Patient/$P_TRAN&code=plan-review-submission&status=requested")
if [ "$pending_count" -gt 0 ]; then
  echo "  · Tran already has $pending_count pending review Task(s) — skipping"
else
  TRAN_PLAN_ID=$(curl -s "$BASE/fhir/R4/CarePlan?subject=Patient/$P_TRAN&status=active&_count=1" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
e=d.get('entry',[])
print(e[0]['resource']['id'] if e else '')")
  if [ -z "$TRAN_PLAN_ID" ]; then
    echo "  · WARN: no CarePlan for Tran; skipping review Task"
  else
    echo "  · Creating pending review Task referencing CarePlan/$TRAN_PLAN_ID"
    cat <<JSON | post "Task" >/dev/null
{
  "resourceType":"Task",
  "status":"requested",
  "intent":"order",
  "priority":"asap",
  "code":{"coding":[{"system":"https://widercircle.com/fhir/CodeSystem/task-category","code":"plan-review-submission","display":"Plan review submission"}],"text":"Plan review submission"},
  "description":"CHW submitted plan for Provider sign-off. Member completed two visits; plan items are at expected status.",
  "for":{"reference":"Patient/$P_TRAN","display":"Tran Nguyen"},
  "focus":{"reference":"CarePlan/$TRAN_PLAN_ID"},
  "authoredOn":"$NOW"
}
JSON
  fi
fi

echo ""
echo "=== 6. SDoH triggered-case QuestionnaireResponse (Linda Thompson) ==="
sdoh_count=$(count "QuestionnaireResponse?subject=Patient/$P_LINDA&_count=1")
if [ "$sdoh_count" -gt 0 ]; then
  echo "  · Linda already has $sdoh_count QuestionnaireResponse(s) — skipping"
else
  echo "  · Seeding SDoH-triggered QuestionnaireResponse for Linda Thompson"
  cat <<JSON | post "QuestionnaireResponse" >/dev/null
{
  "resourceType":"QuestionnaireResponse",
  "status":"completed",
  "subject":{"reference":"Patient/$P_LINDA","display":"Linda Thompson"},
  "authored":"$NOW",
  "questionnaire":"https://widercircle.com/fhir/Questionnaire/sdoh-prapare-v1",
  "item":[
    {"linkId":"food","text":"Food","item":[
      {"linkId":"food_worry","text":"Food worry?","answer":[{"valueString":"Often"}]}
    ]},
    {"linkId":"housing","text":"Housing","item":[
      {"linkId":"housing_current","text":"Housing situation?","answer":[{"valueString":"I have housing but worried about losing it"}]}
    ]}
  ],
  "extension":[
    {"url":"https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case","valueString":"Food insecurity follow-up"},
    {"url":"https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case","valueString":"Housing instability"}
  ]
}
JSON
fi

echo ""
echo "=== 7. Field-visit Encounter (Maria Garcia) ==="
field_count=$(count "Encounter?subject=Patient/$P_MARIA&class=FLD")
if [ "$field_count" -gt 0 ]; then
  echo "  · Maria already has $field_count field visit(s) — skipping"
else
  FIELD_DATE=$(date -u -v-3d +"%Y-%m-%dT15:00:00Z" 2>/dev/null || date -u -d "3 days ago" +"%Y-%m-%dT15:00:00Z")
  echo "  · Creating field-visit Encounter for Maria Garcia"
  cat <<JSON | post "Encounter" >/dev/null
{
  "resourceType":"Encounter",
  "status":"finished",
  "class":{"system":"http://terminology.hl7.org/CodeSystem/v3-ActCode","code":"FLD","display":"field"},
  "type":[{"coding":[{"system":"https://widercircle.com/fhir/CodeSystem/encounter-category","code":"field-visit","display":"CHW field visit"}],"text":"Member's home"}],
  "subject":{"reference":"Patient/$P_MARIA","display":"Maria Garcia"},
  "period":{"start":"$FIELD_DATE","end":"$FIELD_DATE"},
  "reasonCode":[{"coding":[{"system":"https://widercircle.com/fhir/CodeSystem/visit-disposition","code":"completed","display":"Completed"}],"text":"Home visit — member stable post-discharge. BP cuff demo'd, food pantry status ok, follow-up in 2 weeks."}]
}
JSON
fi

echo ""
echo "=== 8. Appointment for today (Tran Nguyen, in 1 hour) ==="
appt_count=$(count "Appointment?date=ge${TODAY}&date=le${TODAY}T23:59&_count=10")
if [ "$appt_count" -gt 0 ]; then
  echo "  · Already $appt_count appointment(s) for today — skipping"
else
  APPT_START=$(date -u -v+60M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "60 minutes" +"%Y-%m-%dT%H:%M:%SZ")
  APPT_END=$(date -u -v+90M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "90 minutes" +"%Y-%m-%dT%H:%M:%SZ")
  echo "  · Creating telehealth appointment for Tran Nguyen at $APPT_START"
  PCP_REF=$(curl -s "$BASE/fhir/R4/Practitioner?_count=1" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
e=d.get('entry',[])
print(f\"Practitioner/{e[0]['resource']['id']}\" if e else '')")
  cat <<JSON | post "Appointment" >/dev/null
{
  "resourceType":"Appointment",
  "status":"booked",
  "appointmentType":{"coding":[{"code":"telehealth","display":"Telehealth"}]},
  "start":"$APPT_START",
  "end":"$APPT_END",
  "comment":"CHI initiating visit",
  "participant":[
    {"actor":{"reference":"Patient/$P_TRAN","display":"Tran Nguyen"},"status":"accepted"},
    {"actor":{"reference":"$PCP_REF","display":"Demo Provider"},"status":"accepted"}
  ]
}
JSON
fi

echo ""
echo "=== Done ==="
echo "Counts after seed:"
echo "  CarePlans (active):     $(count CarePlan?status=active)"
echo "  ECM Communications:     $(count Communication?category=ecm-outreach)"
echo "  Pending review Tasks:   $(count "Task?code=plan-review-submission&status=requested")"
echo "  Field-visit Encounters: $(count Encounter?class=FLD)"
echo "  Today appointments:     $(count "Appointment?date=ge${TODAY}&date=le${TODAY}T23:59")"
echo "  SDoH triggered QRs:     $(count "QuestionnaireResponse?_count=20" )"
