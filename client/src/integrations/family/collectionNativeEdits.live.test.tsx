import { vi } from 'vitest';
import { registerCollectionNativeEditsLive } from '../../../tests/qualification/collectionNativeEdits.live';
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock('@family/backend/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.invalid' }));
registerCollectionNativeEditsLive();
