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
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse, ResourceType } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum, useResource } from '@medplum/react';
import { IconAlertCircle, IconClipboardCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';

export function AssessmentsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { patientId: id } = useParams() as { patientId: string };
  const resourceType = 'Patient' as const;
  const resource = useResource({ reference: resourceType + '/' + id });

  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQ, setSelectedQ] = useState<Questionnaire | null>(null);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);

  const fetchData = useCallback(async () => {
    try {
      const [qResults, qrResults] = await Promise.all([
        medplum.searchResources('Questionnaire', 'status=active&name=prapare'),
        medplum.searchResources('QuestionnaireResponse', `subject=Patient/${id}&_sort=-authored&_count=50`),
      ]);
      setQuestionnaires(qResults);
      setResponses(qrResults);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, id]);

  useEffect(() => {
    fetchData().catch(console.error);
  }, [fetchData]);

  const handleSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      try {
        await medplum.createResource({
          ...response,
          subject: { reference: `Patient/${id}` },
          authored: new Date().toISOString(),
          status: 'completed',
        });
        showNotification({ color: 'green', message: 'Assessment completed and saved.' });
        closeForm();
        setSelectedQ(null);
        await fetchData();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, id, closeForm, fetchData]
  );

  if (!resource) {
    return null;
  }

  if (resource.resourceType !== 'Patient') {
    return (
      <Document>
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported" color="red">
          Assessments are only supported for Patient resources.
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>Assessments</Title>
          <Button
            leftSection={<IconClipboardCheck size={16} />}
            onClick={() => {
              if (questionnaires.length > 0) {
                setSelectedQ(questionnaires[0]);
                openForm();
              } else {
                showNotification({ color: 'yellow', message: 'No assessment questionnaires available. Run the seed script first.' });
              }
            }}
          >
            Start Assessment
          </Button>
        </Group>

        {loading ? (
          <Center py="xl"><Loader size="lg" /></Center>
        ) : responses.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No assessments completed yet. Click &quot;Start Assessment&quot; to administer an SDoH screening.
          </Text>
        ) : (
          <>
            <Title order={4}>Past Results</Title>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Assessment</Table.Th>
                  <Table.Th>Responses</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {responses.map((qr) => {
                  const qName = qr.questionnaire ? 'PRAPARE SDoH Screening' : 'Assessment';
                  const answerCount = qr.item?.filter((i) => i.answer && i.answer.length > 0).length ?? 0;
                  return (
                    <Table.Tr key={qr.id}>
                      <Table.Td>{qr.authored ? formatDateTime(qr.authored) : '—'}</Table.Td>
                      <Table.Td>{qName}</Table.Td>
                      <Table.Td>{answerCount} questions answered</Table.Td>
                      <Table.Td>
                        <Badge color={qr.status === 'completed' ? 'green' : 'yellow'} size="sm">
                          {qr.status}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </>
        )}
      </Stack>

      {/* Assessment Form Modal */}
      <Modal opened={formOpened} onClose={closeForm} title={selectedQ?.title ?? 'Assessment'} size="lg">
        {selectedQ && (
          <QuestionnaireForm
            questionnaire={selectedQ}
            subject={{ reference: `Patient/${id}` }}
            onSubmit={handleSubmit}
            submitButtonText="Complete Assessment"
          />
        )}
      </Modal>
    </Document>
  );
}
