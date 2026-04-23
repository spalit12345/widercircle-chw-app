// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Center, Group, Loader, Modal, Select, Stack, Table, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatDate, normalizeErrorString } from '@medplum/core';
import type { Bundle, Consent, Questionnaire, QuestionnaireResponse, ResourceType } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum, useResource } from '@medplum/react';
import { IconAlertCircle, IconMail, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useConsentConfig } from '../../consent/useConsentConfig';

interface ConsentRecord {
  id: string;
  category: string;
  categoryLabel: string;
  status: string;
  dateTime: string;
  questionnaireResponseId?: string;
}

export function ConsentsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { patientId: id } = useParams() as { patientId: string };
  const resourceType = 'Patient' as const;
  const resource = useResource({ reference: resourceType + '/' + id });
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const { categories: consentCategories } = useConsentConfig();

  // Build lookup maps from DB-fetched categories
  const categoryByCode = useMemo(() => {
    const map: Record<string, { label: string; required: boolean; code: string }> = {};
    for (const cat of consentCategories) {
      map[cat.code] = cat;
    }
    return map;
  }, [consentCategories]);

  // Map questionnaire names to category codes dynamically.
  // Convention: questionnaire name contains the category code as a substring.
  // E.g., "hipaa-privacy-notice" matches category code "hipaa".
  const qNameToCategoryCode: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of consentCategories) {
      map[cat.code] = cat.code;
    }
    return map;
  }, [consentCategories]);

  // Resolve a questionnaire name to a category code by finding the best match
  const resolveQNameToCategory = useCallback(
    (qName: string): string | undefined => {
      // Direct match on category code
      if (qNameToCategoryCode[qName]) {
        return qNameToCategoryCode[qName];
      }
      // Fuzzy: find a category code that is a substring of the questionnaire name
      for (const cat of consentCategories) {
        if (qName.includes(cat.code)) {
          return cat.code;
        }
      }
      return undefined;
    },
    [qNameToCategoryCode, consentCategories]
  );
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<Questionnaire | undefined>();
  const [selectValue, setSelectValue] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const qs = await medplum.searchResources('Questionnaire', 'status=active&_sort=-_lastUpdated');
      const consentQs = (qs as Questionnaire[]).filter(
        (q) => q.name && resolveQNameToCategory(q.name) !== undefined
      );
      setQuestionnaires(consentQs);

      // Fetch existing consents — sort by date desc so most recent per category wins
      const existingConsents = await medplum.searchResources('Consent', `patient=Patient/${id}&_sort=-date`);
      // Deduplicate: keep only the most recent consent per category
      const seenCategories = new Set<string>();
      const records: ConsentRecord[] = [];
      for (const c of existingConsents as Consent[]) {
        const catCode = c.category?.[0]?.coding?.[0]?.code ?? '';
        if (seenCategories.has(catCode)) {
          continue;
        }
        seenCategories.add(catCode);
        const catInfo = categoryByCode[catCode];
        records.push({
          id: c.id ?? '',
          category: catCode,
          categoryLabel: catInfo?.label ?? catCode,
          status: c.status ?? 'proposed',
          dateTime: c.dateTime ?? '',
          questionnaireResponseId: c.sourceReference?.reference?.replace('QuestionnaireResponse/', ''),
        });
      }
      setConsents(records);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLoading(false);
    }
  }, [medplum, id, resolveQNameToCategory, categoryByCode]);

  useEffect(() => {
    fetchData().catch(console.error);
  }, [fetchData]);

  const handleSelectForm = useCallback(
    (value: string | null) => {
      setSelectValue(value);
      if (value) {
        const q = questionnaires.find((quest) => quest.id === value);
        setSelectedQuestionnaire(q);
      }
    },
    [questionnaires]
  );

  const handleMarkAsReceived = useCallback(
    async (categoryCode: string, categoryLabel: string) => {
      try {
        await medplum.createResource<Consent>({
          resourceType: 'Consent',
          status: 'active',
          scope: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }],
          },
          category: [
            {
              coding: [
                { system: 'http://medplum.com/consent-category', code: categoryCode, display: categoryLabel },
              ],
            },
          ],
          patient: { reference: `Patient/${id}` },
          dateTime: new Date().toISOString(),
          policyRule: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'OPTIN' }],
          },
        });
        showNotification({ color: 'green', message: `${categoryLabel} marked as received.` });
        await fetchData();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, id, fetchData]
  );

  const handleConsentSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      try {
        const consentCatName = selectedQuestionnaire?.name ?? '';
        const catCode = resolveQNameToCategory(consentCatName) ?? consentCatName;
        const catInfo = categoryByCode[catCode];

        // Use a FHIR transaction Bundle to atomically create both resources
        const bundle: Bundle = {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              fullUrl: 'urn:uuid:qr',
              resource: {
                ...response,
                resourceType: 'QuestionnaireResponse',
                subject: { reference: `Patient/${id}` },
                status: 'completed',
              } as QuestionnaireResponse,
              request: { method: 'POST', url: 'QuestionnaireResponse' },
            },
            {
              resource: {
                resourceType: 'Consent',
                status: 'active',
                scope: {
                  coding: [
                    { system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' },
                  ],
                },
                category: [
                  {
                    coding: [
                      {
                        system: 'http://medplum.com/consent-category',
                        code: catInfo?.code ?? consentCatName,
                        display: catInfo?.label ?? consentCatName,
                      },
                    ],
                  },
                ],
                patient: { reference: `Patient/${id}` },
                dateTime: new Date().toISOString(),
                policyRule: {
                  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'OPTIN' }],
                },
                sourceReference: { reference: 'urn:uuid:qr' },
              } as Consent,
              request: { method: 'POST', url: 'Consent' },
            },
          ],
        };

        await medplum.executeBatch(bundle);

        showNotification({
          color: 'green',
          message: `${catInfo?.label ?? 'Consent'} signed and filed to patient record.`,
        });
        closeModal();
        setSelectedQuestionnaire(undefined);
        setSelectValue(null);
        await fetchData();
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, id, selectedQuestionnaire, closeModal, fetchData, resolveQNameToCategory, categoryByCode]
  );

  const signedCategories = useMemo(() => new Set(consents.map((c) => c.category)), [consents]);
  const otherConsentsCount = useMemo(
    () => consents.filter((c) => !categoryByCode[c.category]).length,
    [consents, categoryByCode]
  );

  if (!resource) {
    return null;
  }

  if (resource.resourceType !== 'Patient') {
    return (
      <Document>
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported" color="red">
          Consents are only supported for Patient resources.
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>Consent Management</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={openModal}>
            Capture Consent
          </Button>
        </Group>

        {loading ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Consent Type</Table.Th>
                <Table.Th>Required</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Date Signed</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {consentCategories.map((info) => {
                const consent = consents.find((c) => c.category === info.code);
                const signed = !!consent;
                return (
                  <Table.Tr key={info.code}>
                    <Table.Td fw={500}>{info.label}</Table.Td>
                    <Table.Td>
                      {info.required ? (
                        <Badge size="sm" color="blue">
                          Required
                        </Badge>
                      ) : (
                        <Badge size="sm" color="gray" variant="light">
                          Optional
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {signed ? (
                        <Badge color="green">Signed</Badge>
                      ) : info.required ? (
                        <Badge color="red">Missing</Badge>
                      ) : (
                        <Badge color="gray" variant="light">
                          Not Requested
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{consent?.dateTime ? formatDate(consent.dateTime) : '—'}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {!signed && (
                          <>
                            <Button
                              size="xs"
                              variant="light"
                              color="blue"
                              leftSection={<IconMail size={12} />}
                              onClick={() => {
                                const q = questionnaires.find((quest) => resolveQNameToCategory(quest.name ?? '') === info.code);
                                if (q) {
                                  const pat = resource as { telecom?: Array<{ system?: string; value?: string }> };
                                  const patientEmail = pat.telecom?.find((t) => t.system === 'email')?.value ?? '';
                                  const formUrl = `${window.location.origin}/public/consent/${q.id}/${id}`;
                                  const subject = encodeURIComponent(`Consent Form: ${info.label} — Wider Circle`);
                                  const body = encodeURIComponent(`Hello,\n\nPlease complete the following consent form for your care with Wider Circle:\n\n${info.label}\n${formUrl}\n\nThank you,\nWider Circle Care Team`);
                                  window.open(`mailto:${patientEmail}?subject=${subject}&body=${body}`, '_blank');
                                }
                              }}
                            >
                              Send to Patient
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              color="green"
                              onClick={() => handleMarkAsReceived(info.code, info.label)}
                            >
                              Mark as Received
                            </Button>
                          </>
                        )}
                        {signed && (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="orange"
                            leftSection={<IconMail size={12} />}
                            onClick={() => {
                              const q = questionnaires.find((quest) => resolveQNameToCategory(quest.name ?? '') === info.code);
                              if (q) {
                                const pat = resource as { telecom?: Array<{ system?: string; value?: string }> };
                                const patientEmail = pat.telecom?.find((t) => t.system === 'email')?.value ?? '';
                                const formUrl = `${window.location.origin}/public/consent/${q.id}/${id}`;
                                const subject = encodeURIComponent(`Consent Renewal: ${info.label} — Wider Circle`);
                                const body = encodeURIComponent(`Hello,\n\nYour consent form needs to be renewed. Please complete the following:\n\n${info.label}\n${formUrl}\n\nThank you,\nWider Circle Care Team`);
                                window.open(`mailto:${patientEmail}?subject=${subject}&body=${body}`, '_blank');
                              }
                            }}
                          >
                            Renew
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}

        {otherConsentsCount > 0 && (
          <Text size="sm" c="dimmed">
            + {otherConsentsCount} other consent(s) on file
          </Text>
        )}
      </Stack>

      <Modal opened={modalOpened} onClose={closeModal} title="Capture Consent" size="xl">
        <Stack gap="md">
          {selectedQuestionnaire === undefined && (
            <Select
              label="Select Consent Form"
              placeholder="Choose a consent form..."
              data={questionnaires.map((q) => ({
                value: q.id ?? '',
                label: q.title ?? q.name ?? 'Unknown',
                disabled: signedCategories.has(resolveQNameToCategory(q.name ?? '') ?? ''),
              }))}
              value={selectValue}
              onChange={handleSelectForm}
            />
          )}
          {selectedQuestionnaire !== undefined && (
            <>
              <Group justify="space-between">
                <Title order={4}>{selectedQuestionnaire.title}</Title>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setSelectedQuestionnaire(undefined);
                    setSelectValue(null);
                  }}
                >
                  Back to form selection
                </Button>
              </Group>
              {selectedQuestionnaire.description && (
                <Text size="sm" c="dimmed">
                  {selectedQuestionnaire.description}
                </Text>
              )}
              <QuestionnaireForm
                questionnaire={selectedQuestionnaire}
                subject={{ reference: `Patient/${id}` }}
                onSubmit={handleConsentSubmit}
                submitButtonText="Sign & Submit Consent"
              />
            </>
          )}
        </Stack>
      </Modal>
    </Document>
  );
}
