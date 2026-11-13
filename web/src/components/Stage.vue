<template>
  <div class="stage">
    <header class="stage-head">
      <span class="mono label">ROUNDTABLE</span>
      <div class="head-tools">
        <button
          ref="roamBtn"
          class="roam-btn mono"
          title="Let the crew walk the office"
          @click="openRoam"
        >
          <span class="roam-arrow" aria-hidden="true">↗</span> ROAM
        </button>
        <span class="mono live" :class="{ on: running }">
          <span class="dot"></span>{{ running ? 'LIVE' : 'STANDBY' }}
        </span>
      </div>
    </header>

    <div class="ring" :class="{ running }">
      <div class="office" aria-hidden="true">
        <div class="office-window">
          <span class="window-glow"></span>
          <span class="window-city"></span>
          <span class="window-mullion m1"></span>
          <span class="window-mullion m2"></span>
          <span class="window-mullion m3"></span>
          <span class="window-blinds"></span>
        </div>

        <span class="office-pendant pendant-a"></span>
        <span class="office-pendant pendant-b"></span>

        <div class="office-rug"></div>

        <div class="office-plant plant-left">
          <span class="pot"></span>
          <i v-for="leaf in 6" :key="`left-${leaf}`"></i>
        </div>
        <div class="office-plant plant-right">
          <span class="pot"></span>
          <i v-for="leaf in 6" :key="`right-${leaf}`"></i>
        </div>
      </div>

      <div class="core" :class="{ running }">
        <span class="table-prop laptop" aria-hidden="true"><i></i></span>
        <span class="table-prop mug" aria-hidden="true"></span>
        <span class="table-prop notes" aria-hidden="true"></span>

        <div class="table-console">
          <span class="core-unit mono">2·2·100</span>
          <div v-if="running" class="wave" aria-hidden="true">
            <span v-for="n in 5" :key="n"></span>
          </div>
          <span v-else class="core-idle mono">IDLE</span>
          <span class="core-sub mono">{{ running ? turnLabel || 'LINKING' : '6 ROBOS' }}</span>
        </div>
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
        :title="`${robo.name} · ${robo.missionRole || robo.role}\nClick to add / remove · Double-click for a 1:1`"
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
          <span class="mono dim">{{ roomName || 'RALLY' }}</span>
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
      <span>ROOM 2·2·100</span>
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

/* The room */
.ring {
  position: relative;
  height: 360px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 50% 21%, rgba(131, 172, 197, 0.14), transparent 53%),
    linear-gradient(180deg, #17232d 0%, #111b23 31%, #181a1a 31.5%, #111516 100%);
  box-shadow: inset 0 0 48px rgba(0, 0, 0, 0.42);
  overflow: hidden;
  isolation: isolate;
}

.office {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.office::before {
  content: "";
  position: absolute;
  top: 33%;
  left: -10%;
  right: -10%;
  bottom: -16%;
  z-index: 0;
  background:
    repeating-linear-gradient(90deg, transparent 0 74px, rgba(220, 203, 177, 0.055) 74px 75px),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(220, 203, 177, 0.035) 31px 32px),
    linear-gradient(180deg, #27231f, #161616);
  transform: perspective(320px) rotateX(8deg);
  transform-origin: 50% 0;
}

.office-window {
  position: absolute;
  z-index: 1;
  top: 12px;
  left: 5%;
  right: 5%;
  height: 82px;
  overflow: hidden;
  border: 1px solid rgba(190, 215, 228, 0.17);
  border-radius: 7px 7px 3px 3px;
  background: linear-gradient(180deg, #101f2c 0%, #203e50 54%, #7a624e 100%);
  box-shadow: 0 5px 18px rgba(0, 0, 0, 0.35);
}

.window-glow {
  position: absolute;
  inset: 35% 10% -30%;
  background: radial-gradient(ellipse, rgba(255, 192, 119, 0.42), transparent 68%);
}

.window-city {
  position: absolute;
  right: 4%;
  bottom: 0;
  left: 4%;
  height: 46%;
  opacity: 0.75;
  background:
    linear-gradient(#091117, #091117) 0 100% / 7% 55% no-repeat,
    linear-gradient(#0a131a, #0a131a) 8% 100% / 5% 78% no-repeat,
    linear-gradient(#081017, #081017) 14% 100% / 9% 44% no-repeat,
    linear-gradient(#091219, #091219) 25% 100% / 6% 66% no-repeat,
    linear-gradient(#0a131b, #0a131b) 33% 100% / 10% 51% no-repeat,
    linear-gradient(#081119, #081119) 45% 100% / 6% 82% no-repeat,
    linear-gradient(#0a141b, #0a141b) 53% 100% / 8% 58% no-repeat,
    linear-gradient(#09121a, #09121a) 63% 100% / 5% 72% no-repeat,
    linear-gradient(#081017, #081017) 70% 100% / 11% 46% no-repeat,
    linear-gradient(#0a131a, #0a131a) 83% 100% / 7% 67% no-repeat,
    linear-gradient(#081017, #081017) 91% 100% / 8% 52% no-repeat;
}

.window-city::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.65;
  background-image: radial-gradient(circle, rgba(255, 213, 154, 0.8) 0.6px, transparent 0.8px);
  background-size: 17px 15px;
  mask-image: linear-gradient(180deg, transparent 4%, #000 58%, #000);
}

.window-mullion {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(90deg, #1a252e, #34444f 45%, #121b22);
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.45);
}

.window-mullion.m1 {
  left: 25%;
}

.window-mullion.m2 {
  left: 50%;
}

.window-mullion.m3 {
  left: 75%;
}

.window-blinds {
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background: repeating-linear-gradient(180deg, transparent 0 4px, #d8e5ec 4px 5px);
}

.office-pendant {
  position: absolute;
  z-index: 2;
  top: 0;
  width: 40px;
  height: 58px;
}

.office-pendant::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 38px;
  background: #72818b;
}

.office-pendant::after {
  content: "";
  position: absolute;
  top: 36px;
  left: 50%;
  width: 24px;
  height: 10px;
  border-radius: 2px 2px 11px 11px;
  background: linear-gradient(180deg, #78858b, #303940);
  box-shadow:
    0 15px 30px 12px rgba(255, 195, 120, 0.13),
    0 0 18px rgba(255, 198, 129, 0.24);
  transform: translateX(-50%);
}

.pendant-a {
  left: 14%;
}

.pendant-b {
  right: 14%;
}

.office-rug {
  position: absolute;
  z-index: 1;
  top: 35%;
  left: 7%;
  right: 7%;
  bottom: 7%;
  border: 1px solid rgba(173, 162, 143, 0.19);
  border-radius: 46% / 15%;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.017) 0 2px, transparent 2px 15px),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.014) 0 2px, transparent 2px 13px),
    linear-gradient(180deg, rgba(69, 74, 70, 0.54), rgba(38, 48, 46, 0.54));
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.2);
}

.office-plant {
  position: absolute;
  z-index: 2;
  bottom: 2px;
  width: 58px;
  height: 82px;
  opacity: 0.9;
}

.plant-left {
  left: 1.5%;
}

.plant-right {
  right: 1.5%;
  transform: scaleX(-1);
}

.office-plant .pot {
  position: absolute;
  z-index: 2;
  right: 17px;
  bottom: 0;
  width: 25px;
  height: 23px;
  border-radius: 3px 3px 9px 9px;
  background: linear-gradient(90deg, #3a3530, #70675b 45%, #302d29);
  box-shadow: 0 5px 8px rgba(0, 0, 0, 0.4);
}

.office-plant .pot::before {
  content: "";
  position: absolute;
  top: -4px;
  left: -2px;
  right: -2px;
  height: 7px;
  border-radius: 3px;
  background: #857a6c;
}

.office-plant i {
  position: absolute;
  bottom: 18px;
  left: 25px;
  width: 9px;
  height: 38px;
  border-radius: 90% 8% 85% 10%;
  background: linear-gradient(180deg, #4e7f63, #203f33);
  transform-origin: 50% 100%;
  opacity: 0.78;
}

.office-plant i:nth-child(2) {
  transform: rotate(-38deg) translateY(-4px);
}

.office-plant i:nth-child(3) {
  transform: rotate(30deg) translateY(-6px);
}

.office-plant i:nth-child(4) {
  height: 31px;
  transform: rotate(-66deg) translateY(-6px);
}

.office-plant i:nth-child(5) {
  height: 34px;
  transform: rotate(62deg) translateY(-4px);
}

.office-plant i:nth-child(6) {
  height: 26px;
  transform: rotate(6deg) translateY(-9px);
}

/* The conference table */
.core {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 172px;
  height: 96px;
  border: 1px solid rgba(222, 202, 170, 0.38);
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 42% 18%, rgba(255, 255, 255, 0.18), transparent 38%),
    linear-gradient(145deg, #67533e 0%, #3e352b 48%, #282a29 100%);
  box-shadow:
    0 16px 22px rgba(0, 0, 0, 0.52),
    inset 0 1px 0 rgba(255, 249, 235, 0.16);
  transform: translate(-50%, -50%);
}

.core::before {
  content: "";
  position: absolute;
  inset: 7px;
  border: 1px solid rgba(255, 246, 229, 0.11);
  border-radius: 50%;
  pointer-events: none;
}

.core.running {
  border-color: rgba(255, 194, 74, 0.45);
  box-shadow:
    0 16px 26px rgba(0, 0, 0, 0.54),
    0 0 24px rgba(255, 194, 74, 0.1),
    inset 0 1px 0 rgba(255, 249, 235, 0.18);
}

.table-console {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 112px;
  height: 61px;
  border: 1px solid rgba(217, 232, 240, 0.14);
  border-radius: 9px;
  background: rgba(4, 10, 14, 0.68);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(4px);
}

.core-unit {
  color: var(--mint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
}

.core.running .core-unit {
  color: var(--amber);
}

.core-idle {
  color: #a9bcc9;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.17em;
}

.wave {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 14px;
}

.wave span {
  width: 2px;
  height: 4px;
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
    height: 13px;
    opacity: 1;
  }
}

.core-sub {
  margin-top: 1px;
  color: #778b99;
  font-size: 6.5px;
  letter-spacing: 0.1em;
}

.table-prop {
  position: absolute;
  z-index: 3;
  pointer-events: none;
}

.table-prop.laptop {
  top: 57%;
  left: 10%;
  width: 27px;
  height: 17px;
  border: 1px solid #7c8d98;
  border-radius: 2px;
  background: #0b151d;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  transform: rotate(-7deg) skewY(6deg);
}

.table-prop.laptop i {
  position: absolute;
  top: 2px;
  right: 2px;
  bottom: 2px;
  left: 2px;
  border-radius: 1px;
  background: linear-gradient(135deg, rgba(95, 160, 183, 0.36), rgba(29, 58, 70, 0.3));
}

.table-prop.laptop::after {
  content: "";
  position: absolute;
  right: -3px;
  bottom: -3px;
  left: -3px;
  height: 3px;
  border-radius: 1px;
  background: #9aa6ac;
}

.table-prop.mug {
  top: 29%;
  right: 11%;
  width: 9px;
  height: 10px;
  border-radius: 2px 2px 3px 3px;
  background: linear-gradient(90deg, #c8c2b6, #f0eadf 50%, #9b968e);
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.35);
}

.table-prop.mug::after {
  content: "";
  position: absolute;
  top: 2px;
  right: -4px;
  width: 5px;
  height: 5px;
  border: 1.5px solid #c8c2b6;
  border-left: 0;
  border-radius: 0 4px 4px 0;
}

.table-prop.notes {
  right: 17%;
  bottom: 18%;
  width: 20px;
  height: 13px;
  border: 1px solid rgba(78, 65, 51, 0.45);
  border-radius: 1px;
  background: #d3c6b1;
  box-shadow:
    2px 2px 0 #b8ad9e,
    0 2px 4px rgba(0, 0, 0, 0.25);
  transform: rotate(8deg);
}

.seat {
  position: absolute;
  z-index: 3;
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
  filter: drop-shadow(0 6px 7px rgba(0, 0, 0, 0.28));
}

.seat:hover :deep(.robo) {
  transform: scale(1.05);
}

.seat.speaking :deep(.robo) {
  transform: scale(1.09);
}

.seat-name {
  margin-top: -2px;
  font-family: var(--mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-shadow: 0 1px 5px #0b1013;
}

.seat-role {
  color: #8a9ba8;
  font-size: 7.5px;
  letter-spacing: 0.06em;
  text-shadow: 0 1px 5px #0b1013;
  text-transform: uppercase;
}

.seat.off .seat-name {
  opacity: 0.55;
}

.seat.off .seat-role {
  color: #586773;
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

@media (max-width: 400px) {
  .ring {
    height: 338px;
  }

  .office-window {
    height: 72px;
  }

  .core {
    width: 154px;
    height: 88px;
  }

  .core::before {
    inset: 6px;
  }

  .table-console {
    width: 101px;
    height: 56px;
  }

  .table-prop.laptop {
    left: 8%;
    width: 23px;
  }

  .table-prop.mug {
    right: 8%;
  }

  .table-prop.notes {
    right: 12%;
  }
}
</style>
