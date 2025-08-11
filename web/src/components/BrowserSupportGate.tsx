import type { PropsWithChildren } from 'react'
import { useMemo } from 'react'

export default function BrowserSupportGate({ children }: PropsWithChildren) {
  const supportsFSAccess = useMemo(() => {
    try {
      return typeof (window as any).showDirectoryPicker === 'function'
    } catch {
      return false
    }
  }, [])

  if (!supportsFSAccess) {
    return (
      <div className="gc-overlay">
        <div className="gc-overlay-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <img src={`${import.meta.env.BASE_URL}gitcontext-full-dark.svg`} alt="GitContext" height={28} />
          </div>
          <h2>Unsupported Browser</h2>
          <p>
            Your browser does not support the File System Access API required by GitContext.
          </p>
          <p>
            Please use a Chromium-based browser such as <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
          </p>
          <p className="gc-small">
            Learn more:&nbsp;
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API"
              target="_blank"
              rel="noreferrer"
            >
              File System Access API (MDN)
            </a>
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
