import { cache } from 'react'
import { supabase } from './supabase'

export const getResearchPublication = cache(async () => {
  const { data, error } = await supabase.from('data_publication').select('source_group, enabled')
  if (error) return { mfp: false, demo: false }
  return {
    mfp: data?.some((row) => row.source_group === 'mfp' && row.enabled) ?? false,
    demo: data?.some((row) => row.source_group === 'demo' && row.enabled) ?? false,
  }
})
