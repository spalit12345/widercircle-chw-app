// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// CM-03 — reusable key-info header. Renders Plan ID, primary language,
// state/ZIP, preferred contact method, risk tier, and warning badges
// (deceased, consent missing). Composed by CM-02 (member 360), CC-04
// (in-call profile), and any place we need the member's "above-the-fold"
// context strip.

import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import { calculateAgeString, formatHumanName } from '@medplum/core';
import { formatAgeString } from '../utils/age';
import type { Coverage, HumanName, Patient } from '@medplum/fhirtypes';
import { IconAlertTriangle, IconBriefcase, IconLanguage, IconMapPin, IconPhone, IconShieldCheck } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface MemberKeyInfoHeaderProps {
  patient: Patient | undefined;
  coverages?: Coverage[];
  riskTier?: string | null;
  consentValid?: boolean;
}

const RISK_TIER_TONE: Record<string, string> = {
  '1': 'green',
  '2': 'green',
  '3': 'yellow',
  '4': 'red',
};

function preferredName(name: HumanName[] | undefined): string {
  const usual = name?.find((n) => n.use === 'usual') ?? name?.[0];
  return usual ? formatHumanName(usual) : 'Unknown';
}

function primaryLanguage(patient: Patient | undefined): string | null {
  const comm = patient?.communication?.find((c) => c.preferred) ?? patient?.communication?.[0];
  return comm?.language?.text ?? comm?.language?.coding?.[0]?.display ?? null;
}

function homeZip(patient: Patient | undefined): { state: string | null; zip: string | null } {
  const home = patient?.address?.find((a) => a.use === 'home') ?? patient?.address?.[0];
  return { state: home?.state ?? null, zip: home?.postalCode ?? null };
}

function preferredContact(patient: Patient | undefined): string | null {
  const tel = patient?.telecom?.find((t) => t.rank === 1) ?? patient?.telecom?.[0];
  if (!tel) return null;
  const sys = tel.system ?? 'contact';
  return `${sys}: ${tel.value ?? ''}`.trim();
}

function planLabel(coverages: Coverage[] | undefined): { name: string | null; planId: string | null } {
  const active = coverages?.find((c) => c.status === 'active') ?? coverages?.[0];
  if (!active) return { name: null, planId: null };
  const name = active.payor?.[0]?.display ?? null;
  const planId =
    active.subscriberId ??
    active.identifier?.find((i) => i.type?.coding?.some((c) => c.code === 'MB'))?.value ??
    active.identifier?.[0]?.value ??
    null;
  return { name, planId };
}

function readRiskTier(patient: Patient | undefined): string | null {
  const ext = patient?.extension?.find((e) =>
    e.url === 'https://widercircle.com/fhir/StructureDefinition/risk-tier'
  );
  return ext?.valueString ?? ext?.valueCodeableConcept?.coding?.[0]?.code ?? null;
}

export function MemberKeyInfoHeader({
  patient,
  coverages,
  riskTier,
  consentValid,
}: MemberKeyInfoHeaderProps): JSX.Element {
  const name = preferredName(patient?.name);
  const lang = primaryLanguage(patient);
  const { state, zip } = homeZip(patient);
  const contact = preferredContact(patient);
  const { name: planName, planId } = planLabel(coverages);
  const tier = riskTier ?? readRiskTier(patient);
  const tierTone = tier ? RISK_TIER_TONE[tier] ?? 'gray' : 'gray';
  const ageString = patient?.birthDate ? formatAgeString(calculateAgeString(patient.birthDate)) : null;
  const deceased = Boolean(patient?.deceasedBoolean) || Boolean(patient?.deceasedDateTime);

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2}>
            <Group gap={8}>
              <Text fw={700} size="lg" ff="Montserrat, system-ui, sans-serif">{name}</Text>
              {ageString && <Badge color="gray" variant="light">{ageString}</Badge>}
              {patient?.gender && (
                <Badge color="gray" variant="light" tt="capitalize">{patient.gender}</Badge>
              )}
              {deceased && (
                <Badge color="red" leftSection={<IconAlertTriangle size={12} />}>Deceased</Badge>
              )}
              {consentValid === false && (
                <Badge color="orange" variant="filled" leftSection={<IconAlertTriangle size={12} />}>
                  Consent missing
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" ff="monospace">{patient?.id ?? '—'}</Text>
          </Stack>
          {tier && (
            <Badge color={tierTone} variant="filled" size="lg">Risk tier {tier}</Badge>
          )}
        </Group>

        <Group gap="lg" wrap="wrap">
          <KeyField icon={<IconShieldCheck size={14} />} label="Plan" value={planName ?? '—'} />
          <KeyField icon={<IconBriefcase size={14} />} label="Plan ID" value={planId ?? '—'} mono />
          <KeyField icon={<IconLanguage size={14} />} label="Language" value={lang ?? '—'} />
          <KeyField
            icon={<IconMapPin size={14} />}
            label="Location"
            value={state || zip ? `${state ?? ''}${state && zip ? ' · ' : ''}${zip ?? ''}` : '—'}
          />
          <KeyField icon={<IconPhone size={14} />} label="Preferred contact" value={contact ?? '—'} />
        </Group>
      </Stack>
    </Card>
  );
}

function KeyField({
  icon,
  label,
  value,
  mono,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <Stack gap={2}>
      <Group gap={6}>
        {icon}
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
      </Group>
      <Text size="sm" ff={mono ? 'monospace' : undefined}>{value}</Text>
    </Stack>
  );
}
