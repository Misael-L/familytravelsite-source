import { isFamilyFrontendActive } from './runtime';
import type { useFamilyCollectionCreate } from './useFamilyCollectionCreate';
export function FamilyCollectionSourceChoice({ form }: { form: ReturnType<typeof useFamilyCollectionCreate> }) {
  if (!isFamilyFrontendActive()) return null;
  return (
    <div>
      {form.error ? <p role="alert">{form.error}</p> : !form.ready ? <p role="status">Checking Collection…</p> : null}
      {form.pickedCatalog && (
        <label>
          Save catalog item as
          <select
            aria-label="Save catalog item as"
            value={form.mode}
            onChange={(e) => form.setMode(e.target.value === 'snapshot' ? 'snapshot' : 'reference')}
          >
            <option value="reference">Catalog reference</option>
            <option value="snapshot">Independent snapshot</option>
          </select>
        </label>
      )}
    </div>
  );
}
