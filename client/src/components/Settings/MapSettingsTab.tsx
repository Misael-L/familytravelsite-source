import React from 'react'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import FamilyMapPicker from './FamilyMapPicker'
import NestMapSettingsTab from './NestMapSettingsTab'

export default function MapSettingsTab(): React.ReactElement {
  if (isSupabaseDataPlane()) return <FamilyMapPicker />
  return <NestMapSettingsTab />
}
