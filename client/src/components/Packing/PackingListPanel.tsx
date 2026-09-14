import { usePackingList } from './usePackingListPanel'
import type { PackingListPanelProps } from './usePackingListPanel'
import { PackingHeader } from './PackingListPanelHeader'
import { PackingViewTabs } from './PackingListPanelViewTabs'
import { PackingList } from './PackingListPanelList'
import { BagSidebar } from './PackingListPanelBagSidebar'
import { BagModal } from './PackingListPanelBagModal'
import { BulkImportModal } from './PackingListPanelImportModal'
import { nestPackingListOps } from './packingListOps'
import { PackingListOpsContext } from './packingListOpsContext'

export { itemWeight } from './packingListPanel.helpers'

export default function PackingListPanel(props: PackingListPanelProps) {
  return (
    <PackingListOpsContext.Provider value={{ ops: props.ops ?? nestPackingListOps, canMutate: props.canMutate }}>
      <PackingListPanelBody {...props} />
    </PackingListOpsContext.Provider>
  )
}

function PackingListPanelBody(props: PackingListPanelProps) {
  const S = usePackingList(props)
  const { font, bagTrackingEnabled, bags, showBagModal, showImportModal } = S
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', ...font }}>
      <PackingHeader {...S} />
      <PackingViewTabs {...S} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <PackingList {...S} />
        {bagTrackingEnabled && bags.length > 0 && <BagSidebar {...S} />}
      </div>
      {showBagModal && bagTrackingEnabled && <BagModal {...S} />}
      <style>{`
        .assignee-chip:hover + .assignee-tooltip { opacity: 1 !important; }
        .assignee-chip:hover { opacity: 0.7; }
      `}</style>
      {showImportModal && <BulkImportModal {...S} />}
    </div>
  )
}
