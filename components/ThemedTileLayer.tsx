'use client'

import { TileLayer, type TileLayerProps } from 'react-leaflet'
import { CARTO_TILE_URL, CARTO_DARK_TILE_URL } from '@/lib/vessel-utils'
import { useAppearance } from './AppearanceProvider'

export default function ThemedTileLayer(props: Omit<TileLayerProps, 'url'>) {
  const { dark } = useAppearance()
  return <TileLayer {...props} url={dark ? CARTO_DARK_TILE_URL : CARTO_TILE_URL} />
}
