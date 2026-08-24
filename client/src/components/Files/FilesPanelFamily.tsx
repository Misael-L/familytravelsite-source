/**
 * Family Files tab — TREK FileManager chrome, trip_files + Storage trip-files.
 * Nest filesApi stays on npm run dev:nest (TripPlannerPage dateien).
 */
import FileManager from './FileManager'
import { useFamilyFiles, type FamilyFilesPanelProps } from './useFamilyFiles'

export default function FilesPanelFamily(props: FamilyFilesPanelProps): React.ReactElement {
  const wired = useFamilyFiles(props)
  return <FileManager {...wired} />
}
