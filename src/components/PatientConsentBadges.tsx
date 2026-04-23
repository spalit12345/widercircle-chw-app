// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Text, Tooltip } from '@mantine/core';
import type { Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useConsentConfig } from '../consent/useConsentConfig';

interface PatientConsentBadgesProps {
  readonly patient: Patient;
}

export function PatientConsentBadges({ patient }: PatientConsentBadgesProps): JSX.Element | null {
  const medplum = useMedplum();
  const { categories: consentCategories } = useConsentConfig();
  const [signedCodes, setSignedCodes] = useState<Set<string>>(new Set());
  const [programs, setPrograms] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const requiredConsents = consentCategories.filter((c) => c.required);
  const optionalConsents = consentCategories.filter((c) => !c.required);

  useEffect(() => {
    if (!patient.id) {
      return;
    }
    Promise.all([
      medplum.searchResources('Consent', `patient=Patient/${patient.id}&status=active`),
      medplum.searchResources('Encounter', `subject=Patient/${patient.id}&_count=50`),
    ])
      .then(([consents, encounters]) => {
        const codes = new Set<string>();
        for (const c of consents) {
          const code = c.category?.[0]?.coding?.[0]?.code;
          if (code) {
            codes.add(code);
          }
        }
        setSignedCodes(codes);

        // Derive enrolled programs from encounters
        const progSet = new Set<string>();
        for (const enc of encounters as Encounter[]) {
          const prog = enc.serviceType?.coding?.[0]?.code;
          if (prog) {
            progSet.add(prog);
          }
        }
        setPrograms([...progSet]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [medplum, patient.id]);

  if (!loaded) {
    return null;
  }

  const allRequiredSigned = requiredConsents.every((c) => signedCodes.has(c.code));

  return (
    <Group gap="xs" px="md" py={4} role="status" aria-label="Patient status">
      {programs.length > 0 && (
        <>
          {programs.map((p) => (
            <Badge key={p} size="xs" color="blue" variant="filled">
              {p}
            </Badge>
          ))}
          <Text size="xs" c="dimmed">|</Text>
        </>
      )}
      <Text size="xs" c="dimmed" fw={500}>
        Consents:
      </Text>
      {requiredConsents.map((c) => (
        <Tooltip key={c.code} label={signedCodes.has(c.code) ? `${c.label} signed` : `${c.label} missing`}>
          <Badge size="xs" color={signedCodes.has(c.code) ? 'green' : 'red'} variant="filled">
            {c.label} {signedCodes.has(c.code) ? '✓' : '✗'}
          </Badge>
        </Tooltip>
      ))}
      {optionalConsents.map((c) =>
        signedCodes.has(c.code) ? (
          <Tooltip key={c.code} label={`${c.label} signed`}>
            <Badge size="xs" color="green" variant="filled">
              {c.label} ✓
            </Badge>
          </Tooltip>
        ) : null
      )}
      {!allRequiredSigned && (
        <Badge size="xs" color="orange" variant="light">
          Action needed
        </Badge>
      )}
    </Group>
  );
}
