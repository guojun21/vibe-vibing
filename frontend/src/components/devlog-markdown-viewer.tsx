import { useCallback, useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface DevLogFile {
  name: string
  path: string
}

function Sidebar({
  files,
  selected,
  onSelect,
}: {
  files: DevLogFile[]
  selected: string | null
  onSelect: (path: string) => void
}) {
  return (
    <nav className="devlog-sidebar">
      <div className="devlog-sidebar-header">
        <a href="/" className="devlog-back-link">&larr; Back</a>
        <h2>Dev Log</h2>
      </div>
      <ul className="devlog-file-list">
        {files.map((f) => (
          <li key={f.path}>
            <button
              className={`devlog-file-btn ${selected === f.path ? 'active' : ''}`}
              onClick={() => onSelect(f.path)}
            >
              <span className="devlog-file-icon">&#128196;</span>
              {f.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function MarkdownContent({ content, loading }: { content: string; loading: boolean }) {
  if (loading) {
    return (
      <div className="devlog-loading">
        <div className="devlog-spinner" />
        <span>Loading...</span>
      </div>
    )
  }
  if (!content) {
    return (
      <div className="devlog-empty">
        <p>Select a file from the sidebar to view.</p>
      </div>
    )
  }
  return (
    <article className="devlog-article">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </Markdown>
    </article>
  )
}

export default function DevLogApp() {
  const [files, setFiles] = useState<DevLogFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/devlog/files')
      .then((r) => r.json())
      .then((data: { files: DevLogFile[] }) => {
        setFiles(data.files)
        if (data.files.length > 0) {
          setSelected(data.files[0].path)
        }
      })
      .catch((err) => setError(`Failed to load file list: ${err.message}`))
  }, [])

  const loadFile = useCallback(async (filePath: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/devlog/content?path=${encodeURIComponent(filePath)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setContent(data.content)
    } catch (err: any) {
      setError(`Failed to load file: ${err.message}`)
      setContent('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selected) loadFile(selected)
  }, [selected, loadFile])

  return (
    <div className="devlog-root">
      <Sidebar files={files} selected={selected} onSelect={setSelected} />
      <main className="devlog-main">
        {error && <div className="devlog-error">{error}</div>}
        <MarkdownContent content={content} loading={loading} />
      </main>
    </div>
  )
}
