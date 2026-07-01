import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AuthLayout } from "./layouts/AuthLayout";
import { MainLayout } from "./layouts/MainLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { DashboardPage } from "./pages/user/DashboardPage";
import { AccountPage } from "./pages/user/AccountPage";
import { ServerLayout } from "./layouts/ServerLayout";
import { ServerManagePage } from "./pages/user/server/ServerManagePage";
import { ServerConsolePage } from "./pages/user/server/ServerConsolePage";
import { ServerFilesPage } from "./pages/user/server/ServerFilesPage";
import { ServerFileEditPage } from "./pages/user/server/ServerFileEditPage";
import { ServerSettingsPage } from "./pages/user/server/ServerSettingsPage";
import { ServerStartupPage } from "./pages/user/server/ServerStartupPage";
import { ServerPlayersPage } from "./pages/user/server/ServerPlayersPage";
import { ServerWorldsPage } from "./pages/user/server/ServerWorldsPage";
import { ServerBackupsPage } from "./pages/user/server/ServerBackupsPage";
import { ServerAccessPage } from "./pages/user/server/ServerAccessPage";
import { ServerAlertsPage } from "./pages/user/server/ServerAlertsPage";
import { ServerTasksPage } from "./pages/user/server/ServerTasksPage";
import { CreateServerPage } from "./pages/user/CreateServerPage";
import { AdminOverviewPage } from "./pages/admin/AdminOverviewPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminUserCreatePage } from "./pages/admin/AdminUserCreatePage";
import { AdminUserEditPage } from "./pages/admin/AdminUserEditPage";
import { AdminServersPage } from "./pages/admin/AdminServersPage";
import { AdminServerCreatePage } from "./pages/admin/AdminServerCreatePage";
import { AdminServerEditPage } from "./pages/admin/AdminServerEditPage";
import { AdminNodesPage } from "./pages/admin/AdminNodesPage";
import { AdminNodeCreatePage } from "./pages/admin/AdminNodeCreatePage";
import { AdminNodeEditPage } from "./pages/admin/AdminNodeEditPage";
import { AdminNodeStatsPage } from "./pages/admin/AdminNodeStatsPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { AdminImagesPage } from "./pages/admin/AdminImagesPage";
import { AdminImageEditPage } from "./pages/admin/AdminImageEditPage";
import { AdminImageStorePage } from "./pages/admin/AdminImageStorePage";
import { AdminAddonsPage } from "./pages/admin/AdminAddonsPage";
import { AdminAddonStorePage } from "./pages/admin/AdminAddonStorePage";
import { AdminAnalyticsPage } from "./pages/admin/AdminAnalyticsPage";
import { AdminApiKeysPage } from "./pages/admin/AdminApiKeysPage";
import { AdminApiDocsPage } from "./pages/admin/AdminApiDocsPage";
import { AdminPlayerStatsPage } from "./pages/admin/AdminPlayerStatsPage";
import { AdminSecurityPage } from "./pages/admin/AdminSecurityPage";
import { AdminAirlinkCloudPage } from "./pages/admin/AdminAirlinkCloudPage";
import { ConsumerOverviewPage } from "./pages/consumer/ConsumerOverviewPage";
import { ConsumerCreateServerPage } from "./pages/consumer/ConsumerCreateServerPage";
import { ConsumerApiKeysPage } from "./pages/consumer/ConsumerApiKeysPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="create-server" element={<CreateServerPage />} />

        <Route path="server/:id" element={<ServerLayout />}>
          <Route index element={<ServerManagePage />} />
          <Route path="console" element={<ServerConsolePage />} />
          <Route path="files" element={<ServerFilesPage />} />
          <Route path="files/edit/*" element={<ServerFileEditPage />} />
          <Route path="settings" element={<ServerSettingsPage />} />
          <Route path="startup" element={<ServerStartupPage />} />
          <Route path="players" element={<ServerPlayersPage />} />
          <Route path="worlds" element={<ServerWorldsPage />} />
          <Route path="backups" element={<ServerBackupsPage />} />
          <Route path="access" element={<ServerAccessPage />} />
          <Route path="alerts" element={<ServerAlertsPage />} />
          <Route path="tasks" element={<ServerTasksPage />} />
        </Route>
      </Route>

      <Route
        element={
          <AdminRoute>
            <MainLayout />
          </AdminRoute>
        }
      >
        <Route path="admin/overview" element={<AdminOverviewPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
        <Route path="admin/users/create" element={<AdminUserCreatePage />} />
        <Route path="admin/users/edit/:id" element={<AdminUserEditPage />} />
        <Route path="admin/servers" element={<AdminServersPage />} />
        <Route path="admin/servers/create" element={<AdminServerCreatePage />} />
        <Route path="admin/servers/edit/:id" element={<AdminServerEditPage />} />
        <Route path="admin/nodes" element={<AdminNodesPage />} />
        <Route path="admin/nodes/create" element={<AdminNodeCreatePage />} />
        <Route path="admin/nodes/edit/:id" element={<AdminNodeEditPage />} />
        <Route path="admin/nodes/stats/:id" element={<AdminNodeStatsPage />} />
        <Route path="admin/settings" element={<AdminSettingsPage />} />
        <Route path="admin/images" element={<AdminImagesPage />} />
        <Route path="admin/images/edit/:id" element={<AdminImageEditPage />} />
        <Route path="admin/images/store" element={<AdminImageStorePage />} />
        <Route path="admin/addons" element={<AdminAddonsPage />} />
        <Route path="admin/addons/store" element={<AdminAddonStorePage />} />
        <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
        <Route path="admin/api-keys" element={<AdminApiKeysPage />} />
        <Route path="admin/api/docs" element={<AdminApiDocsPage />} />
        <Route path="admin/playerstats" element={<AdminPlayerStatsPage />} />
        <Route path="admin/security" element={<AdminSecurityPage />} />
        <Route path="admin/airlink-cloud" element={<AdminAirlinkCloudPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="consumer/overview" element={<ConsumerOverviewPage />} />
        <Route path="consumer/create-server" element={<ConsumerCreateServerPage />} />
        <Route path="consumer/api-keys" element={<ConsumerApiKeysPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
