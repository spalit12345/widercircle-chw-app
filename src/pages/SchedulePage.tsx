// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Badge,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDate, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

export function SchedulePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const profile = medplum.getProfile();

  const fetchAppointments = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Appointment', `practitioner=Practitioner/${profile?.id}&_sort=date&_count=100`);
      setAppointments(results);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, profile?.id]);

  useEffect(() => {
    fetchAppointments().catch(console.error);
  }, [fetchAppointments]);

  const today = new Date().toISOString().split('T')[0];
  const typeLabels: Record<string, string> = { phone: 'Phone Call', 'home-visit': 'Home Visit', telehealth: 'Telehealth', 'in-person': 'In Person' };

  // Group by date
  const grouped: Record<string, Appointment[]> = {};
  for (const appt of appointments.filter((a) => a.status !== 'cancelled')) {
    const dateKey = appt.start?.split('T')[0] ?? 'unknown';
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(appt);
  }
  const sortedDates = Object.keys(grouped).sort();

  return (
    <Document>
      <Stack gap="md">
        <Title order={3}>My Schedule</Title>

        {loading ? (
          <Center py="xl"><Loader size="lg" /></Center>
        ) : sortedDates.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No appointments scheduled. Book appointments from patient pages.</Text>
        ) : (
          sortedDates.map((dateKey) => {
            const isToday = dateKey === today;
            return (
              <Stack key={dateKey} gap="xs">
                <Group gap="xs">
                  <Title order={4}>{formatDate(dateKey)}</Title>
                  {isToday && <Badge color="blue">Today</Badge>}
                </Group>
                <Table striped highlightOnHover style={isToday ? { border: '2px solid var(--mantine-color-blue-4)', borderRadius: 'var(--mantine-radius-sm)' } : undefined}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Time</Table.Th>
                      <Table.Th>Patient</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Notes</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {grouped[dateKey].map((appt) => {
                      const patient = appt.participant?.find((p) => p.actor?.reference?.startsWith('Patient'));
                      const type = appt.appointmentType?.coding?.[0]?.code ?? '—';
                      const patientId = patient?.actor?.reference?.replace('Patient/', '');
                      return (
                        <Table.Tr key={appt.id}>
                          <Table.Td>{appt.start ? formatDateTime(appt.start).split(',').pop()?.trim() ?? formatDateTime(appt.start) : '—'}</Table.Td>
                          <Table.Td>
                            <Text
                              size="sm"
                              c="blue"
                              style={{ cursor: 'pointer' }}
                              onClick={() => patientId && navigate(`/Patient/${patientId}`)}
                            >
                              {patient?.actor?.display ?? '—'}
                            </Text>
                          </Table.Td>
                          <Table.Td>{typeLabels[type] ?? type}</Table.Td>
                          <Table.Td>
                            <Badge color={appt.status === 'booked' ? 'blue' : appt.status === 'fulfilled' ? 'green' : 'gray'} size="sm">
                              {appt.status}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{appt.comment ?? ''}</Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Stack>
            );
          })
        )}
      </Stack>
    </Document>
  );
}
