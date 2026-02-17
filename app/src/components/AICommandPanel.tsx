import { type ChangeEvent, useEffect, useRef, useState } from 'react'

type AICommandPanelProps = {
  disabled: boolean
  onSubmit: (command: string) => Promise<unknown>
  onIngestTextLines?: (lines: string[]) => Promise<void>
}

type SpeechRecognitionEventLike = {
  resultIndex?: number
  results: ArrayLike<
    ArrayLike<{
      transcript?: string
    }> & {
      isFinal?: boolean
    }
  >
}

type SpeechRecognitionInstanceLike = {
  start: () => void
  stop: () => void
  abort?: () => void
  continuous: boolean
  interimResults: boolean
  lang?: string
  maxAlternatives?: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionInstanceLike

const getSpeechRecognitionCtor = (): SpeechRecognitionConstructorLike | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructorLike
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike
  }

  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null
}

const toVoiceErrorMessage = (errorCode?: string): string => {
  if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
    return 'Microphone permission denied. Enable microphone access and try again.'
  }

  if (errorCode === 'audio-capture') {
    return 'No microphone detected. Connect a microphone and try again.'
  }

  if (errorCode === 'no-speech') {
    return 'No speech detected. Try again and speak clearly.'
  }

  if (errorCode === 'network') {
    return 'Voice recognition network error. Check connection and retry.'
  }

  return `Voice input error: ${errorCode || 'unknown error'}`
}

const quickActions = [
  { label: 'SWOT', prompt: 'Create a SWOT template with four quadrants', icon: '⊞' },
  { label: 'Retro', prompt: 'Create a retrospective template with columns', icon: '▦' },
  { label: 'Organize', prompt: 'Organize this board into groups', icon: '⊗' },
  { label: 'Summarize', prompt: 'Summarize all sticky notes into themes', icon: '≣' },
]

export const AICommandPanel = ({ disabled, onSubmit, onIngestTextLines }: AICommandPanelProps) => {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null)
  const stoppingVoiceRef = useRef(false)
  const heardFinalSpeechRef = useRef(false)
  const heardAnySpeechRef = useRef(false)
  const latestTranscriptRef = useRef('')
  const voiceErrorCodeRef = useRef<string | null>(null)
  const voiceSupported = Boolean(getSpeechRecognitionCtor())

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        stoppingVoiceRef.current = true
        recognitionRef.current.stop()
        recognitionRef.current.abort?.()
      }
    }
  }, [])

  const handleSubmit = async () => {
    const trimmed = command.trim()
    if (!trimmed || disabled) {
      return
    }

    if (isListening && recognitionRef.current) {
      stoppingVoiceRef.current = true
      recognitionRef.current.stop()
      setIsListening(false)
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
      stoppingVoiceRef.current = true
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognitionCtor = getSpeechRecognitionCtor()

    if (!SpeechRecognitionCtor) {
      setStatus('error')
      setMessage('Voice input is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognitionCtor()

    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1
    stoppingVoiceRef.current = false
    heardFinalSpeechRef.current = false
    heardAnySpeechRef.current = false
    latestTranscriptRef.current = ''
    voiceErrorCodeRef.current = null

    recognition.onresult = (event) => {
      let finalFragments = ''
      let interimFragments = ''
      const startIndex = Number.isFinite(event.resultIndex) ? Number(event.resultIndex) : 0

      for (let i = startIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const transcript = String(result?.[0]?.transcript || '').trim()
        if (!transcript) {
          continue
        }

        if (result?.isFinal) {
          finalFragments = `${finalFragments} ${transcript}`.trim()
        } else {
          interimFragments = `${interimFragments} ${transcript}`.trim()
        }
      }

      if (finalFragments) {
        heardFinalSpeechRef.current = true
        heardAnySpeechRef.current = true
        latestTranscriptRef.current = finalFragments
        setCommand((prev) => (prev ? `${prev} ${finalFragments}`.trim() : finalFragments))
        setStatus('success')
        setMessage('Voice captured. Review and press Send Command.')
      } else if (interimFragments) {
        heardAnySpeechRef.current = true
        latestTranscriptRef.current = interimFragments
        setStatus('idle')
        setMessage(`Listening: ${interimFragments}`)
      }
    }
    recognition.onerror = (event) => {
      const errorCode = String(event.error || '')
      voiceErrorCodeRef.current = errorCode || null
      if (errorCode === 'no-speech') {
        return
      }
      setStatus('error')
      setMessage(toVoiceErrorMessage(errorCode))
      setIsListening(false)
      recognitionRef.current = null
      stoppingVoiceRef.current = false
    }
    recognition.onend = () => {
      const stoppedManually = stoppingVoiceRef.current
      const fallbackTranscript = latestTranscriptRef.current.trim()
      const voiceErrorCode = voiceErrorCodeRef.current
      stoppingVoiceRef.current = false
      setIsListening(false)
      recognitionRef.current = null
      voiceErrorCodeRef.current = null

      if (stoppedManually) {
        if (!heardFinalSpeechRef.current && fallbackTranscript) {
          setCommand((prev) => (prev ? `${prev} ${fallbackTranscript}`.trim() : fallbackTranscript))
          setStatus('success')
          setMessage('Voice captured. Review and press Send Command.')
        } else if (!heardFinalSpeechRef.current) {
          setStatus('idle')
          setMessage('Voice input stopped.')
        }
        return
      }

      if (!heardFinalSpeechRef.current && fallbackTranscript) {
        setCommand((prev) => (prev ? `${prev} ${fallbackTranscript}`.trim() : fallbackTranscript))
        setStatus('success')
        setMessage('Voice captured. Review and press Send Command.')
        return
      }

      if (!heardFinalSpeechRef.current && heardAnySpeechRef.current) {
        setStatus('success')
        setMessage('Voice captured. Review and press Send Command.')
        return
      }

      if (!heardFinalSpeechRef.current && voiceErrorCode) {
        setStatus('error')
        setMessage(toVoiceErrorMessage(voiceErrorCode))
        return
      }

      if (!heardFinalSpeechRef.current) {
        setStatus('error')
        setMessage('No speech detected. Try again and speak clearly.')
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setIsListening(true)
      setStatus('idle')
      setMessage('Listening…')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Failed to start voice input')
      setIsListening(false)
      recognitionRef.current = null
      stoppingVoiceRef.current = false
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
        <span className={`status-pill ${status}`}>{status}</span>
      </div>

      <textarea
        className="ai-input"
        placeholder="Describe what you want to create or ask me to organize your board..."
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
          className={`button ${isListening ? 'button-primary' : 'button-secondary'}`}
          onClick={toggleVoiceInput}
          disabled={disabled || !voiceSupported}
          aria-pressed={isListening}
          title={voiceSupported ? 'Start or stop microphone input' : 'Voice input is not supported in this browser'}
        >
          {isListening ? (
            <>
              <span className="mic-active">●</span>
              Listening...
            </>
          ) : (
            <>
              <span className="mic-icon">🎤</span>
              Voice Input
            </>
          )}
        </button>

        <label
          className={`button button-secondary upload-label ${disabled || ocrRunning ? 'disabled' : ''}`}
        >
          {ocrRunning ? (
            <>
              <span className="spinner">○</span>
              Processing...
            </>
          ) : (
            <>
              <span>📷</span>
              Import Screenshot
            </>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => void handleImageUpload(event)}
            disabled={disabled || ocrRunning || !onIngestTextLines}
          />
        </label>
      </div>

      <button
        type="button"
        className="button button-primary"
        onClick={() => void handleSubmit()}
        disabled={disabled || !command.trim()}
      >
        Send Command
      </button>

      {message && (
        <div className={`ai-message ${status}`}>
          <span className="message-icon">
            {status === 'success' ? '✓' : status === 'error' ? '✕' : '○'}
          </span>
          {message}
        </div>
      )}

      <p className="panel-note">
        <strong>Tip:</strong> Try commands like "Create 5 yellow stickies in a circle" or "Organize by color"
      </p>
    </aside>
  )
}
