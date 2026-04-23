// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Appointment, ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum, useResource } from '@medplum/react';
import { IconAlertCircle, IconCalendarPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';

export function AppointmentsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { patientId: id } = useParams() as { patientId: string };
  const resourceType = 'Patient' as const;
  const resource = useResource({ reference: resourceType + '/' + id });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('10:00');
  const [formType, setFormType] = useState('phone');
  const [formNotes, setFormNotes] = useState('');

  const profile = medplum.getProfile();

  const fetchAppointments = useCallback(async () => {
    try {
      const results = await medplum.searchResources('Appointment', `patient=Patient/${id}&_sort=-date&_count=50`);
      setAppointments(results);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, id]);

  useEffect(() => {
    fetchAppointments().catch(console.error);
  }, [fetchAppointments]);

  const handleCreate = useCallback(async () => {
    if (!formDate) {
      return;
    }
    try {
      const startDateTime = `${formDate}T${formTime}:00.000Z`;
      const endDateTime = new Date(new Date(startDateTime).getTime() + 30 * 60000).toISOString();
      const patientName = resource?.resourceType === 'Patient'
        ? `${resource.name?.[0]?.given?.[0] ?? ''} ${resource.name?.[0]?.family ?? ''}`.trim()
        : '';
      const practitionerName = `${profile?.name?.[0]?.given?.[0] ?? ''} ${profile?.name?.[0]?.family ?? ''}`.trim();

      await medplum.createResource({
        resourceType: 'Appointment',
        status: 'booked',
        appointmentType: { coding: [{ system: 'http://medplum.com/appointment-type', code: formType, display: { phone: 'Phone Call', 'home-visit': 'Home Visit', telehealth: 'Telehealth', 'in-person': 'In Person' }[formType] ?? formType }] },
        start: startDateTime,
        end: endDateTime,
        participant: [
          { actor: { reference: `Patient/${id}`, display: patientName }, status: 'accepted' },
          { actor: { reference: `Practitioner/${profile?.id}`, display: practitionerName }, status: 'accepted' },
        ],
        comment: formNotes || undefined,
      });
      showNotification({ color: 'green', message: 'Appointment scheduled' });
      closeModal();
      setFormDate('');
      setFormTime('10:00');
      setFormNotes('');
      await fetchAppointments();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum, id, resource, profile, formDate, formTime, formType, formNotes, closeModal, fetchAppointments]);

  if (!resource) {
    return null;
  }

  if (resource.resourceType !== 'Patient') {
    return (
      <Document>
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported" color="red">
          Appointments are only supported for Patient resources.
        </Alert>
      </Document>
    );
  }

  const now = new Date().toISOString();
  const upcoming = appointments.filter((a) => (a.start ?? '') >= now && a.status !== 'cancelled');
  const past = appointments.filter((a) => (a.start ?? '') < now || a.status === 'cancelled');

  const typeLabels: Record<string, string> = { phone: 'Phone Call', 'home-visit': 'Home Visit', telehealth: 'Telehealth', 'in-person': 'In Person' };

  function renderRow(appt: Appointment): JSX.Element {
    const type = appt.appointmentType?.coding?.[0]?.code ?? '—';
    const chw = appt.participant?.find((p) => p.actor?.reference?.startsWith('Practitioner'))?.actor?.display ?? '—';
    return (
      <Table.Tr key={appt.id}>
        <Table.Td>{appt.start ? formatDateTime(appt.start) : '—'}</Table.Td>
        <Table.Td>{typeLabels[type] ?? type}</Table.Td>
        <Table.Td>{chw}</Table.Td>
        <Table.Td>
          <Badge color={appt.status === 'booked' ? 'blue' : appt.status === 'fulfilled' ? 'green' : 'gray'} size="sm">
            {appt.status}
          </Badge>
        </Table.Td>
        <Table.Td>{appt.comment ?? ''}</Table.Td>
      </Table.Tr>
    );
  }

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>Appointments</Title>
          <Button leftSection={<IconCalendarPlus size={16} />} onClick={openModal}>
            Schedule Appointment
          </Button>
        </Group>

        <Title order={4}>Upcoming</Title>
        {loading ? (
          <Center py="xl"><Loader size="lg" /></Center>
        ) : upcoming.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">No upcoming appointments.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date / Time</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>CHW</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{upcoming.map(renderRow)}</Table.Tbody>
          </Table>
        )}

        {past.length > 0 && (
          <>
            <Title order={4}>Past</Title>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date / Time</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>CHW</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Notes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{past.map(renderRow)}</Table.Tbody>
            </Table>
          </>
        )}
      </Stack>

      <Modal opened={modalOpened} onClose={closeModal} title="Schedule Appointment" size="md">
        <Stack gap="md">
          <TextInput label="Date" type="date" value={formDate} onChange={(e) => setFormDate(e.currentTarget.value)} required />
          <TextInput label="Time" type="time" value={formTime} onChange={(e) => setFormTime(e.currentTarget.value)} required />
          <Select
            label="Appointment Type"
            data={[
              { value: 'phone', label: 'Phone Call' },
              { value: 'home-visit', label: 'Home Visit' },
              { value: 'telehealth', label: 'Telehealth' },
              { value: 'in-person', label: 'In Person' },
            ]}
            value={formType}
            onChange={(v) => setFormType(v ?? 'phone')}
          />
          <Textarea label="Notes (optional)" value={formNotes} onChange={(e) => setFormNotes(e.currentTarget.value)} placeholder="Any notes about this appointment..." minRows={2} />
          <Button onClick={handleCreate} disabled={!formDate} fullWidth>
            Book Appointment
          </Button>
        </Stack>
      </Modal>
    </Document>
  );
}
