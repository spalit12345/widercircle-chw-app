// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { SignInForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  return (
    <SignInForm
      onSuccess={() => navigate('/')?.catch(console.error)}
      projectId={searchParams.get('project') || undefined}
      login={searchParams.get('login') || undefined}
    >
      <img
        src="/wc-v2/wc-favicon.svg"
        alt="Wider Circle"
        style={{ width: 56, height: 56, display: 'block', marginInline: 'auto' }}
      />
      <Title order={3} py="lg" ta="center">
        Sign in to Care &amp; Case Management System
      </Title>
    </SignInForm>
  );
}
