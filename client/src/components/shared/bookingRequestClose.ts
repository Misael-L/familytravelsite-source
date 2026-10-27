import { createContext, useContext } from 'react'

const BookingRequestCloseContext = createContext<() => void>(() => {})

export function useBookingRequestClose(): () => void {
  return useContext(BookingRequestCloseContext)
}

export { BookingRequestCloseContext }
