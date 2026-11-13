<template>
  <Teleport to="body">
    <div class="roam" role="dialog" aria-modal="true" aria-label="Robo free roam">
      <header class="roam-head">
        <div class="roam-title">
          <p class="mono kicker">UNIT 2·2·100 · OFFICE FLOOR</p>
          <h2>{{ roomName || 'The office' }}</h2>
        </div>
        <div class="roam-meta mono">
          <span class="live-dot" :class="{ on: running || freeRunning }"></span>
          {{ freeRunning ? 'FREE TALK LIVE' : running ? 'RALLY LIVE' : 'OFF THE CLOCK' }}
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
        <div class="office-room" aria-hidden="true">
          <div class="room-window">
            <span class="room-window-glow"></span>
            <span class="room-city"></span>
            <span class="room-mullion m1"></span>
            <span class="room-mullion m2"></span>
            <span class="room-mullion m3"></span>
            <span class="room-mullion m4"></span>
            <span class="room-blinds"></span>
          </div>

          <span class="room-pendant pendant-left"></span>
          <span class="room-pendant pendant-right"></span>

          <div class="room-sign mono">
            <strong>2·2·100</strong>
            <span>RALLY ROOM</span>
          </div>

          <div class="room-rug"></div>

          <div class="room-console">
            <span class="console-screen"><i></i></span>
            <span class="console-lamp"></span>
            <span class="console-top"></span>
            <span class="console-leg leg-left"></span>
            <span class="console-leg leg-right"></span>
          </div>

          <div class="room-plant plant-left">
            <span class="pot"></span>
            <i v-for="leaf in 7" :key="`left-${leaf}`"></i>
          </div>
          <div class="room-plant plant-right">
            <span class="pot"></span>
            <i v-for="leaf in 7" :key="`right-${leaf}`"></i>
          </div>
        </div>

        <div class="roam-grid" aria-hidden="true"></div>

        <button
          v-for="(robo, index) in robos"
          :key="robo.id"
          class="roamer"
          :class="{
            off: !activeIds.includes(robo.id),
            speaking: speakerId === robo.id,
          }"
          :style="roamerStyle(robo)"
          :title="`${robo.name} · ${robo.missionRole || robo.role}\nClick to swap · Double-click for a 1:1`"
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
            <span class="mono">OFFICE LOG</span>
            <span class="mono log-state">{{ freeRunning ? 'LIVE' : 'IDLE' }}</span>
          </header>
          <div ref="logScroll" class="log-scroll">
            <p v-if="!displayMessages.length" class="log-empty">
              Between meetings. Start FREE TALK and watch the crew keep their own conversation going.
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
        <span class="roam-foot-center">6 ROBOS · ONE OFFICE</span>
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
const Y_MIN = 30
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
      if (this.running) return 'RALLY LIVE'
      if (this.activeIds.length < 2) return 'NEED TWO ON DECK'
      return 'FREE TALK'
    },
    freeTalkTitle() {
      if (this.freeRunning) return 'Stop the free conversation'
      if (this.running) return 'A rally is already live'
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
    radial-gradient(ellipse at 50% 15%, rgba(139, 178, 199, 0.12), transparent 58%),
    linear-gradient(180deg, #18252f 0%, #111b23 30.5%, #191816 31%, #101314 100%);
}

.roam-floor::before {
  content: "";
  position: absolute;
  z-index: 2;
  top: 30.7%;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(213, 191, 159, 0.2), transparent);
  box-shadow: 0 3px 18px rgba(0, 0, 0, 0.26);
  pointer-events: none;
}

.roam-floor::after {
  content: "";
  position: absolute;
  z-index: 3;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 170px 56px #070c10;
}

.office-room {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Window wall */
.room-window {
  position: absolute;
  z-index: 0;
  top: 3.5%;
  left: 4.5%;
  right: 4.5%;
  height: 25%;
  overflow: hidden;
  border: 1px solid rgba(191, 216, 229, 0.16);
  border-radius: 10px 10px 3px 3px;
  background: linear-gradient(180deg, #0d1d2a 0%, #223f51 56%, #80654c 100%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.room-window-glow {
  position: absolute;
  inset: 38% 7% -34%;
  background: radial-gradient(ellipse, rgba(255, 189, 112, 0.42), transparent 69%);
}

.room-city {
  position: absolute;
  right: 3%;
  bottom: 0;
  left: 3%;
  height: 48%;
  opacity: 0.78;
  background:
    linear-gradient(#081017, #081017) 0 100% / 5% 52% no-repeat,
    linear-gradient(#091219, #091219) 6% 100% / 4% 76% no-repeat,
    linear-gradient(#070f16, #070f16) 11% 100% / 7% 43% no-repeat,
    linear-gradient(#081119, #081119) 20% 100% / 5% 68% no-repeat,
    linear-gradient(#09131b, #09131b) 27% 100% / 9% 49% no-repeat,
    linear-gradient(#070f17, #070f17) 38% 100% / 4% 83% no-repeat,
    linear-gradient(#08121a, #08121a) 44% 100% / 7% 56% no-repeat,
    linear-gradient(#09131a, #09131a) 53% 100% / 4% 73% no-repeat,
    linear-gradient(#071017, #071017) 59% 100% / 10% 45% no-repeat,
    linear-gradient(#08121a, #08121a) 72% 100% / 5% 64% no-repeat,
    linear-gradient(#071017, #071017) 79% 100% / 8% 51% no-repeat,
    linear-gradient(#09121a, #09121a) 89% 100% / 6% 78% no-repeat;
}

.room-city::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.72;
  background-image: radial-gradient(circle, rgba(255, 213, 154, 0.8) 0.7px, transparent 0.95px);
  background-size: 19px 17px;
  mask-image: linear-gradient(180deg, transparent 3%, #000 58%, #000);
}

.room-mullion {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 5px;
  background: linear-gradient(90deg, #19242d, #364751 45%, #111a21);
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
}

.room-mullion.m1 {
  left: 20%;
}

.room-mullion.m2 {
  left: 40%;
}

.room-mullion.m3 {
  left: 60%;
}

.room-mullion.m4 {
  left: 80%;
}

.room-blinds {
  position: absolute;
  inset: 0;
  opacity: 0.13;
  background: repeating-linear-gradient(180deg, transparent 0 5px, #dbe7ee 5px 6px);
}

.room-pendant {
  position: absolute;
  z-index: 3;
  top: 0;
  width: 70px;
  height: 180px;
}

.room-pendant::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 112px;
  background: #74838c;
}

.room-pendant::after {
  content: "";
  position: absolute;
  top: 108px;
  left: 50%;
  width: 38px;
  height: 14px;
  border-radius: 3px 3px 16px 16px;
  background: linear-gradient(180deg, #879298, #354047);
  box-shadow:
    0 22px 50px 22px rgba(255, 194, 118, 0.12),
    0 0 28px rgba(255, 198, 129, 0.22);
  transform: translateX(-50%);
}

.pendant-left {
  left: 10%;
}

.pendant-right {
  right: 10%;
}

.room-sign {
  position: absolute;
  z-index: 4;
  top: 5.5%;
  right: 7.5%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  padding: 7px 10px;
  border: 1px solid rgba(223, 238, 246, 0.16);
  border-radius: 7px;
  background: rgba(4, 10, 14, 0.26);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(5px);
}

.room-sign strong {
  color: rgba(213, 239, 246, 0.76);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.room-sign span {
  color: rgba(185, 207, 219, 0.52);
  font-size: 6.5px;
  letter-spacing: 0.14em;
}

.room-rug {
  position: absolute;
  z-index: 1;
  top: 34%;
  right: 8%;
  bottom: 5%;
  left: 8%;
  border: 1px solid rgba(178, 167, 149, 0.16);
  border-radius: 44% / 12%;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.014) 0 2px, transparent 2px 17px),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 2px, transparent 2px 15px),
    linear-gradient(180deg, rgba(60, 71, 68, 0.62), rgba(33, 45, 44, 0.58));
  box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.22);
}

/* Desk in the corner */
.room-console {
  position: absolute;
  z-index: 2;
  bottom: 7%;
  left: 1%;
  width: 230px;
  height: 130px;
  opacity: 0.9;
}

.console-top {
  position: absolute;
  right: 0;
  bottom: 30px;
  left: 0;
  height: 13px;
  border: 1px solid rgba(226, 204, 173, 0.22);
  border-radius: 3px;
  background: linear-gradient(180deg, #75634c, #3d3932 56%, #222525);
  box-shadow: 0 9px 14px rgba(0, 0, 0, 0.34);
}

.console-leg {
  position: absolute;
  bottom: 0;
  width: 4px;
  height: 34px;
  background: #303a3d;
}

.console-leg.leg-left {
  left: 22px;
}

.console-leg.leg-right {
  right: 22px;
}

.console-screen {
  position: absolute;
  bottom: 44px;
  left: 38px;
  width: 86px;
  height: 56px;
  border: 3px solid #1c282f;
  border-radius: 3px;
  background: #091219;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.38);
  transform: perspective(220px) rotateY(8deg);
}

.console-screen::after {
  content: "";
  position: absolute;
  bottom: -11px;
  left: 39px;
  width: 4px;
  height: 10px;
  background: #46545b;
  box-shadow: -15px 9px 0 -1px #46545b, 15px 9px 0 -1px #46545b;
}

.console-screen i {
  position: absolute;
  inset: 3px;
  border-radius: 1px;
  background:
    linear-gradient(180deg, rgba(106, 183, 201, 0.12), transparent 55%),
    repeating-linear-gradient(0deg, transparent 0 5px, rgba(94, 241, 194, 0.16) 5px 6px);
}

.console-lamp {
  position: absolute;
  right: 29px;
  bottom: 43px;
  width: 36px;
  height: 52px;
  border-radius: 4px 4px 10px 10px;
  background: linear-gradient(180deg, rgba(255, 204, 137, 0.85), rgba(141, 99, 58, 0.38));
  box-shadow: 0 13px 22px rgba(255, 190, 111, 0.14);
}

.console-lamp::before {
  content: "";
  position: absolute;
  top: 34px;
  left: 17px;
  width: 2px;
  height: 25px;
  background: #778387;
}

.console-lamp::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -37px;
  left: 0;
  height: 4px;
  border-radius: 50%;
  background: #778387;
}

/* Office greenery */
.room-plant {
  position: absolute;
  z-index: 2;
  bottom: 3%;
  width: 122px;
  height: 215px;
  opacity: 0.8;
}

.room-plant.plant-left {
  left: 0.5%;
}

.room-plant.plant-right {
  right: 0.5%;
  transform: scaleX(-1);
}

.room-plant .pot {
  position: absolute;
  z-index: 3;
  right: 30px;
  bottom: 0;
  width: 56px;
  height: 54px;
  border-radius: 4px 4px 17px 17px;
  background: linear-gradient(90deg, #37322d, #776d60 44%, #312d29);
  box-shadow: 0 11px 16px rgba(0, 0, 0, 0.42);
}

.room-plant .pot::before {
  content: "";
  position: absolute;
  top: -8px;
  right: -4px;
  left: -4px;
  height: 14px;
  border-radius: 5px;
  background: #887b6c;
}

.room-plant i {
  position: absolute;
  bottom: 45px;
  left: 47px;
  width: 16px;
  height: 88px;
  border-radius: 92% 8% 88% 10%;
  background: linear-gradient(180deg, #557f68, #203c32);
  transform-origin: 50% 100%;
  opacity: 0.8;
}

.room-plant i:nth-child(2) {
  height: 76px;
  transform: rotate(-36deg) translateY(-8px);
}

.room-plant i:nth-child(3) {
  height: 92px;
  transform: rotate(28deg) translateY(-12px);
}

.room-plant i:nth-child(4) {
  height: 70px;
  transform: rotate(-63deg) translateY(-15px);
}

.room-plant i:nth-child(5) {
  height: 78px;
  transform: rotate(65deg) translateY(-13px);
}

.room-plant i:nth-child(6) {
  height: 58px;
  transform: rotate(-4deg) translateY(-21px);
}

.room-plant i:nth-child(7) {
  height: 62px;
  transform: rotate(48deg) translateY(-20px);
}

.roam-grid {
  position: absolute;
  z-index: 0;
  inset: 30.8% -12% -25%;
  background-image:
    repeating-linear-gradient(90deg, transparent 0 95px, rgba(216, 197, 167, 0.045) 95px 96px),
    repeating-linear-gradient(0deg, transparent 0 45px, rgba(216, 197, 167, 0.028) 45px 46px);
  transform: perspective(900px) rotateX(8deg);
  transform-origin: 50% 0;
  opacity: 0.55;
  mask-image: linear-gradient(transparent 0%, #000 12%, #000 86%, transparent 100%);
  pointer-events: none;
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

  .room-plant {
    transform: scale(0.72);
    transform-origin: bottom left;
  }

  .room-plant.plant-right {
    transform: scale(-0.72, 0.72);
    transform-origin: bottom right;
  }

  .room-console {
    transform: scale(0.75);
    transform-origin: bottom left;
  }

  .room-pendant {
    transform: scaleY(0.78);
    transform-origin: top;
  }
}

@media (max-width: 720px) {
  .room-window {
    top: 4%;
    height: 22%;
  }

  .room-sign {
    top: 5%;
    right: 6%;
  }

  .room-pendant {
    opacity: 0.55;
  }

  .room-console {
    transform: scale(0.72);
    transform-origin: bottom left;
  }

  .room-plant {
    opacity: 0.48;
    transform: scale(0.72);
    transform-origin: bottom left;
  }

  .room-plant.plant-right {
    transform: scale(-0.72, 0.72);
    transform-origin: bottom right;
  }

  .room-rug {
    right: 4%;
    left: 4%;
  }
}
</style>
