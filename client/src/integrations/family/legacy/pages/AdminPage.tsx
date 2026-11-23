import {
  Bell,
  Briefcase,
  Download,
  FileText,
  Map,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  ToggleLeft,
  UserCog,
  Users,
} from 'lucide-react';
import React from 'react';
import PageShell from '../components/Layout/PageShell';
import PageSidebar, { type PageSidebarTab } from '../components/Layout/PageSidebar';
import { useTranslation } from '../i18n';
import AdminStatCard from './admin/AdminStatCard';
import AdminUserModals from './admin/AdminUserModals';
import AdminUsersTab from './admin/AdminUsersTab';
import FamilyDataExportPanel from './admin/FamilyDataExportPanel';
import FamilyDefaultPreferencesManager from './admin/FamilyDefaultPreferencesManager';
import FamilyFeatureControlsManager from './admin/FamilyFeatureControlsManager';
import FamilyIdentitySettingsManager from './admin/FamilyIdentitySettingsManager';
import FamilyMapSettingsManager from './admin/FamilyMapSettingsManager';
import FamilyNotificationDefaultsManager from './admin/FamilyNotificationDefaultsManager';
import FamilyPackingTemplateManager from './admin/FamilyPackingTemplateManager';
import FamilyPlaceCategoryManager from './admin/FamilyPlaceCategoryManager';
import FamilyProductAuditPanel from './admin/FamilyProductAuditPanel';
import { isAdminSurfaceVisible, type AdminSurfaceId } from './admin/adminSurfaces';
import { useAdmin } from './admin/useAdmin';

export default function AdminPage(): React.ReactElement {
  const { t, locale } = useTranslation();
  // Page = wiring container: all admin data slices + handlers live in the hook,
  // each tab/section renders from a dedicated sub-component.
  const admin = useAdmin();
  const { mcpEnabled, devMode, supabasePlane, activeTab, setActiveTab, stats } = admin;

  const gUsers = t('admin.group.users');
  const gConfig = t('admin.group.config');
  const gIntegration = t('admin.group.integration');
  const gMaintenance = t('admin.group.maintenance');
  const tabCandidates: Array<PageSidebarTab & { id: AdminSurfaceId }> = [
    { id: 'users', label: t('admin.tabs.users'), icon: Users, group: gUsers },
    { id: 'defaults', label: t('admin.tabs.defaults'), icon: UserCog, group: gUsers },
    { id: 'config', label: t('admin.tabs.config'), icon: SlidersHorizontal, group: gConfig },
    { id: 'maps', label: t('admin.tabs.maps'), icon: Map, group: gConfig },
    { id: 'settings', label: t('admin.tabs.settings'), icon: SettingsIcon, group: gConfig },
    { id: 'features', label: t('admin.tabs.features'), icon: ToggleLeft, group: gConfig },
    { id: 'notifications', label: t('admin.tabs.notifications'), icon: Bell, group: gIntegration },
    { id: 'export', label: t('admin.tabs.export'), icon: Download, group: gMaintenance },
    ...(supabasePlane
      ? [{ id: 'audit' as const, label: t('admin.tabs.audit'), icon: ScrollText, group: gMaintenance }]
      : []),
  ];
  const TABS: PageSidebarTab[] = tabCandidates.filter((tab) =>
    isAdminSurfaceVisible(tab.id, { supabasePlane, mcpEnabled, devMode })
  );

  return (
    <PageShell background="var(--bg-secondary)">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-secondary">
            <Shield className="h-5 w-5 text-content" />
          </div>
          <div>
            <h1 className="text-title font-bold text-content">{t('admin.title')}</h1>
            <p className="text-body text-content-muted">{t('admin.subtitle')}</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: t('admin.stats.users'), value: stats.totalUsers, icon: Users },
              { label: t('admin.stats.trips'), value: stats.totalTrips, icon: Briefcase },
              { label: t('admin.stats.places'), value: stats.totalPlaces, icon: Map },
              { label: t('admin.stats.files'), value: stats.totalFiles || 0, icon: FileText },
            ].map(({ label, value, icon: Icon }) => (
              <AdminStatCard key={label} label={label} value={value} icon={Icon} />
            ))}
          </div>
        )}

        {/* Sidebar layout — nav on the left, active panel on the right */}
        <PageSidebar
          sidebarLabel={t('admin.title').toUpperCase()}
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          footer={supabasePlane ? 'family · Supabase' : 'admin · self-hosted'}
        >
          {/* Tab content */}
          {activeTab === 'users' && <AdminUsersTab admin={admin} t={t} locale={locale} />}

          {activeTab === 'config' && supabasePlane && (
            <div className="space-y-6">
              <FamilyPackingTemplateManager />
              <FamilyPlaceCategoryManager />
            </div>
          )}

          {activeTab === 'settings' && supabasePlane && <FamilyIdentitySettingsManager />}

          {activeTab === 'features' && supabasePlane && <FamilyFeatureControlsManager />}

          {activeTab === 'maps' && supabasePlane && <FamilyMapSettingsManager />}

          {activeTab === 'export' && supabasePlane && <FamilyDataExportPanel />}

          {activeTab === 'notifications' && supabasePlane && <FamilyNotificationDefaultsManager />}

          {activeTab === 'audit' && supabasePlane && <FamilyProductAuditPanel />}

          {/* Standalone defaults are owned by the native desktop and phone Admin routes. */}
          {activeTab === 'defaults' && supabasePlane && <FamilyDefaultPreferencesManager />}
        </PageSidebar>
      </div>

      <AdminUserModals admin={admin} t={t} />
    </PageShell>
  );
}
