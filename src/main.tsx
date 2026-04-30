// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { App } from './App';
import { RoleProvider } from './auth/RoleContext';
import { TimerProvider } from './billing/TimerContext';
// WC design tokens — v1 (Patient 360) loaded first so legacy --wc-brand-*
// references continue to resolve, then v2 (CMS Platform) overrides the
// shared --wc-base-* / --wc-primary-* / --wc-error-* values to the new
// navy + orange system per Design v2/README.md.
import '../Design/assets/wc-tokens.css';
import './styles/wc-v2-tokens.css';

const medplum = new MedplumClient({
  onUnauthenticated: () => (window.location.href = '/'),
  baseUrl: sessionStorage.getItem('medplum_base_url') || import.meta.env.VITE_MEDPLUM_BASE_URL || undefined,
  cacheTime: 60000,
  autoBatchTime: 100,
});

const theme = createTheme({
  // Map Mantine's "brand" color array to the WC orange ramp (gold → orange → vermilion).
  // primaryShade=6 puts --wc-brand-500 (#F27321 the canonical WC orange) at the default
  // shade so `<Button color="brand">` and `<Badge color="brand">` paint the brand color.
  primaryColor: 'brand',
  primaryShade: 6,
  colors: {
    brand: [
      '#FFF5E8', // 0  --wc-tint-100
      '#FFEFD9', // 1  --wc-tint-200
      '#FCB820', // 2  --wc-brand-50  (gold)
      '#FCB713', // 3  --wc-brand-200 (gold highlight)
      '#F89C1E', // 4  --wc-brand-300
      '#F58B1F', // 5  --wc-brand-400
      '#F27321', // 6  --wc-brand-500 PRIMARY (Mantine default shade)
      '#F05723', // 7  --wc-brand-600
      '#EF4E23', // 8  --wc-brand-700 (vermilion)
      '#D1190D', // 9  --wc-brand-800
    ],
  },
  fontFamily: 'var(--wc-font-body, Inter, system-ui, -apple-system, sans-serif)',
  fontFamilyMonospace: 'var(--wc-font-mono, ui-monospace, Menlo, monospace)',
  headings: {
    fontFamily: 'var(--wc-font-display, Montserrat, system-ui, -apple-system, sans-serif)',
    sizes: {
      h1: {
        fontSize: '1.125rem',
        fontWeight: '500',
        lineHeight: '2.0',
      },
    },
  },
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1.0rem',
    xl: '1.125rem',
  },
  defaultRadius: 'var(--wc-radius-md, 12px)',
});

const router = createBrowserRouter([{ path: '*', element: <App /> }]);

const navigate = (path: string): Promise<void> => router.navigate(path);

const container = document.getElementById('root') as HTMLDivElement;
const root = createRoot(container);
root.render(
  <StrictMode>
    <MedplumProvider medplum={medplum} navigate={navigate}>
      <MantineProvider theme={theme}>
        <Notifications position="bottom-right" />
        <RoleProvider>
          <TimerProvider>
            <RouterProvider router={router} />
          </TimerProvider>
        </RoleProvider>
      </MantineProvider>
    </MedplumProvider>
  </StrictMode>
);
