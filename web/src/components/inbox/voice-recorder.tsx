import { useEffect, useRef, useState } from 'react'
import { Mic, Square, X } from 'lucide-react'
import type { MediaFile } from '@/api/types'
import { inboxApi } from '@/api/endpoints/inbox'

/** Only offer codecs the existing provider upload path actually accepts. */
export function VoiceRecorder({
  onAdd,
  disabled,
  onBusy,
}: {
  onAdd: (file: MediaFile) => void
  disabled: boolean
  onBusy: (busy: boolean) => void
}) {
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const operation = useRef(0)
  const mounted = useRef(true)
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'preview' | 'uploading'>(
    'idle',
  )
  const [recording, setRecording] = useState<Blob | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!recording) return
    const value = URL.createObjectURL(recording)
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [recording])
  useEffect(() => {
    if (state !== 'recording') return
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [state])
  useEffect(() => {
    mounted.current = true
    const generation = operation
    return () => {
      mounted.current = false
      onBusy(false)
      generation.current++
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [onBusy])
  const reset = () => {
    setRecording(null)
    setState('idle')
    onBusy(false)
  }
  const start = async () => {
    setError('')
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording is unavailable here. Attach an audio file instead.')
      return
    }
    const mimeType = ['audio/mp4', 'audio/ogg;codecs=opus'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    )
    if (!mimeType) {
      setError('This browser cannot record a supported audio format. Attach an audio file instead.')
      return
    }
    const token = ++operation.current
    let acquired: MediaStream | null = null
    try {
      setState('requesting')
      onBusy(true)
      acquired = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current || token !== operation.current) {
        acquired.getTracks().forEach((track) => track.stop())
        return
      }
      const captureStream = acquired
      stream.current = captureStream
      const parts: BlobPart[] = []
      const capture = new MediaRecorder(captureStream, { mimeType })
      recorder.current = capture
      capture.ondataavailable = (event) => {
        if (event.data.size) parts.push(event.data)
      }
      capture.onstop = () => {
        captureStream.getTracks().forEach((track) => track.stop())
        if (!mounted.current || token !== operation.current) return
        const audio = new Blob(parts, { type: mimeType.split(';')[0] })
        if (audio.size > 10 * 1024 * 1024) {
          setError('Recording exceeds 10 MB. Make a shorter recording.')
          reset()
          return
        }
        setRecording(audio)
        setState('preview')
      }
      capture.onerror = () => {
        captureStream.getTracks().forEach((track) => track.stop())
        if (mounted.current && token === operation.current) {
          setError('Recording failed. Please try again.')
          reset()
        }
      }
      capture.start()
      setSeconds(0)
      setState('recording')
    } catch {
      acquired?.getTracks().forEach((track) => track.stop())
      if (mounted.current && token === operation.current) {
        setError('Microphone access is unavailable. Allow access or attach an audio file.')
        reset()
      }
    }
  }

  return (
    <div className="text-sm">
      {state === 'idle' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void start()}
          className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-text-secondary disabled:opacity-40"
        >
          <Mic className="h-4 w-4" />
          Record audio
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-raised p-2">
          {state === 'requesting' && <span role="status">Waiting for microphone access…</span>}
          {state === 'recording' ? (
            <>
              <span role="status" className="text-danger">
                Recording · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </span>
              <button
                type="button"
                aria-label="Stop recording"
                className="flex h-11 w-11 items-center justify-center"
                onClick={() => recorder.current?.stop()}
              >
                <Square className="h-4 w-4" />
              </button>
            </>
          ) : (
            url && (
              <audio aria-label="Preview recording" controls src={url} className="max-w-full" />
            )
          )}
          <button
            type="button"
            disabled={state === 'uploading'}
            aria-label="Discard recording"
            className="flex h-11 w-11 items-center justify-center"
            onClick={() => {
              operation.current++
              if (recorder.current?.state === 'recording') recorder.current.stop()
              reset()
            }}
          >
            <X className="h-4 w-4" />
          </button>
          {state === 'preview' && (
            <button
              type="button"
              className="min-h-11 rounded-xl bg-accent px-3 text-accent-fg"
              onClick={() => {
                if (!recording) return
                setState('uploading')
                const token = ++operation.current
                void inboxApi
                  .uploadMedia(
                    new File(
                      [recording],
                      recording.type === 'audio/mp4' ? 'recording.m4a' : 'recording.ogg',
                      { type: recording.type },
                    ),
                  )
                  .then((file) => {
                    if (!file) throw new Error('No upload returned')
                    if (mounted.current && token === operation.current) {
                      onAdd(file)
                      reset()
                    } else {
                      void inboxApi.deleteMedia(file.id).catch(() => {})
                    }
                  })
                  .catch(() => {
                    if (mounted.current && token === operation.current) {
                      setError('Upload failed. Your recording is still here.')
                      setState('preview')
                    }
                  })
              }}
            >
              Attach recording
            </button>
          )}
          {state === 'uploading' && <span role="status">Uploading…</span>}
        </div>
      )}
      {error && (
        <p role="alert" className="py-1 text-warning">
          {error}
        </p>
      )}
    </div>
  )
}
