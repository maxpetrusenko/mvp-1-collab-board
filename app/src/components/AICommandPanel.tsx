import { type ChangeEvent, useEffect, useRef, useState } from 'react'

type AICommandPanelProps = {
  disabled: boolean
  onSubmit: (command: string) => Promise<unknown>
  onIngestTextLines?: (lines: string[]) => Promise<void>
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

export const AICommandPanel = ({ disabled, onSubmit, onIngestTextLines }: AICommandPanelProps) => {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  const recognitionRef = useRef<
    | {
        start: () => void
        stop: () => void
        continuous: boolean
        interimResults: boolean
        onresult: ((event: SpeechRecognitionEventLike) => void) | null
        onerror: ((event: { error?: string }) => void) | null
        onend: (() => void) | null
      }
    | null
  >(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const handleSubmit = async () => {
    const trimmed = command.trim()
    if (!trimmed || disabled) {
      return
    }

    setStatus('running')
    try {
      await onSubmit(trimmed)
      setStatus('success')
      setMessage('Command executed and synced to the board.')
      setCommand('')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Failed to submit command')
    }
  }

  const toggleVoiceInput = () => {
    if (disabled) {
      return
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognitionCtor =
      (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      setStatus('error')
      setMessage('Voice input is not supported in this browser.')
      return
    }

    const recognition = new (SpeechRecognitionCtor as new () => {
      start: () => void
      stop: () => void
      continuous: boolean
      interimResults: boolean
      onresult: ((event: SpeechRecognitionEventLike) => void) | null
      onerror: ((event: { error?: string }) => void) | null
      onend: (() => void) | null
    })()

    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const fragments: string[] = []
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result?.[0]?.transcript) {
          fragments.push(result[0].transcript.trim())
        }
      }

      const transcript = fragments.join(' ').trim()
      if (!transcript) {
        return
      }

      setCommand((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onerror = (event) => {
      setStatus('error')
      setMessage(`Voice input error: ${event.error || 'unknown error'}`)
      setIsListening(false)
    }
    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
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
        <h3>AI Command Panel</h3>
        <span className={`status-pill ${status}`}>{status}</span>
      </div>
      <textarea
        className="ai-input"
        placeholder="Create a SWOT template with four quadrants"
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
      <div className="ai-tools-row">
        <button type="button" className="secondary-button" onClick={toggleVoiceInput} disabled={disabled}>
          {isListening ? 'Stop Voice' : 'Voice Input'}
        </button>
        <label className={`secondary-button upload-label ${disabled || ocrRunning ? 'disabled' : ''}`}>
          {ocrRunning ? 'OCR Running…' : 'Import Screenshot'}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => void handleImageUpload(event)}
            disabled={disabled || ocrRunning || !onIngestTextLines}
          />
        </label>
      </div>
      <button type="button" className="primary-button" onClick={() => void handleSubmit()} disabled={disabled}>
        Send Command
      </button>
      {message && <p className="panel-note">{message}</p>}
      <p className="panel-note">AI commands are dispatched through the backend tool executor.</p>
    </aside>
  )
}
