// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loading, useMedplum, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { Suspense, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from './auth/RoleGate';
import { TaskDetailsModal } from './components/tasks/TaskDetailsModal';
import { hasDoseSpotIdentifier, hasScriptSureIdentifier } from './components/utils';
import { WcShell } from './components/WcShell';
import './index.css';

const SETUP_DISMISSED_KEY = 'medplum-provider-setup-completed';

import { EncounterChartPage } from './pages/encounter/EncounterChartPage';
import { EncounterModal } from './pages/encounter/EncounterModal';
import { FaxPage } from './pages/fax/FaxPage';
import { GetStartedPage } from './pages/getstarted/GetStartedPage';
import { DoseSpotFavoritesPage } from './pages/integrations/DoseSpotFavoritesPage';
import { DoseSpotNotificationsPage } from './pages/integrations/DoseSpotNotificationsPage';
import { IntegrationsPage } from './pages/integrations/IntegrationsPage';
import { ScriptSurePage } from './pages/integrations/ScriptSurePage';
import { MessagesPage } from './pages/messages/MessagesPage';
import { CommunicationTab } from './pages/patient/CommunicationTab';
import { CoveragePage } from './pages/patient/CoveragePage';
import { DoseSpotTab } from './pages/patient/DoseSpotTab';
import { EditTab } from './pages/patient/EditTab';
import { ExportTab } from './pages/patient/ExportTab';
import { IntakeFormPage } from './pages/patient/IntakeFormPage';
import { LabsPage } from './pages/patient/LabsPage';
import { MedicationsPage } from './pages/patient/MedicationsPage';
import { PatientPage } from './pages/patient/PatientPage';
import { PatientSearchPage } from './pages/patient/PatientSearchPage';
import { ScriptSureTab } from './pages/patient/ScriptSureTab';
import { TasksTab } from './pages/patient/TasksTab';
import { TimelineTab } from './pages/patient/TimelineTab';
import { ResourceCreatePage } from './pages/resource/ResourceCreatePage';
import { ResourceDetailPage } from './pages/resource/ResourceDetailPage';
import { ResourceEditPage } from './pages/resource/ResourceEditPage';
import { ResourceHistoryPage } from './pages/resource/ResourceHistoryPage';
import { ResourcePage } from './pages/resource/ResourcePage';
import { SchedulePage as ProviderSchedulePage } from './pages/schedule/SchedulePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { SpacesPage } from './pages/spaces/SpacesPage';
import { TasksPage } from './pages/tasks/TasksPage';
// Custom WiderCircle pages
import { AppointmentsPage as WCAppointmentsPage } from './pages/appointments/AppointmentsPage';
import { AssessmentsPage as WCAssessmentsPage } from './pages/assessments/AssessmentsPage';
import { BillingPage as WCBillingPage } from './pages/billing/BillingPage';
import { CarePlanPage as WCCarePlanPage } from './pages/careplan/CarePlanPage';
import { ConsentsPage as WCConsentsPage } from './pages/consents/ConsentsPage';
import { BillingDashboardPage } from './pages/BillingDashboardPage';
import { TaskDashboardPage } from './pages/TaskDashboardPage';
import { BillingSyncPage } from './pages/BillingSyncPage';
import { ConsentCapturePage } from './pages/ConsentCapturePage';
import { EligibilityCheckPage } from './pages/EligibilityCheckPage';
import { PlanEditPage } from './pages/PlanEditPage';
import { PlanOfCarePage } from './pages/PlanOfCarePage';
import { PlanReviewPage } from './pages/PlanReviewPage';
import { PreVisitPage } from './pages/PreVisitPage';
import { SDoHAssessmentPage } from './pages/SDoHAssessmentPage';
import { SignOffQueuePage } from './pages/SignOffQueuePage';
import { SubmitForReviewPage } from './pages/SubmitForReviewPage';
import { TimeTrackingPage } from './pages/TimeTrackingPage';
import { TodayPage } from './pages/TodayPage';
import { VisitWorkspacePage } from './pages/VisitWorkspacePage';
import { SchedulePage as CHWSchedulePage } from './pages/SchedulePage';
import { PublicConsentPage } from './pages/PublicConsentPage';
import { RoleManagementPage } from './pages/RoleManagementPage';
import { MemberContextPage } from './pages/MemberContextPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [setupDismissed] = useState(() => localStorage.getItem(SETUP_DISMISSED_KEY) === 'true');

  if (medplum.isLoading()) {
    return null;
  }

  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);
  const hasScriptSure = hasScriptSureIdentifier(membership);

  const routes = (
    <Suspense fallback={<Loading />}>
      <Routes>
          {profile ? (
            <>
              <Route path="/getstarted" element={<GetStartedPage />} />
              <Route path="/Spaces/Communication" element={<SpacesPage />}>
                <Route index element={<SpacesPage />} />
                <Route path=":topicId" element={<SpacesPage />} />
              </Route>
              <Route
                path="/"
                element={
                  <Navigate
                    to={
                      setupDismissed
                        ? '/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated'
                        : '/getstarted'
                    }
                    replace
                  />
                }
              />
              <Route path="/Patient/new" element={<ResourceCreatePage />} />
              <Route path="/members/:patientId" element={<MemberContextPage />} />
              <Route path="/Patient/:patientId" element={<PatientPage />}>
                <Route path="careplan" element={<WCCarePlanPage />} />
                <Route path="billing" element={<WCBillingPage />} />
                <Route path="consents" element={<WCConsentsPage />} />
                <Route path="assessments" element={<WCAssessmentsPage />} />
                <Route path="appointments" element={<WCAppointmentsPage />} />
                <Route path="Encounter/new" element={<EncounterModal />} />
                <Route path="Encounter/:encounterId" element={<EncounterChartPage />}>
                  <Route path="Task/:taskId" element={<TaskDetailsModal />} />
                </Route>
                <Route path="edit" element={<EditTab />} />
                <Route path="Communication" element={<CommunicationTab />} />
                <Route path="Communication/:messageId" element={<CommunicationTab />} />
                <Route path="Task" element={<TasksTab />} />
                <Route path="Task/:taskId" element={<TasksTab />} />
                {hasDoseSpot && <Route path="dosespot" element={<DoseSpotTab />} />}
                {hasScriptSure && <Route path="scriptsure" element={<ScriptSureTab />} />}
                <Route path="timeline" element={<TimelineTab />} />
                <Route path="export" element={<ExportTab />} />
                <Route path="ServiceRequest" element={<LabsPage />} />
                <Route path="ServiceRequest/:serviceRequestId" element={<LabsPage />} />
                <Route path="MedicationRequest" element={<MedicationsPage />} />
                <Route path=":resourceType" element={<PatientSearchPage />} />
                <Route path="Coverage" element={<CoveragePage />} />
                <Route path="Coverage/:coverageId" element={<CoveragePage />} />
                <Route path="Coverage/:coverageId/CoverageEligibilityRequest/:requestId" element={<CoveragePage />} />
                <Route path=":resourceType/new" element={<ResourceCreatePage />} />
                <Route path=":resourceType/:id" element={<ResourcePage />}>
                  <Route path="" element={<ResourceDetailPage />} />
                  <Route path="edit" element={<ResourceEditPage />} />
                  <Route path="history" element={<ResourceHistoryPage />} />
                </Route>
                <Route path="" element={<TimelineTab />} />
              </Route>
              <Route path="/Communication" element={<MessagesPage />}>
                <Route index element={<MessagesPage />} />
                <Route path=":messageId" element={<MessagesPage />} />
              </Route>
              <Route path="/Task" element={<TasksPage />} />
              <Route path="/Task/:taskId" element={<TasksPage />} />
              {/* WiderCircle CHW features */}
              <Route path="/billing-dashboard" element={<BillingDashboardPage />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/eligibility" element={<EligibilityCheckPage />} />
              <Route path="/encounters/:encounterId/pre-visit" element={<PreVisitPage />} />
              <Route path="/sdoh" element={<SDoHAssessmentPage />} />
              <Route path="/consent" element={<ConsentCapturePage />} />
              <Route path="/encounters/:encounterId/workspace" element={<VisitWorkspacePage />} />
              <Route
                path="/plan-of-care"
                element={
                  <RequirePermission permission="careplan.author">
                    <PlanOfCarePage />
                  </RequirePermission>
                }
              />
              <Route path="/plan-review" element={<PlanReviewPage />} />
              <Route path="/plan-edit" element={<PlanEditPage />} />
              <Route path="/time-tracking" element={<TimeTrackingPage />} />
              <Route path="/review-submission" element={<SubmitForReviewPage />} />
              <Route
                path="/signoff-queue"
                element={
                  <RequirePermission permission="queue.signoff">
                    <SignOffQueuePage />
                  </RequirePermission>
                }
              />
              <Route
                path="/billing-sync"
                element={
                  <RequirePermission permission="billing.sync">
                    <BillingSyncPage />
                  </RequirePermission>
                }
              />
              <Route path="/my-tasks" element={<TaskDashboardPage />} />
              <Route path="/my-schedule" element={<CHWSchedulePage />} />
              <Route
                path="/admin/roles"
                element={
                  <RequirePermission permission="admin.roles">
                    <RoleManagementPage />
                  </RequirePermission>
                }
              />
              <Route path="/public/consent/:questionnaireId/:patientId" element={<PublicConsentPage />} />
              <Route path="/Fax/Communication" element={<FaxPage />} />
              <Route path="/Fax/Communication/:faxId" element={<FaxPage />} />
              <Route path="/onboarding" element={<IntakeFormPage />} />
              <Route path="/Calendar/Schedule" element={<ProviderSchedulePage />} />
              <Route path="/Calendar/Schedule/:id" element={<ProviderSchedulePage />} />
              <Route path="/signin" element={<SignInPage />} />
              {hasDoseSpot && <Route path="/dosespot" element={<DoseSpotNotificationsPage />} />}
              {hasScriptSure && <Route path="/scriptsure" element={<ScriptSurePage />} />}
              <Route
                path="/integrations"
                element={
                  <RequirePermission permission="admin.integrations">
                    <IntegrationsPage />
                  </RequirePermission>
                }
              />
              <Route path="/:resourceType" element={<SearchPage />} />
              <Route path="/:resourceType/new" element={<ResourceCreatePage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />}>
                <Route path="" element={<ResourceDetailPage />} />
                <Route path="edit" element={<ResourceEditPage />} />
                <Route path="history" element={<ResourceHistoryPage />} />
              </Route>
              {hasDoseSpot && <Route path="/integrations/dosespot" element={<DoseSpotFavoritesPage />} />}
            </>
          ) : (
            <>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="*" element={<Navigate to="/signin" replace />} />
            </>
          )}
      </Routes>
    </Suspense>
  );

  if (!profile) {
    return routes;
  }

  return <WcShell>{routes}</WcShell>;
}
