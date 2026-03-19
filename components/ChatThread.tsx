'use client'

import { useState, useRef, useEffect } from 'react'

export interface ChatMessage {
  id: string
  thread_id: string
  vessel_id: number
  author_id: string
  author_role: string
  body: string
  start_date?: string | null
  end_date?: string | null
  status?: string
  created_at: string
}

interface ChatThreadProps {
  threadId: string
  initialMessages: ChatMessage[]   // root first, then replies in order
  myRole: 'scientist' | 'operator'
  header: string                   // vessel name (scientist) or scientist name (operator)
  subheader?: string               // optional — institution/title or date range
  statusBadge?: React.ReactNode    // operator side passes a badge
  onOpen?: () => void              // operator side fires mark-as-read
  headerLink?: string              // "View vessel →" for scientist side
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function ChatThread({
  threadId,
  initialMessages,
  myRole,
  header,
  subheader,
  statusBadge,
  onOpen,
  headerLink,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, expanded])

  const handleExpand = () => {
    if (!expanded && onOpen) onOpen()
    setExpanded(!expanded)
  }

  const sendReply = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/messages/${threadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      const { message } = await res.json()
      setMessages((prev) => [...prev, message])
      setReplyText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply()
  }

  const replyCount = messages.length - 1

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      {/* Header — always visible */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={handleExpand}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-navy">{header}</span>
            {statusBadge}
          </div>
          {subheader && <p className="text-sm text-gray-500 mt-0.5 truncate">{subheader}</p>}
          {!expanded && (
            <p className="text-sm text-gray-400 mt-1 truncate">{messages[0]?.body}</p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-3 flex-shrink-0">
          {replyCount > 0 && !expanded && (
            <span className="text-xs text-gray-400">{replyCount} repl{replyCount === 1 ? 'y' : 'ies'}</span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <>
          {/* Message bubbles */}
          <div className="px-5 py-3 space-y-3 max-h-96 overflow-y-auto border-t border-gray-100">
            {messages.map((msg) => {
              const isMe = msg.author_role === myRole
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      isMe
                        ? 'bg-navy text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}>
                      {msg.body}
                    </div>
                    <span className="text-[11px] text-gray-400 px-1">{fmtTime(msg.created_at)}</span>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Reply box */}
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
            <div className="flex gap-2 items-end">
              <textarea
                rows={2}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Reply… (⌘↵ to send)"
                className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none transition"
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="flex-shrink-0 bg-navy text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-navy-600 transition-colors disabled:opacity-40"
              >
                {sending ? <Spinner /> : (
                  <svg className="w-4 h-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            {headerLink && (
              <a href={headerLink} className="text-xs text-teal hover:underline mt-2 inline-block">
                View vessel →
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}
