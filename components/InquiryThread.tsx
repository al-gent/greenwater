'use client'

import ChatThread, { type ChatMessage } from './ChatThread'

interface Message extends ChatMessage {
  status: string
}

interface ScientistProfile {
  id: string
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
}

interface InquiryThreadProps {
  roots: Message[]
  replies: Message[]
  profiles: ScientistProfile[]
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: 'bg-gold-50 text-yellow-700 border-yellow-200',
    read: 'bg-gray-100 text-gray-500 border-gray-200',
    responded: 'bg-teal-50 text-teal border-teal/20',
  }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${styles[status] ?? 'bg-gray-100 text-gray-400'}`}>
      {status}
    </span>
  )
}

function OperatorThread({ root, replies, profile }: {
  root: Message
  replies: Message[]
  profile: ScientistProfile | undefined
}) {
  const scientistName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Scientist'
  const subparts = [
    profile?.institution,
    profile?.title,
    root.start_date && root.end_date
      ? `${new Date(root.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(root.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : root.start_date
        ? new Date(root.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null,
  ].filter(Boolean).join(' · ')

  const handleOpen = () => {
    if (root.status === 'new') {
      fetch(`/api/messages/${root.id}/read`, { method: 'PATCH' }).catch(() => {})
    }
  }

  return (
    <ChatThread
      threadId={root.id}
      initialMessages={[root, ...replies]}
      myRole="operator"
      header={scientistName}
      subheader={subparts || undefined}
      statusBadge={<StatusBadge status={root.status} />}
      onOpen={handleOpen}
    />
  )
}

export default function InquiryThread({ roots, replies, profiles }: InquiryThreadProps) {
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
  const replyMap: Record<string, Message[]> = {}
  for (const r of replies ?? []) {
    if (!replyMap[r.thread_id]) replyMap[r.thread_id] = []
    replyMap[r.thread_id].push(r)
  }

  if (!roots || roots.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-10 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-gray-500 text-sm">No inquiries yet. Scientists will appear here when they connect with your vessel.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {roots.map((root) => (
        <OperatorThread
          key={root.id}
          root={root}
          replies={replyMap[root.id] ?? []}
          profile={profileMap[root.author_id]}
        />
      ))}
    </div>
  )
}
