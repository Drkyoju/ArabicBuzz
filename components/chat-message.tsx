'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { QualityFlagBanner } from '@/components/quality-flag-banner'

type Props = {
  role: 'user' | 'assistant'
  content: string
  qualityWarning?: boolean
}

function LtrData({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="ltr"
      className="font-mono bg-stone-900 text-stone-100 p-3 rounded-lg text-left my-2 text-sm overflow-x-auto"
    >
      {children}
    </div>
  )
}

export function ChatMessage({ role, content, qualityWarning }: Props) {
  return (
    <div
      className={`mb-4 ${
        role === 'user' ? 'text-ab-ink' : 'border-r-2 border-ab-border pr-3'
      }`}
    >
      <div className="mb-1 text-xs text-stone-500">
        {role === 'user' ? 'أنت' : 'الوكيل'}
      </div>
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
                className="rounded bg-stone-200 px-1 py-0.5 font-mono text-sm text-left"
                {...props}
              >
                {children}
              </code>
            )
          },
          a: ({ href, children }) => {
            const isData =
              href?.startsWith('http') &&
              (href.includes('/api/') || href.includes('arabicbuzz.netlify.app'))
            if (isData) {
              return (
                <LtrData>
                  <a href={href} className="underline">
                    {children}
                  </a>
                </LtrData>
              )
            }
            return (
              <a href={href} className="text-ab-accent underline">
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
      <QualityFlagBanner show={qualityWarning} />
    </div>
  )
}
