/**
 * 轻量 Web Audio 音效。
 *
 * 不加载音频文件：用正弦/三角波 + 低通 + 短包络合成，
 * 音量压得比较低，避免在浴室里突然刺耳。
 */

type OscType = OscillatorType

let audio: AudioContext | null = null
let master: GainNode | null = null

type AudioSessionLike = { type?: string }

/** iOS：把 Web Audio 归到“媒体播放”会话，静音键打开时也能出声 */
function setPlaybackSession() {
  try {
    const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
    if (session) session.type = 'playback'
  } catch {
    // 老版本 Safari 没有 AudioSession，只能遵守静音键
  }
}

function engine(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (audio && audio.state === 'closed') {
    audio = null
    master = null
  }
  if (!audio) {
    audio = new Ctor()
    master = audio.createGain()
    master.gain.value = 1
    const compressor = audio.createDynamicsCompressor()
    compressor.threshold.value = -12
    compressor.knee.value = 18
    compressor.ratio.value = 6
    compressor.attack.value = 0.003
    compressor.release.value = 0.25
    master.connect(compressor)
    compressor.connect(audio.destination)
  }
  return audio
}

/** 销毁旧上下文并重建；iOS 从息屏/后台回来后 suspended 的 context 经常再也 resume 不回来 */
async function recreateContext(): Promise<AudioContext | null> {
  if (audio) {
    try {
      await audio.close()
    } catch {
      // ignore
    }
  }
  audio = null
  master = null
  return engine()
}

async function ensureRunning(): Promise<AudioContext | null> {
  let ctx = engine()
  if (!ctx) return null
  setPlaybackSession()
  if (ctx.state === 'running') return ctx
  try {
    await ctx.resume()
  } catch {
    // fall through
  }
  if ((ctx.state as string) === 'running') return ctx

  ctx = await recreateContext()
  if (!ctx) return null
  setPlaybackSession()
  try {
    await ctx.resume()
  } catch {
    return null
  }
  return ctx.state === 'running' ? ctx : null
}

/* ───────── HTMLAudio fallback：AudioContext 被 iOS 杀掉时尽量还能出声 ───────── */

type MediaSound = 'close' | 'open' | 'tick' | 'finish' | 'silent'
const mediaCache = new Map<MediaSound, HTMLAudioElement>()
let mediaUnlocked = false

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

function waveUrl(duration: number, sampleAt: (t: number) => number): string {
  const rate = 22050
  const count = Math.max(1, Math.floor(rate * duration))
  const buffer = new ArrayBuffer(44 + count * 2)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + count * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, count * 2, true)
  for (let i = 0; i < count; i += 1) {
    const sound = Math.max(-1, Math.min(1, sampleAt(i / rate)))
    view.setInt16(44 + i * 2, Math.round(sound * 32767), true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

function mediaSource(sound: MediaSound): string {
  if (sound === 'silent') {
    return waveUrl(0.05, () => 0)
  }
  if (sound === 'tick') {
    return waveUrl(0.055, (t) => Math.sin(2 * Math.PI * 1046.5 * t) * Math.exp(-t * 70) * 0.4)
  }
  if (sound === 'open') {
    return waveUrl(0.32, (t) => {
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 3.6)
      return (
        (Math.sin(2 * Math.PI * (523.25 + 440 * t) * t) * 0.5 +
          Math.sin(2 * Math.PI * 783.99 * t) * 0.22) *
        env *
        0.7
      )
    })
  }
  if (sound === 'finish') {
    return waveUrl(0.9, (t) => {
      const notes = [523.25, 659.25, 783.99]
      let value = 0
      notes.forEach((freq, index) => {
        const start = index * 0.14
        if (t >= start && t < start + 0.22) {
          const local = t - start
          value +=
            Math.sin(2 * Math.PI * freq * local) *
            Math.min(1, local / 0.012) *
            Math.exp(-local * 7) *
            0.5
        }
      })
      if (t >= 0.44) {
        const local = t - 0.44
        value += Math.sin(2 * Math.PI * 1046.5 * local) * Math.exp(-local * 3) * 0.28
      }
      return value * 0.8
    })
  }
  return waveUrl(0.72, (t) => {
    let value = 0
    if (t < 0.24) {
      value += Math.sin(2 * Math.PI * 783.99 * t) * Math.exp(-t * 8) * 0.6
    }
    if (t >= 0.23) {
      const low = t - 0.23
      value += Math.sin(2 * Math.PI * (196 - 100 * low) * low) * Math.exp(-low * 2.4) * 0.75
      value += Math.sin(2 * Math.PI * 98 * low) * Math.exp(-low * 2.2) * 0.3
    }
    return value * 0.9
  })
}

function mediaElement(sound: MediaSound): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  let element = mediaCache.get(sound)
  if (!element) {
    element = new Audio(mediaSource(sound))
    element.preload = 'auto'
    element.setAttribute('playsinline', '')
    element.style.display = 'none'
    document.body.appendChild(element)
    mediaCache.set(sound, element)
  }
  return element
}

function playMedia(sound: MediaSound) {
  const element = mediaElement(sound)
  if (!element) return
  try {
    element.currentTime = 0
    element.volume = sound === 'silent' ? 0.001 : 1
    void element.play().catch(() => {})
  } catch {
    // ignore
  }
}

function unlockMedia() {
  if (mediaUnlocked) return
  mediaUnlocked = true
  const element = mediaElement('silent')
  if (!element) return
  try {
    element.volume = 0.001
    void element
      .play()
      .then(() => element.pause())
      .catch(() => {
        mediaUnlocked = false
      })
  } catch {
    // ignore
  }
}

/** 在用户手势里调用一次，解锁 iOS 的 AudioContext */
export function primeSounds() {
  setPlaybackSession()
  unlockMedia()
  void ensureRunning()
}

interface ToneOptions {
  type?: OscType
  gain?: number
  endFreq?: number
  filter?: number
  attack?: number
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  options: ToneOptions = {},
) {
  const {
    type = 'sine',
    gain = 0.025,
    endFreq,
    filter = 2400,
    attack = 0.012,
  } = options
  if (!master) return

  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = filter
  lowpass.Q.value = 0.4

  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration)
  }

  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + attack)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(lowpass)
  lowpass.connect(amp)
  amp.connect(master)
  osc.start(start)
  osc.stop(start + duration + 0.03)
}

function play(notes: (ctx: AudioContext, at: number) => void, fallback: MediaSound) {
  void (async () => {
    const ctx = await ensureRunning()
    if (!ctx) {
      playMedia(fallback)
      return
    }
    notes(ctx, ctx.currentTime + 0.025)
  })()
}

/** 关水：低频、短促、下沉 */
export function playCloseSound() {
  play((ctx, at) => {
    // 先高后低：第一声高音提示，第二声低音收尾
    tone(ctx, 783.99, at, 0.24, { type: 'sine', gain: 0.16, filter: 2600 })
    tone(ctx, 659.25, at + 0.012, 0.2, { type: 'triangle', gain: 0.07, filter: 2200 })
    tone(ctx, 196, at + 0.23, 0.48, { type: 'sine', gain: 0.2, endFreq: 130, filter: 680 })
    tone(ctx, 98, at + 0.25, 0.5, { type: 'triangle', gain: 0.09, filter: 430 })
    tone(ctx, 392, at + 0.24, 0.28, { type: 'sine', gain: 0.05, filter: 1100 })
  }, 'close')
}

/** 开水：高频、轻快、上扬 */
export function playOpenSound() {
  play((ctx, at) => {
    tone(ctx, 523.25, at, 0.3, { type: 'sine', gain: 0.12, endFreq: 659.25, filter: 2600 })
    tone(ctx, 783.99, at + 0.06, 0.3, { type: 'triangle', gain: 0.075, filter: 3400 })
    tone(ctx, 1046.5, at + 0.1, 0.22, { type: 'sine', gain: 0.05, filter: 4200 })
    tone(ctx, 659.25, at + 0.2, 0.24, { type: 'sine', gain: 0.04, filter: 3000 })
  }, 'open')
}

/** 倒计时整秒：很轻的木质短音，不抢注意力 */
export function playTickSound() {
  play((ctx, at) => {
    tone(ctx, 1046.5, at, 0.045, { type: 'sine', gain: 0.04, filter: 3600, attack: 0.004 })
    tone(ctx, 1568, at + 0.004, 0.03, { type: 'triangle', gain: 0.022, filter: 4200, attack: 0.003 })
  }, 'tick')
}

/** 最终结束：三连音向上 */
export function playFinishSound() {
  play((ctx, at) => {
    const notes = [523.25, 659.25, 783.99]
    notes.forEach((freq, index) => {
      const start = at + index * 0.14
      tone(ctx, freq, start, 0.2, { type: 'sine', gain: 0.08, filter: 2800 })
      tone(ctx, freq * 2, start + 0.005, 0.16, { type: 'triangle', gain: 0.022, filter: 4200 })
    })
    tone(ctx, 1046.5, at + 0.44, 0.34, { type: 'sine', gain: 0.05, filter: 3600 })
    tone(ctx, 523.25, at + 0.44, 0.4, { type: 'sine', gain: 0.035, filter: 2000 })
  }, 'finish')
}


/** 扫码手动开阀：高 → 低 → 更高，和结束的三连音区分 */
export function playScanOpenSound() {
  play((ctx, at) => {
    const notes = [783.99, 523.25, 880]
    notes.forEach((freq, index) => {
      const start = at + index * 0.12
      tone(ctx, freq, start, 0.18, { type: 'sine', gain: 0.07, filter: 3000 })
      tone(ctx, freq * 2, start + 0.004, 0.12, { type: 'triangle', gain: 0.007, filter: 4400 })
    })
  }, 'open')
}
