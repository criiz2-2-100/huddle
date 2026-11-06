const hasWindow = typeof window !== 'undefined'
export const speakSupported = hasWindow && 'speechSynthesis' in window

const PREFERRED_VOICES = [
  'Samantha (Enhanced)',
  'Ava (Premium)',
  'Zoe (Premium)',
  'Samantha',
  'Karen',
  'Google US English',
]

function pickVoice() {
  if (!speakSupported) return null
  const voices = window.speechSynthesis.getVoices()
  for (const name of PREFERRED_VOICES) {
    const match = voices.find((voice) => voice.name === name)
    if (match) return match
  }
  return voices.find((voice) => voice.lang?.startsWith('en')) || null
}

function stripForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_200)
}

/** Read a reply aloud. Cancels whatever was already speaking. */
export function speak(text, { pitch = 1, rate = 1, onState = () => {}, interrupt = true } = {}) {
  if (!speakSupported || !text) return
  const clean = stripForSpeech(text)
  if (!clean) return
  if (interrupt) window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  const voice = pickVoice()
  if (voice) utterance.voice = voice
  utterance.lang = 'en-US'
  utterance.pitch = pitch
  utterance.rate = rate
  utterance.onstart = () => onState(true)
  utterance.onend = () => onState(false)
  utterance.onerror = () => onState(false)
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (speakSupported) window.speechSynthesis.cancel()
}

const Recognition = hasWindow ? window.SpeechRecognition || window.webkitSpeechRecognition : null
export const listenSupported = Boolean(Recognition)

/**
 * Dictate one phrase into the composer. Returns a stop function.
 * Browser speech recognition may use the platform's online service.
 */
export function listen({ onResult, onEnd = () => {}, onError = () => {} } = {}) {
  if (!Recognition) return () => {}
  const recognition = new Recognition()
  recognition.lang = 'en-US'
  recognition.continuous = false
  recognition.interimResults = false

  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    onEnd()
  }

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || [])
      .map((result) => result[0]?.transcript || '')
      .join(' ')
      .trim()
    if (transcript) onResult(transcript)
  }
  recognition.onerror = (event) => {
    onError(
      event.error === 'not-allowed'
        ? 'Microphone access was blocked.'
        : `Dictation stopped (${event.error || 'unknown error'}).`,
    )
    finish()
  }
  recognition.onend = finish

  try {
    recognition.start()
  } catch {
    onError('Dictation could not start.')
    finish()
  }

  return () => {
    try {
      recognition.stop()
    } catch {
      /* already stopped */
    }
  }
}
