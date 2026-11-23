import { TranslationProvider } from './legacy/i18n';
import AdminPage from './legacy/pages/AdminPage';
export default function FamilyAdminPage() {
  return (
    <TranslationProvider>
      <AdminPage />
    </TranslationProvider>
  );
}
