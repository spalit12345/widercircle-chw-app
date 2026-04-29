// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-02 Unified Member Context — single profile showing 8 canonical sections:
// 1. Key info (CM-03 header)        2. Demographics
// 3. Conditions                      4. Medications
// 5. Allergies                       6. Consents
// 7. Recent interactions             8. Care plan
//
// Source of truth for case history, communications, referrals, and clinical
// data is the FHIR Patient compartment. v1 reads what's available; v2 will
// add referral and case timeline once CM-05 / CM-21 land.

import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference, formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  AllergyIntolerance,
  CarePlan,
  Communication,
  Condition,
  Consent,
  Coverage,
  Encounter,
  MedicationRequest,
  Patient,
  RelatedPerson,
  Task,
} from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import {
  IconBriefcase,
  IconCalendar,
  IconChevronRight,
  IconClipboardCheck,
  IconAlertTriangle,
  IconClock,
  IconExternalLink,
  IconHeartHandshake,
  IconHistory,
  IconHome,
  IconLock,
  IconMapPin,
  IconNotes,
  IconPhone,
  IconPill,
  IconPlus,
  IconShieldCheck,
  IconSignature,
  IconStethoscope,
  IconVideo,
  IconVirus,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MemberKeyInfoHeader } from '../components/MemberKeyInfoHeader';
import { useRole } from '../auth/RoleContext';
import { emitAudit } from '../utils/audit';
import { CONSENT_CATEGORY_CODE, evaluateConsentStatus } from './ConsentCapturePage';
import {
  ECM_BILLABLE_EXT,
  ECM_CAP_DEFAULT,
  ECM_CATEGORY_CODE,
  ECM_CHANNEL_EXT,
  ECM_CHANNELS,
  ECM_OUTCOME_EXT,
  ECM_OUTCOMES,
  ECM_WINDOW_DAYS_DEFAULT,
  evaluateEcmStatus,
  type EcmChannel,
  type EcmOutcome,
} from '../utils/ecm';

const CASE_CATEGORY_CODE = 'case-management';
const CASE_TYPE_EXT = 'https://widercircle.com/fhir/StructureDefinition/case-type';

const CASE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'sdoh-food', label: 'SDoH — Food insecurity' },
  { value: 'sdoh-housing', label: 'SDoH — Housing instability' },
  { value: 'sdoh-transportation', label: 'SDoH — Transportation' },
  { value: 'sdoh-utilities', label: 'SDoH — Utilities' },
  { value: 'pcp-referral', label: 'Needs new PCP' },
  { value: 'eligibility', label: 'Eligibility verification' },
  { value: 'coverage', label: 'Coverage / benefits issue' },
  { value: 'other', label: 'Other' },
];

const CASE_PRIORITIES: Array<{ value: string; label: string }> = [
  { value: 'asap', label: 'High' },
  { value: 'urgent', label: 'Medium' },
  { value: 'routine', label: 'Low' },
];

const caseTypeLabel = (code: string | undefined): string =>
  CASE_TYPES.find((t) => t.value === code)?.label ?? code ?? 'Case';

// CM-13 AC-4 — field-visit logging.
const FIELD_VISIT_CLASS_CODE = 'FLD';
const FIELD_VISIT_CATEGORY_CODE = 'field-visit';
const FIELD_VISIT_LOCATIONS: Array<{ value: string; label: string }> = [
  { value: 'home', label: "Member's home" },
  { value: 'community', label: 'Community location' },
  { value: 'phone', label: 'Phone' },
  { value: 'other', label: 'Other' },
];
const FIELD_VISIT_DISPOSITIONS: Array<{ value: string; label: string }> = [
  { value: 'completed', label: 'Completed' },
  { value: 'partial', label: 'Partial' },
  { value: 'no-show', label: 'No-show' },
  { value: 'refused', label: 'Refused' },
  { value: 'unable-to-contact', label: 'Unable to contact' },
];

// CM-13 Relationships — read RelatedPerson resources only. Caregivers /
// family / contacts that need to do anything in the system (sign consents,
// receive SMS, attend visits, hold portal access) live as first-class
// RelatedPerson records. Patient.contact[] entries are intentionally NOT
// surfaced here — promote them to RelatedPerson before they show up in this
// card so every row downstream can be referenced from Communication, Consent,
// Encounter, etc.
const PRIMARY_CONTACT_EXT = 'https://widercircle.com/fhir/StructureDefinition/primary-contact';

export interface RelationshipRow {
  key: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  primary: boolean;
}

const formatNameFromHuman = (name: { given?: string[]; family?: string; text?: string } | undefined): string => {
  if (!name) return 'Unnamed contact';
  if (name.text) return name.text;
  return [name.given?.join(' '), name.family].filter(Boolean).join(' ') || 'Unnamed contact';
};

const isPrimaryContact = (relationship: { coding?: { code?: string }[] }[] | undefined, extPrimary: boolean): boolean => {
  if (extPrimary) return true;
  return Boolean(
    relationship?.some((r) => r.coding?.some((c) => c.code === 'C' || c.code === 'CP'))
  );
};

export const buildRelationshipRows = (relatedPersons: RelatedPerson[]): RelationshipRow[] => {
  const rows: RelationshipRow[] = [];
  relatedPersons.forEach((rp) => {
    if (rp.active === false) return;
    const extPrimary = Boolean(
      rp.extension?.find((e) => e.url === PRIMARY_CONTACT_EXT && e.valueBoolean === true)
    );
    rows.push({
      key: `rp-${rp.id ?? Math.random().toString(36).slice(2)}`,
      name: formatNameFromHuman(rp.name?.[0]),
      relationship:
        rp.relationship?.[0]?.text ?? rp.relationship?.[0]?.coding?.[0]?.display ?? null,
      phone: rp.telecom?.find((t) => t.system === 'phone')?.value ?? null,
      email: rp.telecom?.find((t) => t.system === 'email')?.value ?? null,
      primary: isPrimaryContact(rp.relationship, extPrimary),
    });
  });
  // Primary contacts first, then by name.
  rows.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
};

interface LoadedData {
  patient: Patient | undefined;
  coverages: Coverage[];
  conditions: Condition[];
  medications: MedicationRequest[];
  allergies: AllergyIntolerance[];
  consents: Consent[];
  communications: Communication[];
  carePlans: CarePlan[];
  cases: Task[];
  fieldVisits: Encounter[];
  ecmAttempts: Communication[];
  relatedPersons: RelatedPerson[];
}

const EMPTY: LoadedData = {
  patient: undefined,
  coverages: [],
  conditions: [],
  medications: [],
  allergies: [],
  consents: [],
  communications: [],
  carePlans: [],
  cases: [],
  fieldVisits: [],
  ecmAttempts: [],
  relatedPersons: [],
};

export function MemberContextPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { hasPermission } = useRole();
  const { patientId } = useParams<{ patientId: string }>();
  const [data, setData] = useState<LoadedData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [caseModalOpened, { open: openCaseModal, close: closeCaseModal }] = useDisclosure(false);
  const [caseType, setCaseType] = useState<string>('sdoh-food');
  const [caseSummary, setCaseSummary] = useState('');
  const [casePriority, setCasePriority] = useState<string>('urgent');
  const [creatingCase, setCreatingCase] = useState(false);
  // CM-13 AC-4 — field-visit logging.
  const [visitModalOpened, { open: openVisitModal, close: closeVisitModal }] = useDisclosure(false);
  const [visitDate, setVisitDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [visitLocation, setVisitLocation] = useState<string>('home');
  const [visitDisposition, setVisitDisposition] = useState<string>('completed');
  const [visitNotes, setVisitNotes] = useState('');
  const [loggingVisit, setLoggingVisit] = useState(false);
  // CM-22 ECM — log-attempt modal state.
  const [ecmModalOpened, { open: openEcmModal, close: closeEcmModal }] = useDisclosure(false);
  const [ecmChannel, setEcmChannel] = useState<EcmChannel>('call');
  const [ecmOutcome, setEcmOutcome] = useState<EcmOutcome>('reached');
  const [ecmNotes, setEcmNotes] = useState('');
  const [loggingEcm, setLoggingEcm] = useState(false);
  const [startingVisit, setStartingVisit] = useState(false);

  // Click-to-launch a telehealth visit. Creates a planned Encounter for this
  // member and navigates to its workspace; if a planned/in-progress one
  // already exists for the patient, reuse it.
  const handleStartVisit = useCallback(async () => {
    if (!patientId || !data.patient) return;
    setStartingVisit(true);
    try {
      const existing = await medplum
        .searchResources(
          'Encounter',
          `subject=Patient/${patientId}&status=planned,arrived,triaged,in-progress&_sort=-_lastUpdated&_count=1`
        )
        .catch(() => []);
      const reuse = existing[0];
      if (reuse?.id) {
        navigate(`/encounters/${reuse.id}/workspace`);
        return;
      }
      const profile = medplum.getProfile();
      const created = await medplum.createResource({
        resourceType: 'Encounter',
        status: 'planned',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'VR',
          display: 'Virtual',
        },
        type: [{ text: 'Telehealth — CHI initiating visit' }],
        subject: {
          reference: `Patient/${patientId}`,
          display:
            `${data.patient.name?.[0]?.given?.[0] ?? ''} ${data.patient.name?.[0]?.family ?? ''}`.trim() ||
            'Member',
        },
        participant: profile
          ? [
              {
                individual: {
                  reference: `${profile.resourceType}/${profile.id}`,
                  display:
                    `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() ||
                    'Clinician',
                },
              },
            ]
          : undefined,
        period: { start: new Date().toISOString() },
      });
      if (created.id) {
        navigate(`/encounters/${created.id}/workspace`);
      }
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setStartingVisit(false);
    }
  }, [patientId, data.patient, medplum, navigate]);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    const subject = `subject=Patient/${patientId}`;
    const patientRef = `patient=Patient/${patientId}`;
    try {
      const [
        patient,
        coverages,
        conditions,
        medications,
        allergies,
        consents,
        communications,
        carePlans,
        cases,
        visits,
        ecmAttempts,
        relatedPersons,
      ] = await Promise.all([
          medplum.readResource('Patient', patientId).catch(() => undefined),
          medplum.searchResources('Coverage', `${patientRef}&_count=10`).catch(() => []),
          medplum
            .searchResources('Condition', `${subject}&clinical-status=active&_count=20&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('MedicationRequest', `${subject}&status=active&_count=20&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('AllergyIntolerance', `${patientRef}&_count=20&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('Consent', `${patientRef}&_count=10&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('Communication', `${subject}&_count=10&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources('CarePlan', `${subject}&status=active&_count=5&_sort=-_lastUpdated`)
            .catch(() => []),
          medplum
            .searchResources(
              'Task',
              `patient=Patient/${patientId}&code=${CASE_CATEGORY_CODE}&_sort=-_lastUpdated&_count=20`
            )
            .catch(() => [] as Task[]),
          medplum
            .searchResources(
              'Encounter',
              `${subject}&class=${FIELD_VISIT_CLASS_CODE}&_sort=-_lastUpdated&_count=10`
            )
            .catch(() => [] as Encounter[]),
          medplum
            .searchResources(
              'Communication',
              `${subject}&category=${ECM_CATEGORY_CODE}&_sort=-sent&_count=50`
            )
            .catch(() => [] as Communication[]),
          medplum
            .searchResources(
              'RelatedPerson',
              `${patientRef}&_count=20&_sort=-_lastUpdated`
            )
            .catch(() => [] as RelatedPerson[]),
        ]);
      setData({
        patient,
        coverages: coverages ?? [],
        conditions: conditions ?? [],
        medications: medications ?? [],
        allergies: allergies ?? [],
        consents: consents ?? [],
        communications: communications ?? [],
        carePlans: carePlans ?? [],
        cases: (cases ?? []) as Task[],
        fieldVisits: (visits ?? []) as Encounter[],
        ecmAttempts: (ecmAttempts ?? []) as Communication[],
        relatedPersons: (relatedPersons ?? []) as RelatedPerson[],
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, patientId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const resetEcmForm = useCallback(() => {
    setEcmChannel('call');
    setEcmOutcome('reached');
    setEcmNotes('');
  }, []);

  const handleLogEcmAttempt = useCallback(async () => {
    if (!patientId || !data.patient) return;
    const profile = medplum.getProfile();
    setLoggingEcm(true);
    try {
      const now = new Date().toISOString();
      const outcomeMeta = ECM_OUTCOMES.find((o) => o.value === ecmOutcome);
      const billable = outcomeMeta?.billable ?? false;
      const newAttempt: Communication = {
        resourceType: 'Communication',
        status: 'completed',
        category: [
          {
            coding: [
              {
                system: 'https://widercircle.com/fhir/CodeSystem/communication-category',
                code: ECM_CATEGORY_CODE,
                display: 'ECM outreach attempt',
              },
            ],
          },
        ],
        subject: {
          reference: `Patient/${patientId}`,
          display:
            `${data.patient.name?.[0]?.given?.[0] ?? ''} ${data.patient.name?.[0]?.family ?? ''}`.trim() ||
            'Member',
        },
        sent: now,
        sender: profile
          ? {
              reference: `${profile.resourceType}/${profile.id}`,
              display:
                `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() ||
                'CHW',
            }
          : undefined,
        payload: ecmNotes.trim() ? [{ contentString: ecmNotes.trim() }] : undefined,
        extension: [
          { url: ECM_CHANNEL_EXT, valueString: ecmChannel },
          { url: ECM_OUTCOME_EXT, valueString: ecmOutcome },
          { url: ECM_BILLABLE_EXT, valueBoolean: billable },
        ],
      };
      const saved = await medplum.createResource<Communication>(newAttempt);
      // Audit emission via the existing DA-13 shim — reuse case.created action
      // (the spec doesn't carry a dedicated outreach action yet; we tag the
      // event entity so it's distinguishable).
      void emitAudit(medplum, {
        action: 'case.created',
        patientRef: { reference: `Patient/${patientId}` },
        meta: {
          ecm: true,
          channel: ecmChannel,
          outcome: ecmOutcome,
          billable,
          communicationId: saved.id ?? '',
        },
      });
      showNotification({
        color: billable ? 'green' : 'yellow',
        message: billable
          ? `Outreach logged · billable (${outcomeMeta?.label ?? ecmOutcome})`
          : `Outreach logged · non-billable (${outcomeMeta?.label ?? ecmOutcome})`,
      });
      closeEcmModal();
      resetEcmForm();
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoggingEcm(false);
    }
  }, [
    patientId,
    data.patient,
    medplum,
    ecmChannel,
    ecmOutcome,
    ecmNotes,
    closeEcmModal,
    resetEcmForm,
    load,
  ]);

  const resetVisitForm = useCallback(() => {
    setVisitDate(new Date().toISOString().slice(0, 16));
    setVisitLocation('home');
    setVisitDisposition('completed');
    setVisitNotes('');
  }, []);

  const handleLogFieldVisit = useCallback(async () => {
    if (!patientId || !data.patient) return;
    const profile = medplum.getProfile();
    setLoggingVisit(true);
    try {
      const start = new Date(visitDate).toISOString();
      const newVisit: Encounter = {
        resourceType: 'Encounter',
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: FIELD_VISIT_CLASS_CODE,
          display: 'field',
        },
        type: [
          {
            coding: [
              {
                system: 'https://widercircle.com/fhir/CodeSystem/encounter-category',
                code: FIELD_VISIT_CATEGORY_CODE,
                display: 'CHW field visit',
              },
            ],
            text:
              FIELD_VISIT_LOCATIONS.find((l) => l.value === visitLocation)?.label ?? visitLocation,
          },
        ],
        subject: {
          reference: `Patient/${patientId}`,
          display:
            `${data.patient.name?.[0]?.given?.[0] ?? ''} ${data.patient.name?.[0]?.family ?? ''}`.trim() ||
            'Member',
        },
        period: { start, end: start },
        participant: profile
          ? [
              {
                individual: {
                  reference: `${profile.resourceType}/${profile.id}`,
                  display:
                    `${profile.name?.[0]?.given?.[0] ?? ''} ${profile.name?.[0]?.family ?? ''}`.trim() ||
                    'CHW',
                },
              },
            ]
          : undefined,
        reasonCode: [
          {
            coding: [
              {
                system: 'https://widercircle.com/fhir/CodeSystem/visit-disposition',
                code: visitDisposition,
                display:
                  FIELD_VISIT_DISPOSITIONS.find((d) => d.value === visitDisposition)?.label ??
                  visitDisposition,
              },
            ],
            text: visitNotes.trim() || undefined,
          },
        ],
      };
      const saved = await medplum.createResource<Encounter>(newVisit);
      // CM-13 AC-4 — audit the field-visit log.
      void emitAudit(medplum, {
        action: 'fieldvisit.logged',
        patientRef: { reference: `Patient/${patientId}` },
        encounterRef: saved.id ? { reference: `Encounter/${saved.id}` } : undefined,
        meta: { location: visitLocation, disposition: visitDisposition },
      });
      showNotification({ color: 'green', message: 'Field visit logged' });
      closeVisitModal();
      resetVisitForm();
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoggingVisit(false);
    }
  }, [
    patientId,
    data.patient,
    medplum,
    visitDate,
    visitLocation,
    visitDisposition,
    visitNotes,
    closeVisitModal,
    resetVisitForm,
    load,
  ]);

  const resetCaseForm = useCallback(() => {
    setCaseType('sdoh-food');
    setCasePriority('urgent');
    setCaseSummary('');
  }, []);

  const handleCreateCase = useCallback(async () => {
    if (!patientId || !data.patient || !caseSummary.trim()) {
      return;
    }
    const profile = medplum.getProfile();
    setCreatingCase(true);
    try {
      const newCase: Task = {
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        priority: casePriority as Task['priority'],
        code: {
          coding: [
            {
              system: 'https://widercircle.com/fhir/CodeSystem/task-category',
              code: CASE_CATEGORY_CODE,
              display: 'Case management',
            },
          ],
          text: caseTypeLabel(caseType),
        },
        description: caseSummary.trim(),
        for: {
          reference: `Patient/${patientId}`,
          display:
            `${data.patient.name?.[0]?.given?.[0] ?? ''} ${data.patient.name?.[0]?.family ?? ''}`.trim() ||
            'Member',
        },
        authoredOn: new Date().toISOString(),
        requester: profile ? createReference(profile) : undefined,
        owner: profile ? createReference(profile) : undefined,
        extension: [{ url: CASE_TYPE_EXT, valueString: caseType }],
      };
      const savedCase = await medplum.createResource<Task>(newCase);
      // CM-21 AC-5 — DA-13 audit emission on case creation.
      void emitAudit(medplum, {
        action: 'case.created',
        patientRef: { reference: `Patient/${patientId}` },
        taskRef: savedCase.id ? { reference: `Task/${savedCase.id}` } : undefined,
        meta: { caseType, priority: casePriority },
      });
      showNotification({ color: 'green', message: 'Case created' });
      closeCaseModal();
      resetCaseForm();
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setCreatingCase(false);
    }
  }, [patientId, data.patient, caseSummary, caseType, casePriority, medplum, closeCaseModal, resetCaseForm, load]);

  const relationshipRows = useMemo(
    () => buildRelationshipRows(data.relatedPersons),
    [data.relatedPersons]
  );

  if (loading) {
    return (
      <Document>
        <Loader />
      </Document>
    );
  }

  if (!data.patient) {
    return (
      <Document>
        <Title order={3}>Member not found</Title>
        <Text c="dimmed" size="sm" mt="xs">No Patient resource for ID {patientId}.</Text>
      </Document>
    );
  }

  // CD-05 FR-7 — surface a consent-gap badge near the patient name when the
  // active telehealth-chi consent is missing or expiring within 30 days. The
  // CaseloadPage already shows the equivalent pill on each row; this card is
  // the second surface the spec calls out.
  const telehealthConsents = data.consents.filter((c) =>
    c.category?.some((cat) => cat.coding?.some((coding) => coding.code === CONSENT_CATEGORY_CODE))
  );
  const consentStatus = evaluateConsentStatus(telehealthConsents);
  const consentValid = consentStatus.state === 'on-file';
  const consentExpiringSoon =
    consentStatus.state === 'on-file' &&
    consentStatus.expiresOn !== undefined &&
    Date.parse(consentStatus.expiresOn) - Date.now() < 30 * 24 * 3600 * 1000;
  const ecmStatus = evaluateEcmStatus(data.ecmAttempts, data.patient, {
    consents: data.consents,
  });
  const ecmCapPct = Math.min(100, Math.round((ecmStatus.billable / ecmStatus.cap) * 100));

  return (
    <Document>
      <Stack gap="md">
        <MemberKeyInfoHeader patient={data.patient} coverages={data.coverages} consentValid={consentValid} />

        {/* CD-05 FR-7 — visible consent gap warning so the CHW can't miss it
            before launching a billable visit. */}
        {!consentValid && (
          <Alert color="red" variant="light" icon={<IconLock size={16} />}>
            <Group justify="space-between" wrap="wrap">
              <Text size="sm">
                <b>Telehealth + CHI consent {consentStatus.state === 'expired' ? 'expired' : 'missing'}.</b>{' '}
                Capture consent before launching a visit or recording any billable time.
              </Text>
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconSignature size={12} />}
                onClick={() => navigate('/consent')}
              >
                Capture consent
              </Button>
            </Group>
          </Alert>
        )}
        {consentExpiringSoon && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">
              <b>Consent expires {consentStatus.expiresOn ? formatDateTime(consentStatus.expiresOn) : ''}.</b>{' '}
              Refresh attestation to avoid a billing gap.
            </Text>
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="light"
            color="indigo"
            leftSection={<IconPhone size={14} />}
            onClick={openEcmModal}
          >
            Log outreach
          </Button>
          <Button
            variant="light"
            color="teal"
            leftSection={<IconMapPin size={14} />}
            onClick={openVisitModal}
          >
            Log field visit
          </Button>
          <Button
            variant="light"
            color="grape"
            leftSection={<IconPlus size={14} />}
            onClick={openCaseModal}
          >
            Create case
          </Button>
          {hasPermission('referrals.manage') && (
            <Button
              variant="light"
              color="orange"
              leftSection={<IconExternalLink size={14} />}
              onClick={() => navigate(`/referrals?patientId=${patientId}`)}
            >
              Refer to supplier
            </Button>
          )}
        </Group>

        {/* Clinical workflow — the second row of buttons exists so the on-stage
            demo never has to type a URL. Each button is permission-gated; the
            CHW sees what a CHW can do, the Provider sees Author plan + Start
            visit, etc. */}
        <Group justify="flex-end" gap="sm">
          {hasPermission('visit.conduct') && (
            <Button
              variant="filled"
              color="blue"
              leftSection={<IconVideo size={14} />}
              loading={startingVisit}
              onClick={handleStartVisit}
            >
              Start telehealth visit
            </Button>
          )}
          {hasPermission('careplan.author') && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconNotes size={14} />}
              onClick={() => navigate('/plan-of-care')}
            >
              Author plan
            </Button>
          )}
          {hasPermission('careplan.review') && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconClipboardCheck size={14} />}
              onClick={() => navigate(`/plan-review?patient=${data.patient.id}`)}
            >
              Review plan
            </Button>
          )}
          {hasPermission('careplan.edit') && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconStethoscope size={14} />}
              onClick={() => navigate('/plan-edit')}
            >
              Edit plan
            </Button>
          )}
          {hasPermission('eligibility.check') && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconShieldCheck size={14} />}
              onClick={() => navigate('/eligibility')}
            >
              Eligibility
            </Button>
          )}
          {hasPermission('time.track') && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconClock size={14} />}
              onClick={() => navigate('/time-tracking')}
            >
              Time tracking
            </Button>
          )}
          {hasPermission('consent.capture') && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconSignature size={14} />}
              onClick={() => navigate('/consent')}
            >
              Capture consent
            </Button>
          )}
        </Group>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Demographics" icon={<IconHome size={16} />}>
              <DemographicsBlock patient={data.patient} />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Active conditions" icon={<IconStethoscope size={16} />} count={data.conditions.length}>
              <ItemList
                items={data.conditions.slice(0, 5).map((c) => ({
                  key: c.id ?? '',
                  primary: c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Untitled',
                  secondary: c.recordedDate ? `Recorded ${formatDateTime(c.recordedDate)}` : undefined,
                }))}
                empty="No active conditions on file."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Medications" icon={<IconPill size={16} />} count={data.medications.length}>
              <ItemList
                items={data.medications.slice(0, 5).map((m) => ({
                  key: m.id ?? '',
                  primary:
                    m.medicationCodeableConcept?.text ??
                    m.medicationCodeableConcept?.coding?.[0]?.display ??
                    'Medication',
                  secondary: m.dosageInstruction?.[0]?.text ?? undefined,
                }))}
                empty="No active medications."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Allergies" icon={<IconVirus size={16} />} count={data.allergies.length}>
              <ItemList
                items={data.allergies.slice(0, 5).map((a) => ({
                  key: a.id ?? '',
                  primary: a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Allergy',
                  secondary: a.criticality ? `Criticality: ${a.criticality}` : undefined,
                }))}
                empty="No known allergies."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <RelationshipsCard
              rows={relationshipRows}
              patientId={patientId}
              onEditExternal={() => navigate(`/RelatedPerson?patient=Patient/${patientId}`)}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Consents" icon={<IconNotes size={16} />} count={data.consents.length}>
              <ItemList
                items={data.consents.slice(0, 5).map((c) => ({
                  key: c.id ?? '',
                  primary: c.category?.[0]?.text ?? c.category?.[0]?.coding?.[0]?.display ?? 'Consent',
                  secondary: c.dateTime
                    ? `${c.status} · ${formatDateTime(c.dateTime)}`
                    : c.status,
                }))}
                empty="No consents recorded."
              />
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title="Active care plan" icon={<IconCalendar size={16} />} count={data.carePlans.length}>
              <ItemList
                items={data.carePlans.slice(0, 3).map((p) => ({
                  key: p.id ?? '',
                  primary: p.title ?? 'Care plan',
                  secondary: p.period?.start ? `Started ${formatDateTime(p.period.start)}` : undefined,
                }))}
                empty="No active care plan."
              />
            </SectionCard>
          </Grid.Col>

          {/* CM-22 — ECM outreach panel: cap counter, window counter,
              billable vs non-billable breakdown. */}
          <Grid.Col span={12}>
            <SectionCard
              title="ECM outreach"
              icon={<IconPhone size={16} />}
              count={ecmStatus.attempts}
            >
              <Stack gap="sm">
                <Group justify="space-between" wrap="wrap">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text fw={700} size="lg" ff="monospace">
                        {ecmStatus.billable} of {ecmStatus.cap}
                      </Text>
                      <Text size="sm" c="dimmed">
                        billable attempts this window
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {ecmStatus.nonBillable > 0 && `${ecmStatus.nonBillable} non-billable · `}
                      {ecmStatus.windowClosed
                        ? 'Window closed'
                        : `${ecmStatus.daysRemaining} day${ecmStatus.daysRemaining === 1 ? '' : 's'} remaining in ${ECM_WINDOW_DAYS_DEFAULT}-day window`}
                    </Text>
                  </Stack>
                  <Group gap="xs">
                    {!ecmStatus.consentOnFile && (
                      <Badge color="red" variant="filled" size="md">
                        ECM consent missing
                      </Badge>
                    )}
                    {ecmStatus.capReached && (
                      <Badge color="red" variant="filled" size="md">
                        Cap reached · further attempts non-billable
                      </Badge>
                    )}
                    {!ecmStatus.capReached && ecmStatus.approachingCap && (
                      <Badge color="orange" variant="filled" size="md">
                        Approaching cap
                      </Badge>
                    )}
                    {ecmStatus.windowClosed && (
                      <Badge color="gray" variant="light" size="md">
                        Window closed
                      </Badge>
                    )}
                    {ecmStatus.consentOnFile && !ecmStatus.capReached && !ecmStatus.approachingCap && !ecmStatus.windowClosed && (
                      <Badge color="green" variant="light" size="md">
                        Within cap
                      </Badge>
                    )}
                  </Group>
                </Group>
                <Progress
                  value={ecmCapPct}
                  size="md"
                  color={ecmStatus.capReached ? 'red' : ecmStatus.approachingCap ? 'orange' : 'green'}
                />
                {(ecmStatus.capReached || ecmStatus.windowClosed) && (
                  <Alert color="yellow" variant="light">
                    <Text size="xs">
                      Per CM-22 §AC, further outreach is still permitted but flagged
                      non-billable. The ECM cap and window are admin-configurable per program (DA-08).
                    </Text>
                  </Alert>
                )}
                {!ecmStatus.consentOnFile && (
                  <Alert color="red" variant="light" icon={<IconLock size={14} />}>
                    <Text size="xs">
                      No active ECM enrollment consent on file. Per CM-22 AC-3 every attempt is
                      tracked for compliance but flagged <b>non-billable</b> until consent is
                      captured. {ecmStatus.preConsentAttempts > 0 && (
                        <>
                          <b>{ecmStatus.preConsentAttempts}</b> attempt
                          {ecmStatus.preConsentAttempts === 1 ? '' : 's'} this window are
                          pre-consent.
                        </>
                      )}
                    </Text>
                  </Alert>
                )}
                {data.ecmAttempts.length > 0 && (
                  <Stack gap={4}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Recent attempts
                    </Text>
                    {data.ecmAttempts.slice(0, 5).map((c) => {
                      const channel = c.extension?.find((e) => e.url === ECM_CHANNEL_EXT)?.valueString;
                      const outcome = c.extension?.find((e) => e.url === ECM_OUTCOME_EXT)?.valueString;
                      const billable = c.extension?.find((e) => e.url === ECM_BILLABLE_EXT)?.valueBoolean;
                      const channelLabel =
                        ECM_CHANNELS.find((ch) => ch.value === channel)?.label ?? channel ?? '—';
                      const outcomeLabel =
                        ECM_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome ?? '—';
                      return (
                        <Group
                          key={c.id}
                          justify="space-between"
                          wrap="nowrap"
                          p="xs"
                          style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
                        >
                          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                            <Text size="sm" fw={500}>
                              {channelLabel} · {outcomeLabel}
                            </Text>
                            {c.payload?.[0]?.contentString && (
                              <Text size="xs" c="dimmed" truncate>
                                {c.payload[0].contentString}
                              </Text>
                            )}
                            {c.sent && (
                              <Text size="xs" c="dimmed" ff="monospace">
                                {formatDateTime(c.sent)}
                                {c.sender?.display ? ` · ${c.sender.display}` : ''}
                              </Text>
                            )}
                          </Stack>
                          <Badge
                            color={billable ? 'green' : 'gray'}
                            variant="light"
                            size="xs"
                          >
                            {billable ? 'billable' : 'non-billable'}
                          </Badge>
                        </Group>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <SectionCard
              title="Recent field visits"
              icon={<IconMapPin size={16} />}
              count={data.fieldVisits.length}
            >
              {data.fieldVisits.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No field visits logged yet. Click "Log field visit" above to capture a home,
                  community, or phone touchpoint.
                </Text>
              ) : (
                <Stack gap="xs">
                  {data.fieldVisits.slice(0, 6).map((visit) => {
                    const dispoCode = visit.reasonCode?.[0]?.coding?.[0]?.code ?? 'completed';
                    const dispoLabel =
                      FIELD_VISIT_DISPOSITIONS.find((d) => d.value === dispoCode)?.label ??
                      dispoCode;
                    const locationLabel = visit.type?.[0]?.text ?? 'Field visit';
                    const note = visit.reasonCode?.[0]?.text;
                    return (
                      <Group
                        key={visit.id}
                        justify="space-between"
                        wrap="nowrap"
                        p="xs"
                        style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
                      >
                        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={500}>
                            {locationLabel}
                          </Text>
                          {note && (
                            <Text size="xs" c="dimmed" truncate>
                              {note}
                            </Text>
                          )}
                          {visit.period?.start && (
                            <Text size="xs" c="dimmed" ff="monospace">
                              {formatDateTime(visit.period.start)} ·{' '}
                              {visit.participant?.[0]?.individual?.display ?? 'CHW'}
                            </Text>
                          )}
                        </Stack>
                        <Badge
                          color={
                            dispoCode === 'completed'
                              ? 'green'
                              : dispoCode === 'partial'
                                ? 'yellow'
                                : 'gray'
                          }
                          size="xs"
                          variant="light"
                        >
                          {dispoLabel}
                        </Badge>
                      </Group>
                    );
                  })}
                </Stack>
              )}
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <SectionCard
              title="Open cases"
              icon={<IconBriefcase size={16} />}
              count={data.cases.filter((c) => c.status !== 'completed' && c.status !== 'cancelled').length}
            >
              {data.cases.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No cases for this member. Click "Create case" above to track an SDoH need, PCP referral,
                  eligibility issue, or any ad-hoc case.
                </Text>
              ) : (
                <Stack gap="xs">
                  {data.cases.slice(0, 6).map((task) => {
                    const typeCode =
                      task.extension?.find((e) => e.url === CASE_TYPE_EXT)?.valueString ?? 'other';
                    const closed = task.status === 'completed' || task.status === 'cancelled';
                    return (
                      <Group
                        key={task.id}
                        justify="space-between"
                        wrap="nowrap"
                        p="xs"
                        style={{
                          borderBottom: '1px solid var(--mantine-color-gray-2)',
                          cursor: 'pointer',
                          opacity: closed ? 0.6 : 1,
                        }}
                        onClick={() => task.id && navigate(`/Task/${task.id}`)}
                      >
                        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={500} c="blue" truncate>
                            {caseTypeLabel(typeCode)}
                          </Text>
                          {task.description && (
                            <Text size="xs" c="dimmed" truncate>
                              {task.description}
                            </Text>
                          )}
                          {task.authoredOn && (
                            <Text size="xs" c="dimmed" ff="monospace">
                              opened {formatDateTime(task.authoredOn)}
                            </Text>
                          )}
                        </Stack>
                        <Group gap={6}>
                          {task.priority && (
                            <Badge
                              color={task.priority === 'asap' ? 'red' : task.priority === 'urgent' ? 'orange' : 'blue'}
                              size="xs"
                              variant="light"
                            >
                              {CASE_PRIORITIES.find((p) => p.value === task.priority)?.label ?? task.priority}
                            </Badge>
                          )}
                          <Badge
                            color={closed ? 'gray' : task.status === 'in-progress' ? 'blue' : 'yellow'}
                            size="xs"
                            variant="light"
                          >
                            {task.status}
                          </Badge>
                        </Group>
                      </Group>
                    );
                  })}
                </Stack>
              )}
            </SectionCard>
          </Grid.Col>

          <Grid.Col span={12}>
            <SectionCard title="Recent interactions" icon={<IconHistory size={16} />} count={data.communications.length}>
              <ItemList
                items={data.communications.slice(0, 6).map((c) => ({
                  key: c.id ?? '',
                  primary: c.payload?.[0]?.contentString ?? c.topic?.text ?? 'Communication',
                  secondary: c.sent ? `${c.status} · ${formatDateTime(c.sent)}` : c.status,
                }))}
                empty="No interactions in the last 30 days."
              />
            </SectionCard>
          </Grid.Col>
        </Grid>

        <Group justify="flex-end">
          <Text size="sm" c="dimmed">
            <Link to={`/Patient/${patientId}`} style={{ color: 'var(--mantine-color-orange-6)' }}>
              Open full chart <IconChevronRight size={12} style={{ verticalAlign: 'middle' }} />
            </Link>
          </Text>
        </Group>
      </Stack>

      {/* CM-22: Log ECM outreach attempt. Creates a Communication with
          category=ecm-outreach + channel/outcome/billable extensions. The
          ECM panel above re-evaluates the cap once the attempt persists. */}
      <Modal
        opened={ecmModalOpened}
        onClose={() => {
          closeEcmModal();
          resetEcmForm();
        }}
        title="Log ECM outreach attempt"
        size="md"
      >
        <Stack gap="md">
          <Alert color="indigo" variant="light" icon={<IconPhone size={16} />}>
            <Text size="sm">
              Per CM-22 every attempt counts toward the {ECM_CAP_DEFAULT}-attempt cap within{' '}
              {ECM_WINDOW_DAYS_DEFAULT} days. Refused / wrong-number outcomes are recorded but
              flagged non-billable. Cap-reached doesn't block — it just downgrades.
            </Text>
          </Alert>
          <Select
            label="Channel"
            data={ECM_CHANNELS}
            value={ecmChannel}
            onChange={(v) => setEcmChannel((v as EcmChannel) ?? 'call')}
            allowDeselect={false}
            required
          />
          <Select
            label="Outcome"
            data={ECM_OUTCOMES.map((o) => ({
              value: o.value,
              label: `${o.label} · ${o.billable ? 'billable' : 'non-billable'}`,
            }))}
            value={ecmOutcome}
            onChange={(v) => setEcmOutcome((v as EcmOutcome) ?? 'reached')}
            allowDeselect={false}
            required
          />
          <Textarea
            label="Notes"
            placeholder="What did you cover, what's next?"
            value={ecmNotes}
            onChange={(e) => setEcmNotes(e.currentTarget.value)}
            minRows={2}
            autosize
          />
          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => {
                closeEcmModal();
                resetEcmForm();
              }}
              disabled={loggingEcm}
            >
              Cancel
            </Button>
            <Button
              color="indigo"
              leftSection={<IconPhone size={14} />}
              loading={loggingEcm}
              disabled={loggingEcm}
              onClick={handleLogEcmAttempt}
            >
              Log attempt
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* CM-13 AC-4: Log field visit. Creates an Encounter with class=FLD,
          type carrying the location, reasonCode carrying the disposition,
          and reasonCode.text carrying the free-text note. */}
      <Modal
        opened={visitModalOpened}
        onClose={() => {
          closeVisitModal();
          resetVisitForm();
        }}
        title="Log field visit"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            type="datetime-local"
            label="Date & time"
            value={visitDate}
            onChange={(e) => setVisitDate(e.currentTarget.value)}
            required
          />
          <Select
            label="Location"
            data={FIELD_VISIT_LOCATIONS}
            value={visitLocation}
            onChange={(v) => setVisitLocation(v ?? 'home')}
            allowDeselect={false}
          />
          <Select
            label="Disposition"
            data={FIELD_VISIT_DISPOSITIONS}
            value={visitDisposition}
            onChange={(v) => setVisitDisposition(v ?? 'completed')}
            allowDeselect={false}
          />
          <Textarea
            label="Notes"
            placeholder="What you observed, follow-ups, anything the next CHW should know"
            value={visitNotes}
            onChange={(e) => setVisitNotes(e.currentTarget.value)}
            minRows={3}
            autosize
          />
          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => {
                closeVisitModal();
                resetVisitForm();
              }}
              disabled={loggingVisit}
            >
              Cancel
            </Button>
            <Button
              color="teal"
              leftSection={<IconMapPin size={14} />}
              loading={loggingVisit}
              disabled={loggingVisit}
              onClick={handleLogFieldVisit}
            >
              Log field visit
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* CM-21: Manual case creation. Creates a Task with category=case-management
          + case-type extension. Surfaces in the Open cases card above. */}
      <Modal
        opened={caseModalOpened}
        onClose={() => {
          closeCaseModal();
          resetCaseForm();
        }}
        title="Create case"
        size="md"
      >
        <Stack gap="md">
          <Select
            label="Case type"
            data={CASE_TYPES}
            value={caseType}
            onChange={(v) => setCaseType(v ?? 'other')}
            allowDeselect={false}
            required
          />
          <Textarea
            label="Summary"
            placeholder="What's the need or issue? Include context the next CHW would want."
            value={caseSummary}
            onChange={(e) => setCaseSummary(e.currentTarget.value)}
            minRows={3}
            autosize
            required
          />
          <Select
            label="Priority"
            data={CASE_PRIORITIES}
            value={casePriority}
            onChange={(v) => setCasePriority(v ?? 'urgent')}
            allowDeselect={false}
          />
          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => {
                closeCaseModal();
                resetCaseForm();
              }}
              disabled={creatingCase}
            >
              Cancel
            </Button>
            <Button
              color="grape"
              leftSection={<IconBriefcase size={14} />}
              loading={creatingCase}
              disabled={creatingCase || !caseSummary.trim()}
              onClick={handleCreateCase}
            >
              Create case
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}

function SectionCard({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <Card withBorder radius="md" padding="md" h="100%">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap={8}>
            {icon}
            <Title order={6}>{title}</Title>
          </Group>
          {count !== undefined && count > 0 && (
            <Badge variant="light" color="gray">{count}</Badge>
          )}
        </Group>
        {children}
      </Stack>
    </Card>
  );
}

function ItemList({
  items,
  empty,
}: {
  items: { key: string; primary: string; secondary?: string }[];
  empty: string;
}): JSX.Element {
  if (items.length === 0) {
    return <Text size="sm" c="dimmed">{empty}</Text>;
  }
  return (
    <Stack gap="xs">
      {items.map((it) => (
        <Stack key={it.key} gap={2}>
          <Text size="sm" fw={500}>{it.primary}</Text>
          {it.secondary && <Text size="xs" c="dimmed">{it.secondary}</Text>}
        </Stack>
      ))}
    </Stack>
  );
}

function DemographicsBlock({ patient }: { patient: Patient | undefined }): JSX.Element {
  if (!patient) return <Text size="sm" c="dimmed">No demographics on file.</Text>;
  const home = patient.address?.find((a) => a.use === 'home') ?? patient.address?.[0];
  const fullAddress = home
    ? [home.line?.join(', '), home.city, home.state, home.postalCode].filter(Boolean).join(', ')
    : null;
  return (
    <Stack gap={6}>
      <Row label="Born" value={patient.birthDate ?? '—'} />
      <Row label="Marital" value={patient.maritalStatus?.text ?? patient.maritalStatus?.coding?.[0]?.display ?? '—'} />
      <Row label="Address" value={fullAddress ?? '—'} />
      <Row label="Email" value={patient.telecom?.find((t) => t.system === 'email')?.value ?? '—'} />
      <Row label="Phone" value={patient.telecom?.find((t) => t.system === 'phone')?.value ?? '—'} />
    </Stack>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Group gap={8} justify="space-between" wrap="nowrap">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
      <Text size="sm" style={{ textAlign: 'right' }}>{value}</Text>
    </Group>
  );
}

function RelationshipsCard({
  rows,
  patientId,
  onEditExternal,
}: {
  rows: RelationshipRow[];
  patientId: string | undefined;
  onEditExternal: () => void;
}): JSX.Element {
  return (
    <Card withBorder radius="md" padding="md" h="100%">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap={8}>
            <IconHeartHandshake size={16} />
            <Title order={6}>Relationships</Title>
          </Group>
          {rows.length > 0 && <Badge variant="light" color="gray">{rows.length}</Badge>}
        </Group>
        {rows.length === 0 ? (
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              No caregivers, family, or contacts on file.
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              leftSection={<IconExternalLink size={12} />}
              onClick={onEditExternal}
              disabled={!patientId}
            >
              Manage RelatedPerson records
            </Button>
          </Stack>
        ) : (
          <Stack gap={6}>
            {rows.slice(0, 6).map((r) => (
              <Stack key={r.key} gap={2}>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500}>{r.name}</Text>
                  {r.primary && (
                    <Badge color="orange" variant="light" size="sm">Primary</Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {[r.relationship, r.phone, r.email].filter(Boolean).join(' · ') || '—'}
                </Text>
              </Stack>
            ))}
            <Group justify="flex-end" mt={4}>
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconExternalLink size={12} />}
                onClick={onEditExternal}
                disabled={!patientId}
              >
                Edit on Patient form
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
