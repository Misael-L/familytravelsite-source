/**
 * Family Lists tab — TREK ListsContainer + PackingListPanel + TodoListPanel,
 * packing.ts / todos.ts. Nest packingApi/todoApi stay on npm run dev:nest.
 */
import ListsContainer from './ListsContainer'
import { useFamilyLists, type FamilyListsPanelProps } from './useFamilyLists'

export default function ListsPanelFamily(props: FamilyListsPanelProps): React.ReactElement {
  const wired = useFamilyLists(props)
  return <ListsContainer {...wired} />
}
