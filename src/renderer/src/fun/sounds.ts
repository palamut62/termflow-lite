import type { SoundTheme } from '../../../shared/types'

/**
 * İsteğe bağlı klavye/zil sesleri. Ses dosyası yok: her ses WebAudio ile
 * birkaç milisaniyelik sentezlenmiş bir darbe. Varsayılan kapalı.
 */
type Cue = 'key' | 'enter' | 'bell' | 'error'

let ctx: AudioContext | null = null
let lastKeyAt = 0
const KEY_GAP_MS = 22

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Kısa gürültü darbesi (mekanik tuş). */
function click(ac: AudioContext, freq: number, gain: number, decay: number): void {
  const length = Math.ceil(ac.sampleRate * decay)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq * (0.92 + Math.random() * 0.16)
  filter.Q.value = 1.4
  const amp = ac.createGain()
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(ac.destination)
  src.start()
}

/** Yumuşak sinüs tonu (zil / soft tema). */
function tone(ac: AudioContext, freq: number, gain: number, duration: number, endFreq = freq): void {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  const now = ac.currentTime
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, now)
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration)
  amp.gain.setValueAtTime(gain, now)
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(amp).connect(ac.destination)
  osc.start(now)
  osc.stop(now + duration)
}

export function playCue(theme: SoundTheme, cue: Cue): void {
  if (theme === 'off') return
  if (cue === 'key') {
    const now = performance.now()
    if (now - lastKeyAt < KEY_GAP_MS) return
    lastKeyAt = now
  }
  const ac = audio()
  if (!ac) return
  if (theme === 'mechanical') {
    if (cue === 'key') click(ac, 3200, 0.22, 0.018)
    else if (cue === 'enter') { click(ac, 1400, 0.35, 0.035); click(ac, 3000, 0.12, 0.012) }
    else if (cue === 'bell') tone(ac, 880, 0.08, 0.25, 660)
    else tone(ac, 220, 0.08, 0.18, 150)
    return
  }
  if (cue === 'key') tone(ac, 1500, 0.025, 0.03)
  else if (cue === 'enter') tone(ac, 900, 0.04, 0.06, 700)
  else if (cue === 'bell') tone(ac, 1046, 0.06, 0.35, 1046)
  else tone(ac, 330, 0.05, 0.2, 220)
}
