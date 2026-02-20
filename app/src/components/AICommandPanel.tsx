import { type ChangeEvent, useRef, useState } from 'react'
import { ImageUp, LoaderCircle } from 'lucide-react'

type AICommandPanelProps = {
  disabled: boolean
  onSubmit: (command: string) => Promise<unknown>
  onIngestTextLines?: (lines: string[]) => Promise<void>
  history?: AICommandHistoryItem[]
}

type AICommandHistoryItem = {
  id: string
  command: string
  status: 'queued' | 'running' | 'success' | 'error'
  queuedAt?: number
  completedAt?: number
  error?: string
}

const quickActions = [
  { label: 'SWOT', prompt: 'Create a SWOT template with four quadrants', icon: '⊞' },
  { label: 'Retro', prompt: 'Create a retrospective template with columns', icon: '▦' },
  { label: 'Organize', prompt: 'Organize this board into groups', icon: '⊗' },
  { label: 'Summarize', prompt: 'Summarize all sticky notes into themes', icon: '≣' },
]

const formatHistoryTime = (queuedAt?: number, completedAt?: number) => {
  const timestamp = completedAt ?? queuedAt
  if (!timestamp) {
    return ''
  }
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const AICommandPanel = ({ disabled, onSubmit, onIngestTextLines, history = [] }: AICommandPanelProps) => {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [ocrRunning, setOcrRunning] = useState(false)
  const screenshotInputRef = useRef<HTMLInputElement | null>(null)

  const handleSubmit = async () => {
    const trimmed = command.trim()
    if (!trimmed || disabled) {
      return
    }

    setStatus('running')
    try {
      const submitResult = await onSubmit(trimmed)
      const successMessage =
        typeof submitResult === 'string' && submitResult.trim()
          ? submitResult.trim()
          : submitResult &&
              typeof submitResult === 'object' &&
              'message' in submitResult &&
              typeof submitResult.message === 'string' &&
              submitResult.message.trim()
            ? submitResult.message.trim()
            : 'Command executed and synced to the board.'
      setStatus('success')
      setMessage(successMessage)
      setCommand('')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Failed to submit command')
    }
  }

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || disabled || !onIngestTextLines) {
      return
    }

    setOcrRunning(true)
    setStatus('running')
    try {
      const { recognize } = (await import('tesseract.js')) as unknown as {
        recognize: (image: Blob, lang: string) => Promise<{ data?: { text?: string } }>
      }

      const result = await recognize(file, 'eng')
      const lines = String(result?.data?.text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 2)
        .slice(0, 40)

      if (lines.length === 0) {
        throw new Error('No readable text found in image')
      }

      await onIngestTextLines(lines)
      setStatus('success')
      setMessage(`Extracted ${lines.length} lines from screenshot and added sticky notes.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Failed to process image')
    } finally {
      setOcrRunning(false)
      event.target.value = ''
    }
  }

  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <h3>AI Assistant</h3>
        <span className={`status-pill ${status}`} role="status" aria-live="polite" data-testid="ai-status-pill">
          {status}
        </span>
      </div>

      <textarea
        className="ai-input"
        placeholder="Describe what you want to create or ask me to organize your board..."
        aria-label="AI command input"
        value={command}
        onChange={(event) => setCommand(event.target.value)}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
      />

      <div className="ai-quick-actions">
        {quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="button-ghost"
            onClick={() => setCommand(action.prompt)}
            disabled={disabled}
            title={action.prompt}
          >
            <span className="quick-action-icon">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>

      <div className="ai-tools-row">
        <button
          type="button"
          className="button-icon ai-tool-icon-button"
          onClick={() => screenshotInputRef.current?.click()}
          disabled={disabled || ocrRunning || !onIngestTextLines}
          aria-label="Import screenshot"
          title={ocrRunning ? 'Processing screenshot...' : 'Import screenshot'}
        >
          {ocrRunning ? <LoaderCircle className="spinner" size={16} /> : <ImageUp size={16} />}
        </button>
        <input
          ref={screenshotInputRef}
          type="file"
          accept="image/*"
          aria-label="Import screenshot"
          onChange={(event) => void handleImageUpload(event)}
          disabled={disabled || ocrRunning || !onIngestTextLines}
          className="ai-upload-input"
        />
      </div>

      <button
        type="button"
        className="button button-primary send-command-button"
        onClick={() => void handleSubmit()}
        disabled={disabled || !command.trim()}
      >
        Send Command
      </button>

      {message && (
        <div className={`ai-message ${status}`}>
          <span className="message-icon">{status === 'success' ? '✓' : status === 'error' ? '✕' : '○'}</span>
          {message}
        </div>
      )}

      <section className="ai-history" data-testid="ai-command-history">
        <div className="ai-history-header">
          <h4>Command History</h4>
          <span className="value-badge">{history.length}</span>
        </div>
        {history.length === 0 ? <p className="panel-note">No commands yet.</p> : null}
        <div className="ai-history-list">
          {history.slice(0, 12).map((item) => (
            <article key={item.id} className="ai-history-item" data-testid={`ai-history-item-${item.id}`}>
              <div className="ai-history-row">
                <span className={`status-pill ${item.status}`}>{item.status}</span>
                <span className="ai-history-time">{formatHistoryTime(item.queuedAt, item.completedAt)}</span>
              </div>
              <p>{item.command}</p>
              {item.error ? <p className="error-text">{item.error}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <p className="panel-note">
        <strong>Tip:</strong> Try commands like "Create 5 yellow stickies in a circle" or "Organize by color"
      </p>
    </aside>
  )
}
