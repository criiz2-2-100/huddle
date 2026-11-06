<template>
  <div class="stage">
    <header class="stage-head">
      <span class="mono label">ROUNDTABLE</span>
      <div class="head-tools">
        <button
          ref="roamBtn"
          class="roam-btn mono"
          title="Let the crew walk the floor"
          @click="openRoam"
        >
          <span class="roam-arrow" aria-hidden="true">↗</span> ROAM
        </button>
        <span class="mono live" :class="{ on: running }">
          <span class="dot"></span>{{ running ? 'LIVE' : 'STANDBY' }}
        </span>
      </div>
    </header>

    <div class="ring">
      <div class="core" :class="{ running }">
        <span class="core-unit mono">2·2·100</span>
        <div v-if="running" class="wave" aria-hidden="true">
          <span v-for="n in 5" :key="n"></span>
        </div>
        <span v-else class="core-idle mono">IDLE</span>
        <span class="core-sub mono">{{ running ? turnLabel || 'LINKING' : '6 ROBOS' }}</span>
      </div>

      <button
        v-for="(robo, index) in robos"
        :key="robo.id"
        class="seat"
        :class="{
          active: activeIds.includes(robo.id),
          speaking: speakerId === robo.id,
          off: !activeIds.includes(robo.id),
        }"
        :style="seatStyle(index)"
        :title="`${robo.name} · ${robo.role}\nClick to add / remove · Double-click for a 1:1`"
        @click="$emit('toggle', robo.id)"
        @dblclick="$emit('solo', robo.id)"
      >
        <RoboAvatar
          :glyph="robo.glyph"
          :color="robo.color"
          :state="stateFor(robo.id)"
          :size="70"
          :seed="index + 1"
          :active="activeIds.includes(robo.id)"
          :dim="!activeIds.includes(robo.id)"
        />
        <span class="seat-name" :style="{ color: robo.color }">{{ robo.name }}</span>
        <span class="seat-role mono">{{ statusFor(robo.id) }}</span>
      </button>
    </div>

    <div class="readout" :class="{ live: Boolean(speakerId) }">
      <template v-if="speakerId">
        <div class="readout-head">
          <span class="mono" :style="{ color: roboFor(speakerId)?.color }">
            {{ roboFor(speakerId)?.name }} · {{ statusFor(speakerId) }}
          </span>
          <span class="mono dim">{{ turnLabel }}</span>
        </div>
        <p class="caption">{{ caption }}</p>
      </template>
      <template v-else>
        <div class="readout-head">
          <span class="mono dim">CHANNEL</span>
          <span class="mono dim">{{ roomName || 'HUDDLE' }}</span>
        </div>
        <p class="caption quiet">
          {{ activeIds.length }} on deck. Click a Robo to swap them in or out — double-click for a
          one-to-one.
        </p>
      </template>
    </div>

    <div class="stage-foot mono">
      <span>{{ activeIds.length }} ON DECK</span>
      <span>MAX {{ maxSpeakers }}</span>
      <span>RING 2·2·100</span>
    </div>

    <RoamSpace
      v-if="roamOpen"
      :robos="robos"
      :active-ids="activeIds"
      :states="states"
      :speaker-id="speakerId"
      :running="running"
      :room-name="roomName"
      :messages="messages"
      :free-running="freeRunning"
      :caption="caption"
      @close="closeRoam"
      @toggle="$emit('toggle', $event)"
      @solo="$emit('solo', $event)"
      @free="$emit('free')"
      @stop="$emit('stop')"
    />
  </div>
</template>

<script>
import RoboAvatar from './RoboAvatar.vue'
import RoamSpace from './RoamSpace.vue'

const STATUS = {
  idle: 'standby',
  thinking: 'thinking',
  speaking: 'live',
  listening: 'listening',
  happy: 'amused',
  sad: 'low',
  annoyed: 'sharp',
}

export default {
  name: 'Stage',
  components: { RoboAvatar, RoamSpace },
  props: {
    robos: { type: Array, default: () => [] },
    activeIds: { type: Array, default: () => [] },
    states: { type: Object, default: () => ({}) },
    speakerId: { type: String, default: '' },
    roomName: { type: String, default: '' },
    messages: { type: Array, default: () => [] },
    running: Boolean,
    freeRunning: Boolean,
    turnLabel: { type: String, default: '' },
    liveText: { type: String, default: '' },
    maxSpeakers: { type: Number, default: 3 },
  },
  emits: ['toggle', 'solo', 'free', 'stop'],
  data() {
    return {
      roamOpen: false,
    }
  },
  computed: {
    caption() {
      const text = this.liveText.trim()
      if (!text) return 'Tuning in…'
      return text.length > 260 ? `…${text.slice(-260)}` : text
    },
  },
  methods: {
    openRoam() {
      this.roamOpen = true
    },
    closeRoam() {
      this.roamOpen = false
      this.$nextTick(() => this.$refs.roamBtn?.focus())
    },
    seatStyle(index) {
      const count = this.robos.length || 1
      const angle = (-90 + (index * 360) / count) * (Math.PI / 180)
      return {
        left: `${50 + Math.cos(angle) * 36}%`,
        top: `${50 + Math.sin(angle) * 29.5}%`,
      }
    },
    roboFor(id) {
      return this.robos.find((robo) => robo.id === id)
    },
    statusFor(id) {
      if (!this.activeIds.includes(id)) return 'off deck'
      return STATUS[this.states[id]] || 'standby'
    },
    stateFor(id) {
      const state = this.states[id] || 'idle'
      if (state === 'happy' || state === 'speaking' || state === 'thinking') return state
      return 'idle'
    },
  },
}
</script>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.label {
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.16em;
}

.live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--dim);
  font-size: 8.5px;
  letter-spacing: 0.12em;
}

.live .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dim);
}

.live.on {
  color: var(--amber);
}

.live.on .dot {
  background: var(--amber);
  box-shadow: 0 0 7px var(--amber);
  animation: blink 0.8s steps(2) infinite;
}

.head-tools {
  display: flex;
  align-items: center;
  gap: 9px;
}

.roam-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 21px;
  padding: 0 7px;
  border: 1px solid rgba(94, 241, 194, 0.28);
  border-radius: 99px;
  background: rgba(94, 241, 194, 0.05);
  color: var(--mint);
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  transition: 0.16s ease;
}

.roam-btn:hover {
  border-color: rgba(94, 241, 194, 0.6);
  background: rgba(94, 241, 194, 0.12);
  box-shadow: 0 0 12px rgba(94, 241, 194, 0.12);
}

.roam-arrow {
  font-size: 10px;
  line-height: 1;
}

@keyframes blink {
  50% {
    opacity: 0.25;
  }
}

.ring {
  position: relative;
  height: 340px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 50%, rgba(94, 241, 194, 0.045), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.012), transparent);
  overflow: hidden;
}

.ring::before {
  content: "";
  position: absolute;
  inset: 14px;
  border: 1px dashed rgba(126, 178, 220, 0.1);
  border-radius: 50%;
  pointer-events: none;
}

.core {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 106px;
  height: 106px;
  border: 1px solid rgba(94, 241, 194, 0.22);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(94, 241, 194, 0.09), rgba(4, 8, 13, 0.94) 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.core.running {
  border-color: rgba(255, 194, 74, 0.35);
  background: radial-gradient(circle, rgba(255, 194, 74, 0.1), rgba(4, 8, 13, 0.94) 70%);
}

.core-unit {
  color: var(--mint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.core.running .core-unit {
  color: var(--amber);
}

.core-idle {
  color: var(--dim);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.wave {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 16px;
}

.wave span {
  width: 2px;
  height: 5px;
  border-radius: 2px;
  background: var(--amber);
  animation: wave 0.7s ease-in-out infinite alternate;
}

.wave span:nth-child(2) {
  animation-delay: 0.1s;
}

.wave span:nth-child(3) {
  animation-delay: 0.2s;
}

.wave span:nth-child(4) {
  animation-delay: 0.3s;
}

.wave span:nth-child(5) {
  animation-delay: 0.4s;
}

@keyframes wave {
  from {
    height: 4px;
    opacity: 0.4;
  }
  to {
    height: 15px;
    opacity: 1;
  }
}

.core-sub {
  margin-top: 1px;
  color: var(--dim);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.seat {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 0;
  border: 0;
  background: none;
  transform: translate(-50%, -50%);
  transition: transform 0.18s ease;
}

.seat :deep(.robo) {
  transition: transform 0.22s ease, opacity 0.3s ease, filter 0.3s ease;
}

.seat:hover :deep(.robo) {
  transform: scale(1.05);
}

.seat.speaking :deep(.robo) {
  transform: scale(1.09);
}

.seat-name {
  margin-top: -1px;
  font-family: var(--mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.seat-role {
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.seat.off .seat-name {
  opacity: 0.55;
}

.seat.off .seat-role {
  color: #3d5064;
}

.seat.speaking .seat-role {
  color: var(--mint);
}

.readout {
  min-height: 84px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
}

.readout.live {
  border-color: rgba(94, 241, 194, 0.25);
}

.readout-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 5px;
  font-size: 8.5px;
  letter-spacing: 0.1em;
}

.dim {
  color: var(--dim);
}

.caption {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: #c4d7e9;
  font-size: 11.5px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.caption.quiet {
  color: var(--dim);
  font-size: 10.5px;
}

.stage-foot {
  display: flex;
  justify-content: space-between;
  padding: 0 2px;
  color: #415467;
  font-size: 8px;
  letter-spacing: 0.08em;
}

</style>
