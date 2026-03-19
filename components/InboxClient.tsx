'use client'

import Link from 'next/link'
import ChatThread, { type ChatMessage } from './ChatThread'

interface Message extends ChatMessage {
  vessel_name?: string
}

export default function InboxClient({ roots, replies }: { roots: Message[]; replies: Message[] }) {
  const replyMap: Record<string, Message[]> = {}
  for (const r of replies ?? []) {
    if (!replyMap[r.thread_id]) replyMap[r.thread_id] = []
    replyMap[r.thread_id].push(r)
  }

  if (!roots || roots.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-12 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-gray-600 font-medium mb-1">No messages yet</p>
        <p className="text-gray-400 text-sm mb-6">You haven&apos;t contacted any vessels yet.</p>
        <Link href="/" className="bg-navy text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors">
          Browse Vessels
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {roots.map((root) => {
        const threadMessages = [root, ...(replyMap[root.id] ?? [])]
        const vesselName = root.vessel_name ?? `Vessel #${root.vessel_id}`
        const dateLine = [root.start_date, root.end_date].filter(Boolean)
          .map(d => new Date(d!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
          .join(' – ')

        return (
          <ChatThread
            key={root.id}
            threadId={root.id}
            initialMessages={threadMessages}
            myRole="scientist"
            header={vesselName}
            subheader={dateLine || undefined}
            headerLink={`/vessels/${root.vessel_id}`}
          />
        )
      })}
    </div>
  )
}
