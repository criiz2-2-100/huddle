<template>
  <Teleport to="body">
    <div class="roam" role="dialog" aria-modal="true" aria-label="Robo free roam">
      <header class="roam-head">
        <div class="roam-title">
          <p class="mono kicker">UNIT 2·2·100 · FREE ROAM</p>
          <h2>{{ roomName || 'The floor' }}</h2>
        </div>
        <div class="roam-meta mono">
          <span class="live-dot" :class="{ on: running || freeRunning }"></span>
          {{ freeRunning ? 'FREE TALK LIVE' : running ? 'HUDDLE LIVE' : 'OFF THE CLOCK' }}
          <span class="divider">/</span>
          {{ activeIds.length }} ON DECK
        </div>
        <div class="roam-actions">
          <button
            class="roam-talk mono"
            :class="{ on: freeRunning, busy: running && !freeRunning }"
            :disabled="!freeRunning && (running || activeIds.length < 2)"
            :title="freeTalkTitle"
            @click="freeRunning ? $emit('stop') : $emit('free')"
          >
            <span class="talk-dot" aria-hidden="true"></span>{{ freeTalkLabel }}
          </button>
          <button
            ref="closeBtn"
            class="roam-close"
            title="Return to the roundtable"
            @click="$emit('close')"
          >
            <span class="x" aria-hidden="true">×</span>
            <span class="close-label">RETURN</span>
          </button>
        </div>
      </header>

      <div class="roam-floor">
        <div class="roam-grid" aria-hidden="true"></div>
        <div class="roam-watermark mono" aria-hidden="true">2·2·100</div>

        <button
          v-for="(robo, index) in robos"
          :key="robo.id"
          class="roamer"
          :class="{
            off: !activeIds.includes(robo.id),
            speaking: speakerId === robo.id,
          }"
          :style="roamerStyle(robo)"
          :title="`${robo.name} · ${robo.role}\nClick to swap · Double-click for a 1:1`"
          @click="$emit('toggle', robo.id)"
          @dblclick="$emit('solo', robo.id)"
        >
          <div v-if="speakerId === robo.id" class="bubble" :class="bubbleSide(robo)">
            <span class="bubble-name mono" :style="{ color: robo.color }">{{ robo.name }}</span>
            <span class="bubble-text">{{ caption }}</span>
          </div>

          <div class="avatar">
            <RoboAvatar
              :glyph="robo.glyph"
              :color="robo.color"
              :state="stateFor(robo.id)"
              :size="roamSize"
              :seed="index + 1"
              :active="activeIds.includes(robo.id)"
              :dim="!activeIds.includes(robo.id)"
              roam
              :walking="Boolean(walkers[robo.id]?.walking)"
            />
          </div>
          <span class="roamer-name" :style="{ color: robo.color }">{{ robo.name }}</span>
          <span class="roamer-role mono">{{ statusFor(robo.id) }}</span>
        </button>

        <aside class="roam-log" :class="{ live: freeRunning }">
          <header class="log-head">
            <span class="mono">FLOOR LOG</span>
            <span class="mono log-state">{{ freeRunning ? 'LIVE' : 'IDLE' }}</span>
          </header>
          <div ref="logScroll" class="log-scroll">
            <p v-if="!displayMessages.length" class="log-empty">
              The crew is off the clock. Start FREE TALK and watch them keep their own conversation going.
            </p>
            <article
              v-for="message in displayMessages"
              :key="message.id"
              class="log-line"
              :class="message.role"
            >
              <span class="log-name mono" :style="{ color: colorFor(message) }">
                {{ nameFor(message) }}
              </span>
              <p>{{ message.text }}</p>
            </article>
          </div>
        </aside>
      </div>

      <footer class="roam-foot mono">
        <span>CLICK A ROBO TO SWAP · DOUBLE-CLICK FOR 1:1</span>
        <span class="roam-foot-center">6 ROBOS · ONE UNIT</span>
        <span>ESC TO RETURN</span>
      </footer>
    </div>
  </Teleport>
</template>

<script>
import RoboAvatar from './RoboAvatar.vue'

const STATUS = {
  idle: 'standby',
  thinking: 'thinking',
  speaking: 'live',
  listening: 'listening',
  happy: 'amused',
  sad: 'low',
  annoyed: 'sharp',
}

const X_MIN = 12
const X_MAX = 88
const Y_MIN = 24
const Y_MAX = 82

const STARTS = [
  { x: 18, y: 36 },
  { x: 38, y: 64 },
  { x: 58, y: 34 },
  { x: 78, y: 58 },
  { x: 30, y: 78 },
  { x: 70, y: 76 },
]

export default {
  name: 'RoamSpace',
  components: { RoboAvatar },
  props: {
    robos: { type: Array, default: () => [] },
    activeIds: { type: Array, default: () => [] },
    states: { type: Object, default: () => ({}) },
    speakerId: { type: String, default: '' },
    running: Boolean,
    roomName: { type: String, default: '' },
    messages: { type: Array, default: () => [] },
    freeRunning: Boolean,
    caption: { type: String, default: '' },
  },
  emits: ['close', 'toggle', 'solo', 'free', 'stop'],
  data() {
    return {
      walkers: {},
      roamSize: 96,
      raf: 0,
      lastTick: 0,
    }
  },
  computed: {
    freeTalkLabel() {
      if (this.freeRunning) return 'STOP FREE TALK'
      if (this.running) return 'HUDDLE LIVE'
      if (this.activeIds.length < 2) return 'NEED TWO ON DECK'
      return 'FREE TALK'
    },
    freeTalkTitle() {
      if (this.freeRunning) return 'Stop the free conversation'
      if (this.running) return 'A huddle is already live'
      if (this.activeIds.length < 2) return 'Put at least two Robos on deck'
      return 'Start an open-ended conversation; STOP ends it'
    },
    displayMessages() {
      return (this.messages || [])
        .filter(
          (message) =>
            message &&
            message.text &&
            (message.role === 'user' || message.role === 'robo' || message.role === 'system'),
        )
        .slice(-10)
    },
  },
  watch: {
    messages: {
      deep: true,
      handler() {
        this.scrollLog()
      },
    },
  },
  mounted() {
    this.updateSize()
    this.initWalkers()
    this.lastTick = performance.now()
    this.raf = requestAnimationFrame(this.step)
    window.addEventListener('resize', this.updateSize)
    window.addEventListener('keydown', this.onKeydown)
    this.$nextTick(() => this.$refs.closeBtn?.focus())
    this.scrollLog()
  },
  beforeUnmount() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.updateSize)
    window.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    updateSize() {
      const byWidth = window.innerWidth * 0.082
      const byHeight = window.innerHeight * 0.155
      this.roamSize = Math.round(Math.min(106, Math.max(60, Math.min(byWidth, byHeight))))
    },

    initWalkers() {
      this.walkers = {}
      this.robos.forEach((robo, index) => {
        const start = STARTS[index % STARTS.length]
        this.walkers[robo.id] = {
          x: start.x,
          y: start.y,
          tx: start.x,
          ty: start.y,
          pauseUntil: 0,
          needsTarget: true,
          walking: false,
          lean: 0,
          speed: (index % 3) * 0.6,
        }
      })
    },

    step(now) {
      const dt = Math.min(0.05, Math.max(0, (now - this.lastTick) / 1000))
      this.lastTick = now
      const base = this.running ? 2.2 : 6.8

      for (const robo of this.robos) {
        const walker = this.walkers[robo.id]
        if (!walker) continue

        // The Robo holding the floor stops to talk; the rest keep drifting.
        if (this.speakerId === robo.id) {
          walker.walking = false
          continue
        }
        if (now < walker.pauseUntil) {
          walker.walking = false
          continue
        }
        if (walker.needsTarget) {
          this.pickTarget(walker)
          walker.needsTarget = false
        }

        const dx = walker.tx - walker.x
        const dy = walker.ty - walker.y
        const distance = Math.hypot(dx, dy)

        if (distance < 0.7) {
          walker.walking = false
          walker.needsTarget = true
          walker.pauseUntil = now + 1200 + Math.random() * 2800
          continue
        }

        const stride = Math.min(distance, (base + walker.speed) * dt)
        walker.x += (dx / distance) * stride
        walker.y += (dy / distance) * stride
        walker.lean = Math.max(-4.5, Math.min(4.5, (dx / distance) * 4.5))
        walker.walking = true

        // Keep a small personal-space bubble around every walker.
        for (const other of Object.values(this.walkers)) {
          if (other === walker) continue
          const ox = walker.x - other.x
          const oy = walker.y - other.y
          if (Math.abs(ox) < 8 && Math.abs(oy) < 11) {
            walker.x += (ox >= 0 ? 1 : -1) * 0.12
            walker.y += (oy >= 0 ? 1 : -1) * 0.12
          }
        }

        walker.x = Math.max(X_MIN, Math.min(X_MAX, walker.x))
        walker.y = Math.max(Y_MIN, Math.min(Y_MAX, walker.y))
      }

      this.raf = requestAnimationFrame(this.step)
    },

    pickTarget(walker) {
      const others = Object.values(this.walkers).filter((other) => other !== walker)
      let best = { x: walker.x, y: walker.y }
      let bestScore = -Infinity

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const x = X_MIN + Math.random() * (X_MAX - X_MIN)
        const y = Y_MIN + Math.random() * (Y_MAX - Y_MIN)
        const travel = Math.hypot(x - walker.x, (y - walker.y) * 1.7)
        const crowd = others.reduce(
          (nearest, other) => Math.min(nearest, Math.hypot(x - other.x, (y - other.y) * 1.7)),
          999,
        )
        const score = Math.min(travel, 38) + Math.min(crowd, 26)
        if (score > bestScore) {
          bestScore = score
          best = { x, y }
        }
      }

      walker.tx = best.x
      walker.ty = best.y
    },

    roamerStyle(robo) {
      const walker = this.walkers[robo.id]
      if (!walker) return { display: 'none' }
      return {
        left: `${walker.x}%`,
        top: `${walker.y}%`,
        zIndex: 10 + Math.round(walker.y),
        '--lean': `${walker.lean}deg`,
        '--c': robo.color,
      }
    },

    bubbleSide(robo) {
      const walker = this.walkers[robo.id]
      return walker && walker.x < 50 ? 'right' : 'left'
    },

    stateFor(id) {
      const state = this.states[id] || 'idle'
      if (state === 'happy' || state === 'speaking' || state === 'thinking') return state
      return 'idle'
    },

    statusFor(id) {
      if (!this.activeIds.includes(id)) return 'off deck'
      return STATUS[this.states[id]] || 'standby'
    },

    nameFor(message) {
      if (message.role === 'user') return 'OPERATOR'
      if (message.role === 'system') return 'UNIT'
      return this.robos.find((robo) => robo.id === message.roboId)?.name || 'ROBO'
    },

    colorFor(message) {
      if (message.role !== 'robo') return 'var(--mint)'
      return this.robos.find((robo) => robo.id === message.roboId)?.color || 'var(--mint)'
    },

    scrollLog() {
      this.$nextTick(() => {
        const box = this.$refs.logScroll
        if (box) box.scrollTop = box.scrollHeight
      })
    },

    onKeydown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      this.$emit('close')
    },
  },
}
</script>

<style scoped>
.roam {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background: #04070c;
  color: var(--text);
  animation: roam-in 0.28s ease-out;
}

@keyframes roam-in {
  from {
    opacity: 0;
    transform: scale(1.01);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.roam-head {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 0 0 auto;
  min-height: 72px;
  padding: 13px 24px;
  border-bottom: 1px solid var(--line);
  background: rgba(4, 7, 12, 0.78);
  backdrop-filter: blur(14px);
}

.roam-title {
  flex: 1;
  min-width: 0;
}

.kicker {
  margin: 0 0 3px;
  color: var(--mint);
  font-size: 8px;
  letter-spacing: 0.18em;
}

.roam-title h2 {
  margin: 0;
  overflow: hidden;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roam-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dim);
  font-size: 8.5px;
  letter-spacing: 0.09em;
  white-space: nowrap;
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dim);
}

.live-dot.on {
  background: var(--amber);
  box-shadow: 0 0 8px var(--amber);
  animation: roam-blink 0.9s steps(2) infinite;
}

@keyframes roam-blink {
  50% {
    opacity: 0.25;
  }
}

.divider {
  opacity: 0.4;
}

.roam-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.roam-talk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid rgba(255, 194, 74, 0.35);
  border-radius: 9px;
  background: rgba(255, 194, 74, 0.06);
  color: var(--amber);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
  transition: 0.16s ease;
}

.roam-talk:hover:not(:disabled),
.roam-talk:focus-visible {
  border-color: rgba(255, 194, 74, 0.7);
  background: rgba(255, 194, 74, 0.13);
  outline: none;
}

.roam-talk.on {
  border-color: rgba(255, 107, 107, 0.55);
  background: rgba(255, 107, 107, 0.08);
  color: #ff9b9b;
}

.roam-talk.busy,
.roam-talk:disabled {
  border-color: var(--line);
  background: transparent;
  color: var(--dim);
  cursor: not-allowed;
}

.talk-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 7px currentColor;
}

.roam-log {
  position: absolute;
  z-index: 260;
  right: 22px;
  bottom: 18px;
  display: flex;
  flex-direction: column;
  width: min(370px, 34vw);
  max-height: 46%;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgba(4, 9, 15, 0.86);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
}

.roam-log.live {
  border-color: rgba(255, 194, 74, 0.38);
}

.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: 9px 11px;
  border-bottom: 1px solid var(--line);
  color: var(--mint);
  font-size: 7.5px;
  letter-spacing: 0.12em;
}

.log-state {
  color: var(--dim);
}

.roam-log.live .log-state {
  color: var(--amber);
}

.log-scroll {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 11px 12px;
}

.log-empty {
  margin: 0;
  color: var(--dim);
  font-size: 9px;
  line-height: 1.55;
}

.log-line {
  margin: 0;
}

.log-name {
  display: block;
  margin-bottom: 2px;
  font-size: 7px;
  letter-spacing: 0.1em;
}

.log-line p {
  margin: 0;
  color: #c4d7e9;
  font-size: 9.5px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.log-line.system p {
  color: var(--dim);
  font-style: italic;
}

.roam-close {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  white-space: nowrap;
  transition: 0.16s ease;
}

.roam-close .x {
  font-size: 18px;
  font-weight: 400;
  line-height: 1;
}

.roam-close:hover,
.roam-close:focus-visible {
  border-color: rgba(94, 241, 194, 0.55);
  background: rgba(94, 241, 194, 0.08);
  color: var(--mint);
  outline: none;
}

.roam-close:focus-visible {
  box-shadow: 0 0 0 3px rgba(94, 241, 194, 0.12);
}

.roam-floor {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(1.2px 1.2px at 12% 18%, rgba(219, 233, 251, 0.6), transparent),
    radial-gradient(1px 1px at 26% 8%, rgba(219, 233, 251, 0.4), transparent),
    radial-gradient(1.4px 1.4px at 68% 12%, rgba(219, 233, 251, 0.55), transparent),
    radial-gradient(1px 1px at 84% 26%, rgba(219, 233, 251, 0.38), transparent),
    radial-gradient(1.2px 1.2px at 47% 5%, rgba(219, 233, 251, 0.35), transparent),
    radial-gradient(1px 1px at 92% 9%, rgba(219, 233, 251, 0.3), transparent),
    radial-gradient(ellipse at 50% 118%, rgba(94, 241, 194, 0.1), transparent 56%),
    linear-gradient(180deg, #03060b 0%, #050b13 44%, #040910 100%);
}

.roam-floor::before {
  content: "";
  position: absolute;
  z-index: 0;
  top: 28%;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(94, 241, 194, 0.38), transparent);
  box-shadow: 0 0 40px 8px rgba(94, 241, 194, 0.08);
  pointer-events: none;
}

.roam-floor::after {
  content: "";
  position: absolute;
  z-index: 3;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 150px 50px #04070c;
}

.roam-grid {
  position: absolute;
  z-index: 0;
  inset: 28% -40% -55%;
  background-image:
    linear-gradient(rgba(94, 241, 194, 0.11) 1px, transparent 1px),
    linear-gradient(90deg, rgba(94, 241, 194, 0.11) 1px, transparent 1px);
  background-size: 62px 62px;
  transform: perspective(420px) rotateX(58deg);
  transform-origin: 50% 0;
  opacity: 0.6;
  mask-image: linear-gradient(transparent 0%, #000 24%, #000 82%, transparent 100%);
  pointer-events: none;
}

.roam-watermark {
  position: absolute;
  z-index: 0;
  top: 43%;
  left: 50%;
  color: rgba(94, 241, 194, 0.035);
  font-size: clamp(72px, 13vw, 190px);
  font-weight: 700;
  letter-spacing: 0.1em;
  white-space: nowrap;
  transform: translate(-50%, -50%);
  pointer-events: none;
  user-select: none;
}

.roamer {
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: opacity 0.25s ease;
}

.roamer.speaking {
  z-index: 200 !important;
}

.avatar {
  position: relative;
  display: flex;
  transform: rotate(var(--lean, 0deg));
  transition: transform 0.24s ease, filter 0.24s ease;
  filter: drop-shadow(0 12px 16px rgba(0, 0, 0, 0.3));
}

.roamer:hover .avatar {
  transform: rotate(var(--lean, 0deg)) scale(1.05);
}

.roamer.speaking .avatar {
  transform: rotate(var(--lean, 0deg)) scale(1.08);
  filter: drop-shadow(0 0 20px color-mix(in srgb, var(--c) 55%, transparent));
}

.roamer-name {
  margin-top: -2px;
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
}

.roamer-role {
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 1px 6px #04070c;
}

.roamer.off {
  opacity: 0.75;
}

.roamer.off .roamer-name {
  opacity: 0.6;
}

.roamer.speaking .roamer-name,
.roamer.speaking .roamer-role {
  color: var(--mint) !important;
}

.bubble {
  position: absolute;
  z-index: 5;
  bottom: 42%;
  width: max-content;
  max-width: min(260px, 34vw);
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--c) 44%, transparent);
  border-radius: 10px;
  background: rgba(4, 9, 15, 0.95);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  color: #c9dbed;
  font-size: 10.5px;
  line-height: 1.45;
  text-align: left;
  pointer-events: none;
  backdrop-filter: blur(8px);
}

.bubble.right {
  left: calc(100% + 8px);
}

.bubble.left {
  right: calc(100% + 8px);
}

.bubble.right::after,
.bubble.left::after {
  content: "";
  position: absolute;
  top: 18px;
  width: 8px;
  height: 1px;
  background: color-mix(in srgb, var(--c) 44%, transparent);
}

.bubble.right::after {
  left: -8px;
}

.bubble.left::after {
  right: -8px;
}

.bubble-name {
  display: block;
  margin-bottom: 2px;
  font-size: 7.5px;
  letter-spacing: 0.1em;
}

.bubble-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.roam-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
  min-height: 38px;
  padding: 0 24px;
  border-top: 1px solid var(--line);
  background: rgba(4, 7, 12, 0.85);
  color: #415467;
  font-size: 8px;
  letter-spacing: 0.08em;
}

.roam-foot-center {
  color: var(--dim);
}

@media (max-width: 720px) {
  .roam-head {
    gap: 10px;
    min-height: 60px;
    padding: 10px 14px;
  }

  .roam-title h2 {
    font-size: 15px;
  }

  .roam-meta {
    display: none;
  }

  .roam-actions {
    gap: 5px;
  }

  .roam-talk {
    padding: 0 8px;
    font-size: 7px;
  }

  .roam-close {
    padding: 0 9px;
  }

  .close-label {
    display: none;
  }

  .roam-log {
    right: 12px;
    bottom: 10px;
    width: min(300px, 55vw);
    max-height: 34%;
  }

  .roam-foot {
    padding: 0 14px;
    font-size: 7px;
  }

  .roam-foot span:first-child,
  .roam-foot-center {
    display: none;
  }

  .bubble {
    max-width: min(220px, 52vw);
  }
}

@media (max-height: 560px) {
  .roam-head {
    min-height: 54px;
    padding: 8px 18px;
  }

  .roam-title h2 {
    font-size: 15px;
  }

  .roam-foot {
    min-height: 30px;
  }

  .roamer-role {
    display: none;
  }
}
</style>
