import { createContext, useContext } from 'react'
import { nestPackingListOps, type PackingListOps } from './packingListOps'

export type PackingListOpsContextValue = {
  ops: PackingListOps
  canMutate?: boolean
}

export const PackingListOpsContext = createContext<PackingListOpsContextValue>({
  ops: nestPackingListOps,
})

export function usePackingListOpsContext(): PackingListOpsContextValue {
  return useContext(PackingListOpsContext)
}
