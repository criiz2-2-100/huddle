<template>
  <div class="robo" :class="[`state-${state}`, { active, dim, roam, walking }]" :style="style">
    <span class="halo" aria-hidden="true"></span>
    <svg viewBox="0 0 120 146" role="img" :aria-label="`${state} Robo shaped like the digit ${glyph}`">
      <ellipse class="shadow" cx="60" cy="132" rx="28" ry="4.5" />

      <g class="body">
        <g v-if="roam" class="legs" :class="{ stepping: walking }" aria-hidden="true">
          <g class="leg leg-a">
            <path d="M48 103 L45 114 L46 124" />
            <circle class="joint" cx="48" cy="103" r="2.6" />
            <rect class="foot" x="39.5" y="123" width="13" height="5.4" rx="2.7" />
          </g>
          <g class="leg leg-b">
            <path d="M72 103 L75 114 L74 124" />
            <circle class="joint" cx="72" cy="103" r="2.6" />
            <rect class="foot" x="67.5" y="123" width="13" height="5.4" rx="2.7" />
          </g>
        </g>

        <path class="glyph" :d="shape.path" />

        <circle v-if="active" class="select-ring" cx="60" cy="70" r="57" />

        <line class="limb" x1="16" y1="80" x2="28" y2="74" />
        <line class="limb" x1="104" y1="80" x2="92" y2="74" />

        <g v-if="!roam" class="jets" aria-hidden="true">
          <ellipse cx="44" cy="114" rx="7" ry="2.4" />
          <ellipse cx="76" cy="114" rx="7" ry="2.4" />
        </g>

        <g class="antenna">
          <line
            :x1="shape.antenna.x"
            :y1="shape.antenna.y - 1"
            :x2="shape.antenna.x"
            :y2="shape.antenna.y - 8"
          />
          <circle class="bulb" :cx="shape.antenna.x" :cy="shape.antenna.y - 11" r="2.8" />
        </g>

        <g class="visor" :transform="`translate(${shape.visor.x} ${shape.visor.y})`">
          <rect class="plate" x="0" y="0" :width="shape.visor.w" :height="shape.visor.h" rx="8" />
          <rect
            class="glass"
            x="2.5"
            y="2.5"
            :width="shape.visor.w - 5"
            :height="shape.visor.h - 5"
            rx="6"
          />
          <rect class="sheen" x="4" y="4" :width="shape.visor.w - 8" height="5" rx="2.5" />
          <circle class="bolt" cx="5" cy="5" r="1" />
          <circle class="bolt" :cx="shape.visor.w - 5" cy="5" r="1" />

          <g class="face">
            <g v-if="state === 'happy'" class="eyes eyes-happy">
              <path
                v-for="(x, index) in eyeXs"
                :key="`happy-${index}`"
                :d="`M${x - 4} ${eyeY + 1.2} Q${x} ${eyeY - 5} ${x + 4} ${eyeY + 1.2}`"
              />
            </g>
            <g v-else class="eyes">
              <template v-for="(x, index) in eyeXs" :key="`eye-${index}`">
                <rect
                  class="eye"
                  :x="x - 3.1"
                  :y="eyeY - (state === 'listening' ? 5 : 4.4)"
                  width="6.2"
                  :height="state === 'listening' ? 10 : 8.8"
                  rx="3.1"
                />
                <rect class="glint" :x="x - 1.1" :y="eyeY - 3.2" width="1.7" height="1.7" rx=".85" />
              </template>
            </g>

            <g v-if="brows.length" class="brows">
              <line
                v-for="(brow, index) in brows"
                :key="`brow-${index}`"
                :x1="brow[0]"
                :y1="brow[1]"
                :x2="brow[2]"
                :y2="brow[3]"
              />
            </g>

            <g class="mouth">
              <path
                v-if="state === 'happy'"
                :d="`M${mouthX - mouthW} ${mouthY} Q${mouthX} ${mouthY + 6} ${mouthX + mouthW} ${mouthY}`"
              />
              <path
                v-else-if="state === 'sad'"
                :d="`M${mouthX - mouthW} ${mouthY + 4} Q${mouthX} ${mouthY - 4} ${mouthX + mouthW} ${mouthY + 4}`"
              />
              <polyline
                v-else-if="state === 'annoyed'"
                :points="`${mouthX - mouthW},${mouthY} ${mouthX - mouthW / 2},${mouthY - 3} ${mouthX + mouthW / 2},${mouthY + 2} ${mouthX + mouthW},${mouthY - 1}`"
              />
              <circle
                v-else-if="state === 'listening' || state === 'thinking'"
                class="mouth-dot"
                :cx="mouthX"
                :cy="mouthY"
                :r="state === 'listening' ? 2.6 : 2.2"
              />
              <rect
                v-else
                class="mouth-bar"
                :class="{ talk: state === 'speaking' }"
                :x="mouthX - mouthW / 2"
                :y="mouthY - 1.5"
                :width="mouthW"
                height="3"
                rx="1.5"
              />
            </g>
          </g>
        </g>

        <g v-if="state === 'thinking'" class="orbit" aria-hidden="true">
          <circle cx="60" cy="68" r="51" />
        </g>
      </g>
    </svg>
  </div>
</template>

<script>
const SHAPES = {
  2: {
    path: 'M27 41 C27 23 43 15 62 15 C83 15 95 27 95 41 C95 55 82 65 63 79 L31 101 L97 101',
    antenna: { x: 60, y: 16 },
    visor: { x: 41, y: 22, w: 38, h: 26 },
  },
  1: {
    path: 'M37 41 L62 20 L62 101 M35 101 L89 101',
    antenna: { x: 62, y: 20 },
    visor: { x: 48, y: 30, w: 34, h: 24 },
  },
  0: {
    path: 'M60 15 C31 15 20 36 20 60 C20 84 32 105 60 105 C88 105 100 84 100 60 C100 36 89 15 60 15 Z',
    antenna: { x: 60, y: 15 },
    visor: { x: 38, y: 45, w: 44, h: 30 },
  },
}

export default {
  name: 'RoboAvatar',
  props: {
    glyph: { type: String, default: '2' },
    color: { type: String, default: '#3ee6ff' },
    state: { type: String, default: 'idle' },
    size: { type: [Number, String], default: 96 },
    seed: { type: Number, default: 1 },
    active: { type: Boolean, default: false },
    dim: { type: Boolean, default: false },
    roam: { type: Boolean, default: false },
    walking: { type: Boolean, default: false },
  },
  computed: {
    shape() {
      return SHAPES[this.glyph] || SHAPES['2']
    },
    eyeXs() {
      const width = this.shape.visor.w
      return [width * 0.34, width * 0.66]
    },
    eyeY() {
      return this.shape.visor.h * 0.41
    },
    mouthX() {
      return this.shape.visor.w / 2
    },
    mouthY() {
      return this.shape.visor.h * 0.77
    },
    mouthW() {
      return Math.min(12, this.shape.visor.w * 0.34)
    },
    brows() {
      if (!['annoyed', 'thinking', 'sad'].includes(this.state)) return []
      const [left, right] = this.eyeXs
      const y = this.eyeY - 8.4
      if (this.state === 'annoyed') {
        return [
          [left - 5, y - 2, left + 5, y + 2],
          [right - 5, y + 2, right + 5, y - 2],
        ]
      }
      if (this.state === 'sad') {
        return [
          [left - 5, y + 2, left + 5, y - 2],
          [right - 5, y - 2, right + 5, y + 2],
        ]
      }
      return [
        [left - 5, y + 1, left + 5, y + 1],
        [right - 5, y - 3, right + 5, y - 3],
      ]
    },
    style() {
      const pixels = typeof this.size === 'number' ? `${this.size}px` : this.size
      return {
        '--robo': this.color,
        '--blink': `${-((this.seed % 7) * 1.1)}s`,
        '--bob': `${-((this.seed % 5) * 0.9)}s`,
        width: pixels,
      }
    },
  },
}
</script>

<style scoped>
.robo {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  line-height: 0;
  transition: opacity 0.3s ease, transform 0.3s ease, filter 0.3s ease;
}

.robo.dim {
  opacity: 0.4;
  filter: saturate(0.45);
}

.robo .halo {
  position: absolute;
  inset: 5%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 48%,
    color-mix(in srgb, var(--robo) 42%, transparent),
    transparent 68%
  );
  opacity: 0.5;
  filter: blur(9px);
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.robo.state-thinking .halo,
.robo.state-speaking .halo {
  opacity: 0.9;
}

svg {
  position: relative;
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.body {
  transform-box: fill-box;
  transform-origin: 50% 90%;
  animation: bob 5.4s ease-in-out infinite;
  animation-delay: var(--bob);
}

.glyph {
  fill: none;
  stroke: var(--robo);
  stroke-width: 10.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 4px var(--robo));
}

.state-thinking .glyph {
  stroke-dasharray: 10 6;
  animation: march 1.4s linear infinite;
}

.state-speaking .glyph {
  filter: drop-shadow(0 0 8px var(--robo));
}

@keyframes march {
  to {
    stroke-dashoffset: -32;
  }
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3.2px);
  }
}

.state-thinking .body {
  animation-duration: 2.8s;
}

.state-speaking .body {
  animation-duration: 3.6s;
}

.shadow {
  fill: rgba(0, 0, 0, 0.55);
}

.select-ring {
  fill: none;
  stroke: var(--robo);
  stroke-width: 1.2;
  stroke-dasharray: 3 7;
  opacity: 0.45;
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 18s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.limb {
  stroke: var(--robo);
  stroke-width: 4.5;
  stroke-linecap: round;
  opacity: 0.5;
}

.antenna line {
  stroke: var(--robo);
  stroke-width: 2;
  opacity: 0.8;
}

.bulb {
  fill: var(--robo);
  filter: drop-shadow(0 0 4px var(--robo));
}

.state-thinking .bulb,
.state-speaking .bulb {
  animation: pulse 0.9s ease-in-out infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 1;
  }
}

.jets ellipse {
  fill: var(--robo);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.state-thinking .jets ellipse,
.state-speaking .jets ellipse {
  opacity: 0.35;
  animation: thrust 0.5s ease-in-out infinite alternate;
}

.jets ellipse:last-child {
  animation-delay: 0.18s;
}

.legs {
  opacity: 0.9;
}

.leg path {
  fill: none;
  stroke: var(--robo);
  stroke-width: 4.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.leg .joint {
  fill: var(--robo);
  opacity: 0.95;
  filter: drop-shadow(0 0 2px var(--robo));
}

.leg .foot {
  fill: var(--robo);
  opacity: 0.92;
  filter: drop-shadow(0 0 3px var(--robo));
}

.leg-a,
.leg-b {
  transform-box: view-box;
}

.leg-a {
  transform-origin: 48px 103px;
}

.leg-b {
  transform-origin: 72px 103px;
}

.legs.stepping .leg-a {
  animation: step-a 0.46s ease-in-out infinite alternate;
}

.legs.stepping .leg-b {
  animation: step-b 0.46s ease-in-out infinite alternate;
}

@keyframes step-a {
  from {
    transform: rotate(13deg);
  }
  to {
    transform: rotate(-13deg);
  }
}

@keyframes step-b {
  from {
    transform: rotate(-13deg);
  }
  to {
    transform: rotate(13deg);
  }
}

.robo.walking .body {
  animation-duration: 0.46s;
}

@keyframes thrust {
  from {
    transform: scaleY(0.6);
    opacity: 0.18;
  }
  to {
    transform: scaleY(1.5);
    opacity: 0.5;
  }
}

.visor .plate {
  fill: #02060c;
  stroke: color-mix(in srgb, var(--robo) 48%, #0a1520);
  stroke-width: 1.3;
}

.visor .glass {
  fill: color-mix(in srgb, var(--robo) 10%, #02060c);
}

.visor .sheen {
  fill: #ffffff;
  opacity: 0.05;
}

.bolt {
  fill: var(--robo);
  opacity: 0.55;
}

.eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: blink 7.2s infinite;
  animation-delay: var(--blink);
}

@keyframes blink {
  0%,
  95.5%,
  100% {
    transform: scaleY(1);
  }
  97.2% {
    transform: scaleY(0.08);
  }
}

.eye {
  fill: var(--robo);
  filter: drop-shadow(0 0 3px var(--robo));
}

.glint {
  fill: #ffffff;
  opacity: 0.8;
}

.eyes-happy path {
  fill: none;
  stroke: var(--robo);
  stroke-width: 2.4;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px var(--robo));
}

.brows line {
  stroke: var(--robo);
  stroke-width: 1.8;
  stroke-linecap: round;
  opacity: 0.85;
}

.mouth path,
.mouth polyline,
.mouth circle {
  fill: none;
  stroke: var(--robo);
  stroke-width: 2;
  stroke-linecap: round;
}

.mouth-dot {
  fill: var(--robo);
  stroke: none;
  filter: drop-shadow(0 0 3px var(--robo));
  animation: pulse 1.2s ease-in-out infinite alternate;
}

.mouth-bar {
  fill: var(--robo);
  filter: drop-shadow(0 0 3px var(--robo));
}

.mouth-bar.talk {
  transform-box: fill-box;
  transform-origin: center;
  animation: talk 0.24s ease-in-out infinite alternate;
}

@keyframes talk {
  from {
    transform: scaleY(1);
  }
  to {
    transform: scaleY(3.6);
  }
}

.orbit circle {
  fill: none;
  stroke: var(--robo);
  stroke-width: 1.1;
  stroke-dasharray: 2 9;
  opacity: 0.6;
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 3.2s linear infinite reverse;
}

.state-happy .halo {
  opacity: 0.85;
}
</style>
