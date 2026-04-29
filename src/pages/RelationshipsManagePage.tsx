// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-13 Relationships management — CHW-facing list + create/edit form for the
// member's RelatedPerson resources. Replaces Medplum's auto-generated form
// with curated relationship-type chips, a single phone+email contact panel,
// and a primary-contact toggle that maps to our internal extension. Mark-
// inactive is the soft delete (RelatedPerson.active = false).

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Patient, RelatedPerson } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import {
  IconArrowLeft,
  IconHeartHandshake,
  IconMail,
  IconPencil,
  IconPhone,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router';

const PRIMARY_CONTACT_EXT = 'https://widercircle.com/fhir/StructureDefinition/primary-contact';

interface RelationshipOption {
  value: string;
  label: string;
  // RoleCode coding system used in FHIR for personal/family relationships.
  system: string;
}

// Curated set of common WC relationship types. Free-text "Other" stays as
// CodeableConcept.text so unusual relationships ("neighbor", "case worker")
// stay representable.
const RELATIONSHIP_OPTIONS: RelationshipOption[] = [
  { value: 'CAREGIVER', label: 'Caregiver', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'SPS', label: 'Spouse / Partner', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'MTH', label: 'Parent — Mother', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'FTH', label: 'Parent — Father', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'PRN', label: 'Parent', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'CHILD', label: 'Child', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'SIB', label: 'Sibling', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'FRND', label: 'Friend', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
  { value: 'C', label: 'Emergency contact', system: 'http://terminology.hl7.org/CodeSystem/v2-0131' },
  { value: 'CP', label: 'Primary care provider', system: 'http://terminology.hl7.org/CodeSystem/v2-0131' },
  { value: 'OTHER', label: 'Other (free-text)', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' },
];

interface FormState {
  givenName: string;
  familyName: string;
  relationshipCode: string;
  relationshipText: string;
  phone: string;
  email: string;
  preferredLanguage: string;
  primary: boolean;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  givenName: '',
  familyName: '',
  relationshipCode: 'CAREGIVER',
  relationshipText: '',
  phone: '',
  email: '',
  preferredLanguage: '',
  primary: false,
  active: true,
};

const formFromResource = (rp: RelatedPerson): FormState => {
  const name = rp.name?.[0];
  const rel = rp.relationship?.[0];
  const code = rel?.coding?.[0]?.code;
  const known = RELATIONSHIP_OPTIONS.find((o) => o.value === code);
  const phone = rp.telecom?.find((t) => t.system === 'phone')?.value ?? '';
  const email = rp.telecom?.find((t) => t.system === 'email')?.value ?? '';
  const primary = Boolean(
    rp.extension?.find((e) => e.url === PRIMARY_CONTACT_EXT && e.valueBoolean === true)
  );
  return {
    givenName: name?.given?.[0] ?? '',
    familyName: name?.family ?? '',
    relationshipCode: known?.value ?? 'OTHER',
    relationshipText: known ? '' : rel?.text ?? '',
    phone,
    email,
    preferredLanguage: rp.communication?.find((c) => c.preferred)?.language?.text ?? '',
    primary,
    active: rp.active !== false,
  };
};

const buildResource = (form: FormState, patientId: string, base?: RelatedPerson): RelatedPerson => {
  const opt = RELATIONSHIP_OPTIONS.find((o) => o.value === form.relationshipCode);
  const isOther = form.relationshipCode === 'OTHER';
  const relationship = [
    {
      coding:
        opt && !isOther
          ? [{ system: opt.system, code: opt.value, display: opt.label }]
          : undefined,
      text: isOther
        ? form.relationshipText.trim() || 'Other'
        : (opt?.label ?? form.relationshipText.trim() ?? undefined) || undefined,
    },
  ];
  const telecom: RelatedPerson['telecom'] = [];
  if (form.phone.trim()) {
    telecom.push({ system: 'phone', value: form.phone.trim(), rank: 1 });
  }
  if (form.email.trim()) {
    telecom.push({ system: 'email', value: form.email.trim(), rank: 2 });
  }
  const extensions = [
    { url: PRIMARY_CONTACT_EXT, valueBoolean: form.primary },
  ];
  return {
    ...base,
    resourceType: 'RelatedPerson',
    active: form.active,
    patient: { reference: `Patient/${patientId}` },
    name: [
      {
        given: form.givenName.trim() ? [form.givenName.trim()] : undefined,
        family: form.familyName.trim() || undefined,
      },
    ],
    relationship,
    telecom: telecom.length > 0 ? telecom : undefined,
    communication: form.preferredLanguage.trim()
      ? [{ language: { text: form.preferredLanguage.trim() }, preferred: true }]
      : undefined,
    extension: extensions,
  };
};

export function RelationshipsManagePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { patientId } = useParams<{ patientId: string }>();

  const [patient, setPatient] = useState<Patient | undefined>();
  const [rows, setRows] = useState<RelatedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<RelatedPerson | undefined>();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [pt, related] = await Promise.all([
        medplum.readResource('Patient', patientId).catch(() => undefined),
        medplum
          .searchResources(
            'RelatedPerson',
            `patient=Patient/${patientId}&_count=50&_sort=-_lastUpdated`
          )
          .catch(() => [] as RelatedPerson[]),
      ]);
      setPatient(pt);
      setRows(related);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, patientId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const startCreate = (): void => {
    setEditing(undefined);
    setForm(EMPTY_FORM);
    openModal();
  };

  const startEdit = (rp: RelatedPerson): void => {
    setEditing(rp);
    setForm(formFromResource(rp));
    openModal();
  };

  const save = async (): Promise<void> => {
    if (!patientId) return;
    if (!form.givenName.trim() && !form.familyName.trim()) {
      showNotification({ color: 'red', message: 'Enter at least a first or last name.' });
      return;
    }
    if (form.relationshipCode === 'OTHER' && !form.relationshipText.trim()) {
      showNotification({ color: 'red', message: 'Describe the relationship type.' });
      return;
    }
    setSaving(true);
    try {
      const payload = buildResource(form, patientId, editing);
      if (editing?.id) {
        await medplum.updateResource<RelatedPerson>({ ...payload, id: editing.id });
        showNotification({ color: 'green', message: 'Relationship updated' });
      } else {
        await medplum.createResource<RelatedPerson>(payload);
        showNotification({ color: 'green', message: 'Relationship added' });
      }
      closeModal();
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  };

  const markInactive = async (rp: RelatedPerson): Promise<void> => {
    if (!rp.id) return;
    try {
      await medplum.updateResource<RelatedPerson>({ ...rp, active: false });
      showNotification({ color: 'yellow', message: 'Relationship marked inactive' });
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  };

  if (loading) {
    return (
      <Document>
        <Loader />
      </Document>
    );
  }

  const memberLabel = `${patient?.name?.[0]?.given?.[0] ?? ''} ${patient?.name?.[0]?.family ?? ''}`.trim() || 'Member';
  const visibleRows = rows;

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Stack gap={2}>
            <Group gap={8}>
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<IconArrowLeft size={14} />}
                onClick={() => navigate(`/members/${patientId}`)}
              >
                Back to {memberLabel}
              </Button>
            </Group>
            <Title order={2}>Relationships</Title>
            <Text c="dimmed" size="sm">
              Caregivers, family, and contacts tied to {memberLabel}. Each row is a FHIR RelatedPerson and can be referenced from messages, consents, and visits.
            </Text>
          </Stack>
          <Button color="orange" leftSection={<IconPlus size={16} />} onClick={startCreate}>
            Add relationship
          </Button>
        </Group>

        {visibleRows.length === 0 ? (
          <Alert color="gray" variant="light" title="No relationships on file">
            <Text size="sm">Click <b>Add relationship</b> to record a caregiver, family member, or other contact.</Text>
          </Alert>
        ) : (
          <Stack gap="xs">
            {visibleRows.map((rp) => (
              <RelationshipRowCard
                key={rp.id}
                rp={rp}
                onEdit={() => startEdit(rp)}
                onArchive={() => {
                  markInactive(rp).catch(() => undefined);
                }}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editing ? 'Edit relationship' : 'Add relationship'}
        size="lg"
        withinPortal
      >
        <Stack gap="sm">
          <Group grow>
            <TextInput
              label="First name"
              value={form.givenName}
              onChange={(e) => setForm({ ...form, givenName: e.currentTarget.value })}
              required
            />
            <TextInput
              label="Last name"
              value={form.familyName}
              onChange={(e) => setForm({ ...form, familyName: e.currentTarget.value })}
            />
          </Group>

          <Select
            label="Relationship type"
            data={RELATIONSHIP_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={form.relationshipCode}
            onChange={(v) => setForm({ ...form, relationshipCode: v ?? 'CAREGIVER' })}
            withCheckIcon={false}
          />
          {form.relationshipCode === 'OTHER' && (
            <TextInput
              label="Describe the relationship"
              placeholder="e.g. Neighbor, Pastor, Case worker"
              value={form.relationshipText}
              onChange={(e) => setForm({ ...form, relationshipText: e.currentTarget.value })}
              required
            />
          )}

          <Group grow>
            <TextInput
              leftSection={<IconPhone size={14} />}
              label="Phone"
              placeholder="555-555-5555"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })}
            />
            <TextInput
              leftSection={<IconMail size={14} />}
              label="Email (optional)"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
            />
          </Group>

          <TextInput
            label="Preferred language (optional)"
            placeholder="Spanish, English, ASL…"
            value={form.preferredLanguage}
            onChange={(e) => setForm({ ...form, preferredLanguage: e.currentTarget.value })}
          />

          <Card withBorder radius="sm" padding="sm">
            <Stack gap="xs">
              <Switch
                label="Primary contact"
                description="Surface as the primary contact on the member profile and in CHW outreach."
                checked={form.primary}
                onChange={(e) => setForm({ ...form, primary: e.currentTarget.checked })}
              />
              <Switch
                label="Active"
                description="Inactive relationships are hidden from the Relationships card on the member profile."
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.currentTarget.checked })}
              />
            </Stack>
          </Card>

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button
              color="orange"
              onClick={() => {
                save().catch(() => undefined);
              }}
              loading={saving}
            >
              {editing ? 'Save changes' : 'Add relationship'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}

function RelationshipRowCard({
  rp,
  onEdit,
  onArchive,
}: {
  rp: RelatedPerson;
  onEdit: () => void;
  onArchive: () => void;
}): JSX.Element {
  const name = `${rp.name?.[0]?.given?.[0] ?? ''} ${rp.name?.[0]?.family ?? ''}`.trim() || 'Unnamed contact';
  const rel = rp.relationship?.[0];
  const relLabel = rel?.text ?? rel?.coding?.[0]?.display ?? null;
  const phone = rp.telecom?.find((t) => t.system === 'phone')?.value;
  const email = rp.telecom?.find((t) => t.system === 'email')?.value;
  const lang = rp.communication?.find((c) => c.preferred)?.language?.text;
  const primary = Boolean(
    rp.extension?.find((e) => e.url === PRIMARY_CONTACT_EXT && e.valueBoolean === true) ||
      rp.relationship?.some((r) => r.coding?.some((c) => c.code === 'C' || c.code === 'CP'))
  );
  const inactive = rp.active === false;

  return (
    <Card withBorder radius="md" padding="md" style={{ opacity: inactive ? 0.55 : 1 }}>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            <IconHeartHandshake size={14} />
            <Text fw={600}>{name}</Text>
            {primary && <Badge color="orange" variant="light" size="sm">Primary</Badge>}
            {inactive && <Badge color="gray" variant="filled" size="sm">Inactive</Badge>}
            {relLabel && <Badge color="gray" variant="light" size="sm">{relLabel}</Badge>}
          </Group>
          <Group gap={12}>
            {phone && (
              <Text size="xs" c="dimmed"><IconPhone size={11} style={{ verticalAlign: 'middle' }}/> {phone}</Text>
            )}
            {email && (
              <Text size="xs" c="dimmed"><IconMail size={11} style={{ verticalAlign: 'middle' }}/> {email}</Text>
            )}
            {lang && (
              <Text size="xs" c="dimmed">Language: {lang}</Text>
            )}
          </Group>
        </Stack>
        <Group gap={4}>
          <ActionIcon variant="subtle" color="orange" aria-label="Edit relationship" onClick={onEdit}>
            <IconPencil size={16} />
          </ActionIcon>
          {!inactive && (
            <ActionIcon variant="subtle" color="red" aria-label="Mark inactive" onClick={onArchive}>
              <IconTrash size={16} />
            </ActionIcon>
          )}
        </Group>
      </Group>
    </Card>
  );
}
