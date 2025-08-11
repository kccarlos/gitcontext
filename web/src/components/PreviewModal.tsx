import { useEffect, useMemo, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { X } from 'lucide-react'
import Prism from 'prismjs'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import 'prismjs/themes/prism.css'
import type { FileDiffStatus } from '../hooks/useFileTree'

type Side = { binary: boolean; text: string | null; notFound?: boolean } | undefined

type Props = {
  open: boolean
  onClose: () => void
  path: string
  status: FileDiffStatus
  baseLabel: string
  compareLabel: string
  base: Side
  compare: Side
}

function StatusBadge({ status }: { status: FileDiffStatus }) {
  const label = status === 'modify' ? 'MODIFIED' : status === 'add' ? 'ADDED' : status === 'remove' ? 'REMOVED' : 'UNCHANGED'
  return <span className="tag">{label}</span>
}

export default function PreviewModal({ open, onClose, path, status, baseLabel, compareLabel, base, compare }: Props) {
  const [splitView, setSplitView] = useState(true)
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute('data-theme') === 'dark')

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Initialize from persisted preference, default to side-by-side
  useEffect(() => {
    if (!open) return
    try {
      const saved = localStorage.getItem('gc.preview.split')
      if (saved === 'true' || saved === 'false') setSplitView(saved === 'true')
      else setSplitView(true)
    } catch {
      setSplitView(true)
    }
  }, [open])

  // Persist preference when changed while open
  useEffect(() => {
    if (!open) return
    try { localStorage.setItem('gc.preview.split', String(splitView)) } catch {}
  }, [splitView, open])

  const { oldValue, newValue, isBinary, infoLeft, infoRight } = useMemo(() => {
    const baseText = base?.binary ? null : (typeof base?.text === 'string' ? base?.text : null)
    const compareText = compare?.binary ? null : (typeof compare?.text === 'string' ? compare?.text : null)

    let oldValue = ''
    let newValue = ''
    if (status === 'modify') {
      oldValue = baseText ?? ''
      newValue = compareText ?? ''
    } else if (status === 'add') {
      oldValue = ''
      newValue = compareText ?? ''
    } else if (status === 'remove') {
      oldValue = baseText ?? ''
      newValue = ''
    } else {
      // unchanged: show full file (old = new)
      const same = baseText ?? ''
      oldValue = same
      newValue = same
    }
    const isBinary = (base?.binary || compare?.binary) ?? false
    const infoLeft = base?.notFound ? 'not found' : base?.binary ? 'binary' : `${oldValue.length} chars`
    const infoRight = compare?.notFound ? 'not found' : compare?.binary ? 'binary' : `${newValue.length} chars`
    return { oldValue, newValue, isBinary, infoLeft, infoRight }
  }, [base, compare, status])

  if (!open) return null

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, background: 'color-mix(in hsl, black 40%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div
        style={{
          background: 'Canvas', color: 'CanvasText', borderRadius: 10, width: 'min(1200px, 96vw)',
          maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.35)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', gap: 10, borderBottom: '1px solid color-mix(in hsl, currentColor 20%, transparent)' }}>
          <strong id="preview-modal-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Preview: <code>{path}</code>
          </strong>
          <StatusBadge status={status} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="tag">{baseLabel} — {infoLeft}</span>
            <span className="tag">{compareLabel} — {infoRight}</span>
            <div style={{ borderLeft: '1px solid color-mix(in hsl, currentColor 20%, transparent)', height: 22 }} />
            <button
              type="button"
              aria-pressed={!splitView}
              onClick={() => setSplitView(false)}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: 6,
                border: '1px solid color-mix(in hsl, currentColor 20%, transparent)',
                background: !splitView ? 'color-mix(in oklab, currentColor 12%, transparent)' : 'transparent',
              }}
              title="Unified Diff"
            >
              Unified
            </button>
            <button
              type="button"
              aria-pressed={splitView}
              onClick={() => setSplitView(true)}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: 6,
                border: '1px solid color-mix(in hsl, currentColor 20%, transparent)',
                background: splitView ? 'color-mix(in oklab, currentColor 12%, transparent)' : 'transparent',
              }}
              title="Side-by-Side Diff"
            >
              Side-by-Side
            </button>
            <button type="button" onClick={onClose} title="Close" aria-label="Close" style={{ marginLeft: 6 }} className="icon-only"><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: '0.75rem 1rem', overflow: 'auto' }}>
          {isBinary ? (
            <div className="hint">Binary file preview is not supported. Contents are omitted.</div>
          ) : (
            <ReactDiffViewer
              oldValue={oldValue}
              newValue={newValue}
              splitView={splitView}
              showDiffOnly={status !== 'unchanged'}
              useDarkTheme={isDark}
              leftTitle={`Base: ${baseLabel}`}
              rightTitle={`Compare: ${compareLabel}`}
              disableWordDiff={false}
              renderContent={(str) => {
                // Heuristic language from extension
                const lower = path.toLowerCase()
                let lang: string = 'javascript'
                if (lower.endsWith('.ts')) lang = 'typescript'
                else if (lower.endsWith('.tsx')) lang = 'tsx'
                else if (lower.endsWith('.jsx')) lang = 'jsx'
                else if (lower.endsWith('.json')) lang = 'json'
                else if (lower.endsWith('.md')) lang = 'markdown'
                try {
                  const grammar = Prism.languages[lang as keyof typeof Prism.languages] || Prism.languages.javascript
                  const html = Prism.highlight(str, grammar, lang)
                  return <span dangerouslySetInnerHTML={{ __html: html }} />
                } catch {
                  return <span>{str}</span>
                }
              }}
              styles={{
                variables: {
                  light: { codeFoldGutterBackground: 'transparent' },
                  dark: { codeFoldGutterBackground: 'transparent' },
                } as any,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}


