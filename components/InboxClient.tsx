'use client'

import ChatThread, { type ChatMessage } from './ChatThread'

interface Message extends ChatMessage {
  vessel_name?: string
  scientist_read_at?: string | null
}

export default function InboxClient({ roots, replies }: { roots: Message[]; replies: Message[] }) {
  const replyMap: Record<string, Message[]> = {}
  for (const r of replies ?? []) {
    if (!replyMap[r.thread_id]) replyMap[r.thread_id] = []
    replyMap[r.thread_id].push(r)
  }

  // Opening a thread stamps scientist_read_at and refreshes the navbar badge
  const markRead = (threadId: string) => {
    fetch(`/api/messages/${threadId}/read`, { method: 'PATCH' })
      .then(() => window.dispatchEvent(new Event('gw:unread-changed')))
      .catch(() => {})
  }

  const hasUnread = (root: Message) => {
    const readAt = root.scientist_read_at ? new Date(root.scientist_read_at).getTime() : 0
    return (replyMap[root.id] ?? []).some(
      (m) => m.author_role === 'operator' && new Date(m.created_at).getTime() > readAt,
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
            onOpen={() => markRead(root.id)}
            statusBadge={
              hasUnread(root) ? (
                <span className="bg-gold text-navy text-[10px] font-bold px-2 py-0.5 rounded-full">
                  new reply
                </span>
              ) : undefined
            }
          />
        )
      })}
    </div>
  )
}
