// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Center,
  CopyButton,
  Divider,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum, useResource } from '@medplum/react';
import { IconAlertCircle, IconAlertTriangle, IconCheck, IconClipboardCheck, IconCopy, IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';

const TRIGGERED_CASE_EXT_URL = 'https://widercircle.com/fhir/StructureDefinition/sdoh-triggered-case';

const formatAnswer = (a: QuestionnaireResponseItemAnswer): string => {
  if (a.valueString !== undefined) return a.valueString;
  if (a.valueBoolean !== undefined) return a.valueBoolean ? 'Yes' : 'No';
  if (a.valueInteger !== undefined) return String(a.valueInteger);
  if (a.valueDecimal !== undefined) return String(a.valueDecimal);
  if (a.valueDate !== undefined) return a.valueDate;
  if (a.valueDateTime !== undefined) return formatDateTime(a.valueDateTime);
  if (a.valueCoding?.display) return a.valueCoding.display;
  if (a.valueCoding?.code) return a.valueCoding.code;
  return '—';
};

const flattenItems = (items: QuestionnaireResponseItem[] | undefined): QuestionnaireResponseItem[] => {
  const out: QuestionnaireResponseItem[] = [];
  for (const item of items ?? []) {
    if (item.answer && item.answer.length > 0) {
      out.push(item);
    }
    if (item.item && item.item.length > 0) {
      out.push(...flattenItems(item.item));
    }
  }
  return out;
};

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
  const [viewedResponse, setViewedResponse] = useState<QuestionnaireResponse | null>(null);
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [shareOpened, { open: openShare, close: closeShare }] = useDisclosure(false);

  const publicLink = `${window.location.origin}/public/sdoh/${id}`;
  const smsBody = `Hi, this is your Wider Circle care team. Please take a quick health check-in here: ${publicLink}`;

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
          <Group gap="sm">
            <Button
              variant="light"
              leftSection={<IconSend size={16} />}
              onClick={() => {
                if (questionnaires.length === 0) {
                  showNotification({
                    color: 'yellow',
                    message: 'No assessment available to send. Run the seed script first.',
                  });
                  return;
                }
                openShare();
              }}
            >
              Send to patient
            </Button>
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
                  const answeredItems = flattenItems(qr.item);
                  const triggeredCount =
                    qr.extension?.filter((e) => e.url === TRIGGERED_CASE_EXT_URL).length ?? 0;
                  return (
                    <Table.Tr
                      key={qr.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setViewedResponse(qr);
                        openDetail();
                      }}
                    >
                      <Table.Td>{qr.authored ? formatDateTime(qr.authored) : '—'}</Table.Td>
                      <Table.Td>{qName}</Table.Td>
                      <Table.Td>{answeredItems.length} questions answered</Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Badge color={qr.status === 'completed' ? 'green' : 'yellow'} size="sm">
                            {qr.status}
                          </Badge>
                          {triggeredCount > 0 && (
                            <Badge
                              color="yellow"
                              size="sm"
                              variant="light"
                              leftSection={<IconAlertTriangle size={10} />}
                            >
                              {triggeredCount} case{triggeredCount === 1 ? '' : 's'}
                            </Badge>
                          )}
                        </Group>
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

      {/* Send-to-patient modal — generates the public /public/sdoh/:patientId link */}
      <Modal opened={shareOpened} onClose={closeShare} title="Send assessment to patient" size="md">
        <Stack gap="md">
          <Alert color="blue" variant="light" icon={<IconSend size={16} />}>
            <Text size="sm">
              Generate a link the patient can fill out from their phone. Closes the §3.1 spec gap that says
              the assessment should be sent via portal or SMS link instead of administered by the CHW.
            </Text>
          </Alert>

          <Stack gap={4}>
            <Text size="xs" fw={600} c="dimmed">
              Public link
            </Text>
            <Group gap="xs" wrap="nowrap">
              <TextInput value={publicLink} readOnly style={{ flex: 1 }} ff="monospace" />
              <CopyButton value={publicLink} timeout={1500}>
                {({ copied, copy }) => (
                  <Button
                    variant="light"
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={600} c="dimmed">
              SMS body (paste into your messaging tool)
            </Text>
            <Group gap="xs" wrap="nowrap">
              <TextInput value={smsBody} readOnly style={{ flex: 1 }} />
              <CopyButton value={smsBody} timeout={1500}>
                {({ copied, copy }) => (
                  <Button
                    color="grape"
                    leftSection={copied ? <IconCheck size={14} /> : <IconSend size={14} />}
                    onClick={() => {
                      copy();
                      showNotification({
                        color: 'grape',
                        message: 'SMS body copied. Twilio integration lands with CM-12; for the demo paste this into your messaging tool.',
                      });
                    }}
                  >
                    {copied ? 'Copied' : 'Send via SMS'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>

          <Text size="xs" c="dimmed">
            When the patient submits, their response will appear in <b>Past Results</b> below — refresh after
            they finish.
          </Text>
        </Stack>
      </Modal>

      {/* Assessment Detail Modal — view a completed response */}
      <Modal
        opened={detailOpened}
        onClose={() => {
          closeDetail();
          setViewedResponse(null);
        }}
        title={
          viewedResponse?.authored
            ? `Assessment · ${formatDateTime(viewedResponse.authored)}`
            : 'Assessment detail'
        }
        size="lg"
      >
        {viewedResponse && (
          <Stack gap="md">
            {(() => {
              const triggered =
                viewedResponse.extension
                  ?.filter((e) => e.url === TRIGGERED_CASE_EXT_URL)
                  .map((e) => e.valueString)
                  .filter((s): s is string => Boolean(s)) ?? [];
              if (triggered.length === 0) {
                return (
                  <Alert color="green" variant="light">
                    No risk thresholds crossed. No follow-up cases were created.
                  </Alert>
                );
              }
              return (
                <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                  <Text size="sm" fw={600}>
                    {triggered.length} follow-up case{triggered.length === 1 ? '' : 's'} triggered:
                  </Text>
                  <Stack gap={2} mt="xs">
                    {triggered.map((c) => (
                      <Text key={c} size="xs" ff="monospace">
                        • {c}
                      </Text>
                    ))}
                  </Stack>
                </Alert>
              );
            })()}

            <Divider label="Answers" labelPosition="left" />

            {flattenItems(viewedResponse.item).length === 0 ? (
              <Text c="dimmed" size="sm">
                No answers were recorded on this response.
              </Text>
            ) : (
              <Stack gap="sm">
                {flattenItems(viewedResponse.item).map((item, idx) => (
                  <Stack key={`${item.linkId}-${idx}`} gap={2}>
                    <Text size="sm" fw={600}>
                      {item.text ?? item.linkId ?? `Question ${idx + 1}`}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {(item.answer ?? []).map(formatAnswer).join(', ') || '—'}
                    </Text>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Modal>
    </Document>
  );
}
