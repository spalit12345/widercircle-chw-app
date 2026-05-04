// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Standalone Automations workspace — same workflow canvas that lives on the
// member-detail Automations tab, but reachable from the global sidebar with
// a Member dropdown to switch which patient's plan is loaded.

import { Card, Center, Loader, Select, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { CarePlan, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { PlanOfCareAutomations } from '../components/PlanOfCareAutomations';

export function AutomationsPage(): JSX.Element {
  const medplum = useMedplum();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPatient = searchParams.get('patient') ?? '';

  const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [plan, setPlan] = useState<CarePlan | undefined>();
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);

  const loadPatients = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Patient', '_count=100&_sort=family');
      setPatients(
        (results as Patient[]).map((p) => ({
          value: p.id ?? '',
          label:
            `${p.name?.[0]?.given?.[0] ?? ''} ${p.name?.[0]?.family ?? ''}`.trim() || 'Unnamed patient',
        }))
      );
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoadingPatients(false);
    }
  }, [medplum]);

  const loadPlan = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setPlan(undefined);
        return;
      }
      setLoadingPlan(true);
      try {
        const plans = await medplum.searchResources(
          'CarePlan',
          `subject=Patient/${patientId}&_sort=-_lastUpdated&_count=1`
        );
        setPlan((plans as CarePlan[])[0]);
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        setPlan(undefined);
      } finally {
        setLoadingPlan(false);
      }
    },
    [medplum]
  );

  useEffect(() => {
    loadPatients().catch(console.error);
  }, [loadPatients]);

  useEffect(() => {
    loadPlan(selectedPatient).catch(console.error);
  }, [selectedPatient, loadPlan]);

  const onSelect = (v: string | null): void => {
    const next = v ?? '';
    setSelectedPatient(next);
    if (next) {
      setSearchParams({ patient: next });
    } else {
      setSearchParams({});
    }
  };

  return (
    <Document>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Automations</Title>
          <Text c="dimmed" size="sm">
            Visualise the workflow generated from a member's Plan of Care, linked Tasks, and recent
            assessments.
          </Text>
        </Stack>

        <Card withBorder radius="md" padding="md">
          <Select
            label="Member"
            placeholder={loadingPatients ? 'Loading members…' : 'Pick a member to load their workflow'}
            data={patients}
            value={selectedPatient || null}
            onChange={onSelect}
            disabled={loadingPatients}
            searchable
            clearable
            nothingFoundMessage="No matching member"
          />
        </Card>

        {!selectedPatient ? (
          <Text c="dimmed" ta="center" py="xl">
            Pick a member above to load their automation workflow.
          </Text>
        ) : loadingPlan ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : (
          <PlanOfCareAutomations plan={plan} patientId={selectedPatient} />
        )}
      </Stack>
    </Document>
  );
}
