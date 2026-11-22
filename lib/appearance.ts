export type Appearance = 'system' | 'light' | 'dark'
export const appearanceKey = 'vesselconnect.appearance'
export const darkQuery = '(prefers-color-scheme: dark)'

export function parseAppearance(value: string | null): Appearance {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// Run before the page paints, including on direct visits to nested routes.
export const initialThemeScript = `(() => {
  let value;
  try { value = localStorage.getItem('${appearanceKey}') } catch {}
  document.documentElement.dataset.theme = value === 'light' || value === 'dark'
    ? value : (matchMedia('${darkQuery}').matches ? 'dark' : 'light');
})()`
