// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Card, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCheck, IconHeartHandshake } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

/**
 * Patient-facing SDoH assessment form — accessible via the link the CHW shares
 * from AssessmentsPage. Closes the §3.1 CD-19 top-doc gap that says
 * "Assessment form sent to patient via portal or SMS link".
 *
 * In production this surface would carry a short-lived token in the URL and be
 * served by a separate public endpoint. For the demo we mirror PublicConsentPage:
 * the route sits outside the authenticated WcShell, but the underlying
 * MedplumClient still uses whatever session is in the browser. Reviewers
 * opening the link in the same browser they're signed in as the demo CHW will
 * see the form work as the patient would.
 */
export function PublicSdohPage(): JSX.Element {
  const medplum = useMedplum();
  const { patientId } = useParams() as { patientId: string };

  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>();
  const [patient, setPatient] = useState<Patient | undefined>();
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    Promise.all([
      medplum.searchResources('Questionnaire', 'status=active&name=prapare'),
      medplum.readResource('Patient', patientId).catch(() => undefined),
    ])
      .then(([qResults, p]) => {
        setQuestionnaire(qResults[0]);
        setPatient(p);
        if (!qResults[0]) {
          setError('Sorry — this assessment is not currently available. Please contact your care team.');
        }
      })
      .catch((err) => setError(normalizeErrorString(err)))
      .finally(() => setLoading(false));
  }, [medplum, patientId]);

  const handleSubmit = async (response: QuestionnaireResponse): Promise<void> => {
    try {
      await medplum.createResource<QuestionnaireResponse>({
        ...response,
        resourceType: 'QuestionnaireResponse',
        subject: { reference: `Patient/${patientId}` },
        authored: new Date().toISOString(),
        status: 'completed',
      });
      setSubmitted(true);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  };

  if (loading) {
    return (
      <Center py={100}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return (
      <Center py={100}>
        <Alert color="red" title="Couldn't load the assessment" maw={500}>
          {error}
        </Alert>
      </Center>
    );
  }

  if (submitted) {
    return (
      <Center py={100}>
        <Stack align="center" gap="md" maw={500}>
          <IconCheck size={64} color="green" />
          <Title order={2}>Thank you!</Title>
          <Text size="lg" c="dimmed" ta="center">
            Your responses have been sent to your care team. They'll follow up with you on anything you flagged.
            You can close this page.
          </Text>
        </Stack>
      </Center>
    );
  }

  if (!questionnaire) {
    return (
      <Center py={100}>
        <Text>Form not found.</Text>
      </Center>
    );
  }

  const patientGreeting = patient?.name?.[0]?.given?.[0]
    ? `Hi ${patient.name[0].given[0]},`
    : 'Hi there,';

  return (
    <Stack gap="md" p="xl" maw={760} mx="auto">
      <Card withBorder radius="md" padding="md">
        <Stack gap="xs">
          <IconHeartHandshake size={28} color="var(--mantine-color-grape-7)" />
          <Title order={2}>{patientGreeting}</Title>
          <Text size="sm" c="dimmed">
            Your care team at Wider Circle asked you to take a short check-in about things going on in your life
            that affect your health — like food, housing, transportation, and how you're feeling. There are no
            wrong answers. It takes about 3 minutes. We use your answers to figure out how we can help.
          </Text>
        </Stack>
      </Card>
      <QuestionnaireForm
        questionnaire={questionnaire}
        subject={{ reference: `Patient/${patientId}` }}
        onSubmit={handleSubmit}
        submitButtonText="Submit"
      />
    </Stack>
  );
}
