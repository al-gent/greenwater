'use client'

import { useState } from 'react'

export default function CopyLinkButton({ path, className, children = 'Copy link' }: { path: string; className?: string; children?: React.ReactNode }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setDone(true); setTimeout(() => setDone(false), 1500) } catch {}
  }
  return <button type="button" onClick={copy} className={className}>{done ? 'Link copied' : children}</button>
}
