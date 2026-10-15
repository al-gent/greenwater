'use client'

// The funded work aboard a cruise, one tab per project. A single project renders without
// a tab strip. Everything is already loaded with the cruise; this only holds which tab is open.
import { useState } from 'react'
import type { CruiseProject } from '@/lib/cruise-utils'

export default function CruiseProjectsTabs({ projects }: { projects: CruiseProject[] }) {
  const [i, setI] = useState(0)
  if (projects.length === 0) return <p className="text-sm text-gray-400">No project details for this cruise yet.</p>
  const p = projects[Math.min(i, projects.length - 1)]
  const summary = p.summary

  return (
    <div>
      {projects.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-4" role="tablist" aria-label="Projects aboard">
          {projects.map((pr, idx) => (
            <button key={pr.id} role="tab" aria-selected={idx === i} onClick={() => setI(idx)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${idx === i ? 'border-navy text-navy' : 'border-transparent text-gray-500 hover:text-navy'}`}>
              {pr.title}
            </button>
          ))}
        </div>
      )}
      <div>
        {projects.length > 1 && <h3 className="text-base font-semibold text-navy mb-2">{p.title}</h3>}
        {summary ? <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{summary}</p> : <p className="text-sm text-gray-400">No description for this project yet.</p>}
      </div>
    </div>
  )
}
