'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, User } from 'lucide-react'
import { QualityFlagBanner } from '@/components/quality-flag-banner'
import type { RoomPost } from '@/lib/scopes/types'
import { cn } from '@/lib/utils'

function LtrData({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="ltr"
      className="my-2 overflow-x-auto rounded-lg bg-stone-900 p-3 text-left font-mono text-sm text-stone-100"
    >
      {children}
    </div>
  )
}

function formatTime(ts: number) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts))
  } catch {
    return ''
  }
}

/** Single peer post in a humans+agents room timeline. */
export function RoomPostCard({ post }: { post: RoomPost }) {
  const isAgent = post.authorKind === 'agent'
  const isChannel =
    post.authorKind === 'channel' || post.authorKind === 'system'

  return (
    <article
      className={cn(
        'mb-4 rounded-lg border px-3 py-3',
        isAgent
          ? 'border-ab-accent/25 bg-ab-accent/[0.04]'
          : isChannel
            ? 'border-dashed border-stone-300 bg-stone-50'
            : 'border-ab-border bg-ab-surface'
      )}
      dir="rtl"
    >
      <header className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full',
            isAgent
              ? 'bg-ab-accent/15 text-ab-accent'
              : isChannel
                ? 'bg-stone-200 text-stone-600'
                : 'bg-stone-200 text-ab-ink'
          )}
          aria-hidden
        >
          {isAgent || isChannel ? (
            <Bot className="h-3.5 w-3.5" />
          ) : (
            <User className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-ab-ink">
              {post.authorNameAr}
            </span>
            <span className="text-[11px] text-stone-500">
              {isAgent
                ? 'وكيل'
                : isChannel
                  ? 'قناة / نظام'
                  : 'بشري'}
            </span>
            <span className="text-[11px] text-stone-400">
              {formatTime(post.createdAt)}
            </span>
          </div>
        </div>
        {post.streaming && (
          <span className="text-[11px] text-ab-accent">يكتب…</span>
        )}
      </header>

      <div className="text-sm leading-relaxed text-ab-ink">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: ({ children }) => <LtrData>{children}</LtrData>,
            code: ({ className, children, ...props }) => {
              const isBlock = Boolean(className)
              if (isBlock) {
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              }
              return (
                <code
                  dir="ltr"
                  className="rounded bg-stone-200 px-1 py-0.5 text-left font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              )
            },
          }}
        >
          {post.content || (post.streaming ? '…' : '')}
        </ReactMarkdown>
      </div>
      <QualityFlagBanner show={Boolean(post.qualityWarning)} />
    </article>
  )
}
