// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Bundle, Consent, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';

function PublicConsentFormInner(): JSX.Element {
  const medplum = useMedplum();
  const { questionnaireId, patientId } = useParams() as { questionnaireId: string; patientId: string };
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>();
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    medplum
      .readResource('Questionnaire', questionnaireId)
      .then((q) => {
        setQuestionnaire(q);
        setLoading(false);
      })
      .catch((err) => {
        setError(normalizeErrorString(err));
        setLoading(false);
      });
  }, [medplum, questionnaireId]);

  const handleSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      try {
        // Determine consent category from questionnaire name
        const qName = questionnaire?.name ?? '';
        let categoryCode = qName;
        let categoryDisplay = questionnaire?.title ?? qName;
        if (qName.includes('hipaa')) {
          categoryCode = 'hipaa';
          categoryDisplay = 'HIPAA Privacy Notice';
        } else if (qName.includes('telehealth')) {
          categoryCode = 'telehealth';
          categoryDisplay = 'Telehealth Consent';
        } else if (qName.includes('release')) {
          categoryCode = 'release-of-info';
          categoryDisplay = 'Release of Information';
        }

        // Create QR + Consent atomically via transaction bundle
        const bundle: Bundle = {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              fullUrl: 'urn:uuid:qr',
              resource: {
                ...response,
                resourceType: 'QuestionnaireResponse',
                subject: { reference: `Patient/${patientId}` },
                status: 'completed',
              } as QuestionnaireResponse,
              request: { method: 'POST', url: 'QuestionnaireResponse' },
            },
            {
              resource: {
                resourceType: 'Consent',
                status: 'active',
                scope: {
                  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }],
                },
                category: [
                  {
                    coding: [
                      { system: 'http://medplum.com/consent-category', code: categoryCode, display: categoryDisplay },
                    ],
                  },
                ],
                patient: { reference: `Patient/${patientId}` },
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
        setSubmitted(true);
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      }
    },
    [medplum, patientId, questionnaire]
  );

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return (
      <Center py="xl">
        <Alert color="red" title="Error">
          {error}
        </Alert>
      </Center>
    );
  }

  if (submitted) {
    return (
      <Center py={100}>
        <Stack align="center" gap="md">
          <IconCheck size={64} color="green" />
          <Title order={2}>Thank You!</Title>
          <Text size="lg" c="dimmed" ta="center" maw={400}>
            Your consent form has been submitted and filed to your patient record. You may close this page.
          </Text>
        </Stack>
      </Center>
    );
  }

  if (!questionnaire) {
    return (
      <Center py="xl">
        <Text>Form not found.</Text>
      </Center>
    );
  }

  return (
    <Stack gap="md" p="xl" maw={800} mx="auto">
      <Title order={2}>{questionnaire.title ?? 'Consent Form'}</Title>
      {questionnaire.description && (
        <Text c="dimmed">{questionnaire.description}</Text>
      )}
      <QuestionnaireForm
        questionnaire={questionnaire}
        subject={{ reference: `Patient/${patientId}` }}
        onSubmit={handleSubmit}
        submitButtonText="Sign & Submit"
      />
    </Stack>
  );
}

/**
 * Public consent form page — accessible without full app authentication.
 * Uses the existing MedplumClient from the app context.
 * In production, this would use a separate public API endpoint or token.
 */
export function PublicConsentPage(): JSX.Element {
  return <PublicConsentFormInner />;
}
