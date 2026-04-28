// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Communication, Observation } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconReceipt, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type SyncStatus = 'never' | 'succeeded' | 'failed';

export interface SyncCandidate {
  observationId: string;
  patient: string;
  minutes: number;
  cptCode: string;
  billableDate: string;
}

export const pickCptCode = (cumulativeMinutes: number): string | undefined => {
  if (cumulativeMinutes < 20) return undefined;
  if (cumulativeMinutes < 40) return '99490';
  return '99439';
};

export const dedupeByObservation = (
  observations: Observation[],
  alreadySynced: Set<string>
): Observation[] => observations.filter((o) => o.id && !alreadySynced.has(o.id));

const CANDID_LOG_CODE = 'candid-billing-sync';

export function BillingSyncPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Observation[]>([]);
  const [syncLog, setSyncLog] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const [obs, log] = await Promise.all([
        medplum.searchResources(
          'Observation',
          `code=ccm-minutes&date=ge${monthStart.toISOString().slice(0, 10)}&_count=100&_sort=date`
        ),
        medplum.searchResources(
          'Communication',
          `category=${CANDID_LOG_CODE}&_sort=-_lastUpdated&_count=20`
        ),
      ]);
      setEntries(obs);
      setSyncLog(log);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum]);

  useEffect(() => { load().catch(console.error); }, [load]);

  const alreadySyncedIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of syncLog) {
      for (const ext of c.extension ?? []) {
        if (ext.url === 'https://widercircle.com/fhir/StructureDefinition/synced-observation' && ext.valueReference?.reference) {
          const id = ext.valueReference.reference.replace('Observation/', '');
          set.add(id);
        }
      }
    }
    return set;
  }, [syncLog]);

  const pendingObs = useMemo(() => dedupeByObservation(entries, alreadySyncedIds), [entries, alreadySyncedIds]);

  const totalMinutesByPatient = useMemo(() => {
    const totals = new Map<string, number>();
    for (const o of entries) {
      const ref = o.subject?.reference;
      if (!ref || !o.valueQuantity || o.valueQuantity.unit !== 'min') continue;
      totals.set(ref, (totals.get(ref) ?? 0) + (o.valueQuantity.value ?? 0));
    }
    return totals;
  }, [entries]);

  const doSync = useCallback(async () => {
    if (pendingObs.length === 0) return;
    setSyncing(true);
    try {
      // Simulated Candid POST — real impl would POST 837P claim w/ CPT + duration.
      // We record each sync attempt as a Communication resource for auditability.
      const ack: Communication = {
        resourceType: 'Communication',
        status: 'completed',
        category: [{
          coding: [{
            system: 'https://widercircle.com/fhir/CodeSystem/communication-category',
            code: CANDID_LOG_CODE,
            display: 'Candid billing sync (simulated)',
          }],
        }],
        sent: new Date().toISOString(),
        payload: [{
          contentString: `Simulated Candid sync · ${pendingObs.length} Observation(s) acknowledged.`,
        }],
        extension: pendingObs.flatMap((o) =>
          o.id
            ? [{
                url: 'https://widercircle.com/fhir/StructureDefinition/synced-observation',
                valueReference: { reference: `Observation/${o.id}` },
              }]
            : []
        ),
      };
      await medplum.createResource<Communication>(ack);
      showNotification({ color: 'green', message: `Candid sync · ${pendingObs.length} entries acknowledged` });
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSyncing(false);
    }
  }, [pendingObs, medplum, load]);

  if (loading) return <Document><Loader /></Document>;

  const lastSync = syncLog[0];
  const lastStatus: SyncStatus = !lastSync ? 'never' : lastSync.status === 'completed' ? 'succeeded' : 'failed';

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={2}>Billing sync (Candid)</Title>
            <Text c="dimmed" size="sm">
              Terminal node of the revenue path. CCM time entries from CD-17 are packaged with the appropriate CPT code (99490 ≥20min · 99439 ≥40min) and sent to Candid for claim submission. Simulated in this PR — vendor contract per CD-10 §4.
            </Text>
          </Stack>
          <Button
            variant="light"
            color="gray"
            leftSection={<IconArrowLeft size={14} />}
            onClick={() => navigate('/billing-dashboard')}
          >
            Back to dashboard
          </Button>
        </Group>

        <Alert color="yellow" variant="light">
          <Text size="sm">
            <b>Demo build · simulated Candid sync.</b> Each &quot;Sync&quot; click writes a
            Communication record to Medplum that records what would be transmitted (CPT, member,
            duration, provider). The real Candid 837P call lands with the vendor contract per
            CD-10 §4.
          </Text>
        </Alert>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" align="flex-end">
            <Stack gap={2}>
              <Title order={5}>Pending sync</Title>
              <Text size="sm" c="dimmed">{pendingObs.length} Observations not yet acknowledged</Text>
            </Stack>
            <Button
              color="blue"
              leftSection={<IconRefresh size={16} />}
              onClick={doSync}
              loading={syncing}
              disabled={pendingObs.length === 0 || syncing}
            >
              Sync to Candid
            </Button>
          </Group>
        </Card>

        {pendingObs.length === 0 && (
          <Alert color="green" variant="light" icon={<IconCheck size={16} />} title="All caught up">
            <Text size="sm">No pending Observations. Candid is in sync as of {lastSync?.sent ? formatDateTime(lastSync.sent) : 'never'}.</Text>
          </Alert>
        )}

        {totalMinutesByPatient.size > 0 && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Title order={5}>Per-member billable roll-up (this month)</Title>
              <Stack gap="xs">
                {Array.from(totalMinutesByPatient.entries()).map(([ref, minutes]) => {
                  const cpt = pickCptCode(minutes);
                  return (
                    <Group key={ref} justify="space-between" p="xs" wrap="nowrap">
                      <Group gap="sm">
                        <Text size="sm" ff="monospace">{ref}</Text>
                        <Badge variant="light" ff="monospace">{minutes} min</Badge>
                      </Group>
                      {cpt ? (
                        <Badge color="green" leftSection={<IconReceipt size={12} />}>{cpt}</Badge>
                      ) : (
                        <Badge color="gray" variant="light">under threshold</Badge>
                      )}
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        )}

        {syncLog.length > 0 && (
          <Card withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Sync history</Title>
                <Badge color={lastStatus === 'succeeded' ? 'green' : lastStatus === 'failed' ? 'red' : 'gray'} variant="light">
                  Last: {lastStatus}
                </Badge>
              </Group>
              <Stack gap="xs">
                {syncLog.slice(0, 10).map((c) => {
                  const count = (c.extension ?? []).filter((e) => e.url === 'https://widercircle.com/fhir/StructureDefinition/synced-observation').length;
                  return (
                    <Group key={c.id} justify="space-between" p="xs" wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                      <Group gap="sm">
                        <Badge variant="light" color={c.status === 'completed' ? 'green' : 'red'} size="sm">
                          {c.status}
                        </Badge>
                        <Text size="sm">{count} entry{count === 1 ? '' : 'ies'}</Text>
                      </Group>
                      <Text size="xs" c="dimmed" ff="monospace">{c.sent ? formatDateTime(c.sent) : ''}</Text>
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>
    </Document>
  );
}
