<template>
  <div class="robo" :class="[`state-${state}`, { active, dim, roam, walking }]" :style="style">
    <span class="halo" aria-hidden="true"></span>
    <svg
      viewBox="0 0 120 154"
      role="img"
      :aria-label="`${state} Robo wearing a shirt with the digit ${glyph}`"
    >
      <ellipse class="shadow" cx="60" cy="146" rx="25" ry="4.2" />

      <g class="body">
        <g class="legs" :class="{ stepping: walking }" aria-hidden="true">
          <g class="leg leg-a">
            <path class="leg-shell" d="M50 105 L47 125 L49 137" />
            <circle class="knee" cx="47.5" cy="120" r="3.4" />
            <rect class="foot" x="39" y="136" width="20" height="8" rx="4" />
            <path class="sole" d="M43 141.5 H55" />
          </g>
          <g class="leg leg-b">
            <path class="leg-shell" d="M70 105 L73 125 L71 137" />
            <circle class="knee" cx="72.5" cy="120" r="3.4" />
            <rect class="foot" x="61" y="136" width="20" height="8" rx="4" />
            <path class="sole" d="M65 141.5 H77" />
          </g>
        </g>

        <g class="arms" aria-hidden="true">
          <g class="arm arm-a">
            <path class="arm-shell" d="M34 76 Q27 86 30 96" />
            <circle class="arm-joint" cx="34" cy="76" r="3.8" />
            <circle class="elbow" cx="30" cy="95" r="3.1" />
            <rect class="hand" x="25.5" y="97" width="9" height="10" rx="4" />
          </g>
          <g class="arm arm-b">
            <path class="arm-shell" d="M86 76 Q93 86 90 96" />
            <circle class="arm-joint" cx="86" cy="76" r="3.8" />
            <circle class="elbow" cx="90" cy="95" r="3.1" />
            <rect class="hand" x="85.5" y="97" width="9" height="10" rx="4" />
          </g>
        </g>

        <rect class="hips" x="47" y="101" width="26" height="11" rx="5.5" />

        <rect class="neck" x="53.5" y="58" width="13" height="11" rx="4" />

        <path class="shirt-sleeve sleeve-a" d="M41 66 Q31 67 27 76 L34 87 L42 82 Z" />
        <path class="shirt-sleeve sleeve-b" d="M79 66 Q89 67 93 76 L86 87 L78 82 Z" />
        <path class="shirt" d="M40 66 Q60 58 80 66 L85 102 Q60 110 35 102 Z" />

        <path class="collar" d="M51 66 Q60 72 69 66" />
        <text class="jersey-number" x="60" y="96" text-anchor="middle">{{ glyph }}</text>
        <path class="shirt-hem" d="M36 102 Q60 109 84 102" />

        <ellipse
          v-if="active"
          class="select-ring"
          cx="60"
          cy="85"
          rx="45"
          ry="57"
        />

        <g class="head">
          <rect class="ear" x="29" y="33" width="7" height="14" rx="3" />
          <rect class="ear" x="84" y="33" width="7" height="14" rx="3" />
          <rect class="head-shell" x="33" y="16" width="54" height="45" rx="17" />
          <path class="head-shine" d="M42 22 Q60 17 78 22" />
          <circle class="head-bolt" cx="40" cy="21.5" r="1.15" />
          <circle class="head-bolt" cx="80" cy="21.5" r="1.15" />

          <line class="antenna-stem" x1="60" y1="17" x2="60" y2="9" />
          <circle class="antenna-base" cx="60" cy="17" r="2.1" />
          <circle class="bulb" cx="60" cy="6.2" r="3" />

          <g class="visor" transform="translate(39 24)">
            <rect class="plate" x="0" y="0" width="42" height="29" rx="10" />
            <rect class="glass" x="2.4" y="2.4" width="37.2" height="24.2" rx="8" />
            <rect class="sheen" x="4.5" y="4" width="32" height="4.5" rx="2.25" />
            <circle class="bolt" cx="5" cy="5" r="1" />
            <circle class="bolt" cx="37" cy="5" r="1" />

            <g class="face">
              <g v-if="state === 'happy'" class="eyes eyes-happy">
                <path
                  v-for="(x, index) in eyeXs"
                  :key="`happy-${index}`"
                  :d="`M${x - 3.8} ${eyeY + 1.2} Q${x} ${eyeY - 4.6} ${x + 3.8} ${eyeY + 1.2}`"
                />
              </g>
              <g v-else class="eyes">
                <template v-for="(x, index) in eyeXs" :key="`eye-${index}`">
                  <rect
                    class="eye"
                    :x="x - 2.9"
                    :y="eyeY - (state === 'listening' ? 5 : 4.2)"
                    width="5.8"
                    :height="state === 'listening' ? 10 : 8.4"
                    rx="2.9"
                  />
                  <rect class="glint" :x="x - 1" :y="eyeY - 3" width="1.6" height="1.6" rx=".8" />
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
                  :d="`M${mouthX - mouthW} ${mouthY} Q${mouthX} ${mouthY + 5.5} ${mouthX + mouthW} ${mouthY}`"
                />
                <path
                  v-else-if="state === 'sad'"
                  :d="`M${mouthX - mouthW} ${mouthY + 3.5} Q${mouthX} ${mouthY - 3.5} ${mouthX + mouthW} ${mouthY + 3.5}`"
                />
                <polyline
                  v-else-if="state === 'annoyed'"
                  :points="`${mouthX - mouthW},${mouthY} ${mouthX - mouthW / 2},${mouthY - 2.8} ${mouthX + mouthW / 2},${mouthY + 1.8} ${mouthX + mouthW},${mouthY - 1}`"
                />
                <circle
                  v-else-if="state === 'listening' || state === 'thinking'"
                  class="mouth-dot"
                  :cx="mouthX"
                  :cy="mouthY"
                  :r="state === 'listening' ? 2.4 : 2"
                />
                <rect
                  v-else
                  class="mouth-bar"
                  :class="{ talk: state === 'speaking' }"
                  :x="mouthX - mouthW / 2"
                  :y="mouthY - 1.4"
                  :width="mouthW"
                  height="2.8"
                  rx="1.4"
                />
              </g>
            </g>
          </g>
        </g>

        <g v-if="state === 'thinking'" class="orbit" aria-hidden="true">
          <circle cx="60" cy="74" r="54" />
        </g>
      </g>
    </svg>
  </div>
</template>

<script>
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
    eyeXs() {
      return [14.3, 27.7]
    },
    eyeY() {
      return 11.9
    },
    mouthX() {
      return 21
    },
    mouthY() {
      return 22.4
    },
    mouthW() {
      return 10.5
    },
    brows() {
      if (!['annoyed', 'thinking', 'sad'].includes(this.state)) return []
      const [left, right] = this.eyeXs
      const y = 3.5
      if (this.state === 'annoyed') {
        return [
          [left - 4.6, y - 1.8, left + 4.6, y + 1.8],
          [right - 4.6, y + 1.8, right + 4.6, y - 1.8],
        ]
      }
      if (this.state === 'sad') {
        return [
          [left - 4.6, y + 1.8, left + 4.6, y - 1.8],
          [right - 4.6, y - 1.8, right + 4.6, y + 1.8],
        ]
      }
      return [
        [left - 4.6, y + 0.8, left + 4.6, y + 0.8],
        [right - 4.6, y - 2.4, right + 4.6, y - 2.4],
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
  inset: 9% 13% 5%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    color-mix(in srgb, var(--robo) 36%, transparent),
    transparent 68%
  );
  opacity: 0.48;
  filter: blur(9px);
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.robo.state-thinking .halo,
.robo.state-speaking .halo {
  opacity: 0.88;
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

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2.6px);
  }
}

.state-thinking .body {
  animation-duration: 2.8s;
}

.state-speaking .body {
  animation-duration: 3.6s;
}

.shadow {
  fill: rgba(0, 0, 0, 0.46);
}

/* Limbs */
.leg-shell {
  fill: none;
  stroke: #718494;
  stroke-width: 8.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.knee {
  fill: #2f3f4b;
  stroke: #9badba;
  stroke-width: 1.1;
}

.foot {
  fill: #2c3a45;
  stroke: #879aa8;
  stroke-width: 1;
}

.sole {
  fill: none;
  stroke: var(--robo);
  stroke-width: 1.6;
  stroke-linecap: round;
  opacity: 0.9;
}

.arm-shell {
  fill: none;
  stroke: #a9bac7;
  stroke-width: 8;
  stroke-linecap: round;
}

.arm-joint,
.elbow {
  fill: #465965;
  stroke: #a9bac7;
  stroke-width: 0.9;
}

.hand {
  fill: #354652;
  stroke: #8497a5;
  stroke-width: 1;
}

.hips {
  fill: #2c3a45;
  stroke: #667b8b;
  stroke-width: 1;
}

.leg-a,
.leg-b {
  transform-box: view-box;
}

.leg-a {
  transform-origin: 50px 105px;
}

.leg-b {
  transform-origin: 70px 105px;
}

.legs.stepping .leg-a {
  animation: step-a 0.46s ease-in-out infinite alternate;
}

.legs.stepping .leg-b {
  animation: step-b 0.46s ease-in-out infinite alternate;
}

@keyframes step-a {
  from {
    transform: rotate(12deg);
  }
  to {
    transform: rotate(-12deg);
  }
}

@keyframes step-b {
  from {
    transform: rotate(-12deg);
  }
  to {
    transform: rotate(12deg);
  }
}

.robo.walking .body {
  animation-duration: 0.46s;
}

/* Shirt */
.neck {
  fill: #334550;
  stroke: #8195a4;
  stroke-width: 1;
}

.shirt-sleeve,
.shirt {
  fill: color-mix(in srgb, var(--robo) 88%, #0c1821);
  stroke: color-mix(in srgb, var(--robo) 65%, #09131b);
  stroke-width: 1.1;
}

.shirt {
  stroke-width: 1.2;
}

.collar {
  fill: none;
  stroke: color-mix(in srgb, var(--robo) 24%, #f4f9fc);
  stroke-width: 2.2;
  stroke-linecap: round;
}

.shirt-hem {
  fill: none;
  stroke: color-mix(in srgb, var(--robo) 48%, #071119);
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.8;
}

.jersey-number {
  fill: #06121b;
  font-family: var(--mono);
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.09);
  stroke-width: 0.7px;
}

.state-speaking .jersey-number,
.state-happy .jersey-number {
  stroke: rgba(255, 255, 255, 0.2);
}

/* Head */
.ear {
  fill: #2e3d48;
  stroke: #879aa8;
  stroke-width: 1;
}

.head-shell {
  fill: #dce6ed;
  stroke: #8fa3b1;
  stroke-width: 1.2;
}

.head-shine {
  fill: none;
  stroke: rgba(255, 255, 255, 0.72);
  stroke-width: 1.5;
  stroke-linecap: round;
}

.head-bolt {
  fill: #8297a6;
}

.antenna-stem {
  stroke: #9eb0bc;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.antenna-base {
  fill: #536873;
}

.bulb {
  fill: var(--robo);
  stroke: color-mix(in srgb, var(--robo) 55%, white);
  stroke-width: 0.8;
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

.visor .plate {
  fill: #03090f;
  stroke: color-mix(in srgb, var(--robo) 42%, #52646f);
  stroke-width: 1.2;
}

.visor .glass {
  fill: color-mix(in srgb, var(--robo) 9%, #030b12);
}

.visor .sheen {
  fill: #ffffff;
  opacity: 0.07;
}

.bolt {
  fill: var(--robo);
  opacity: 0.52;
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
  filter: drop-shadow(0 0 2.4px var(--robo));
}

.glint {
  fill: #ffffff;
  opacity: 0.8;
}

.eyes-happy path {
  fill: none;
  stroke: var(--robo);
  stroke-width: 2.2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 2.4px var(--robo));
}

.brows line {
  stroke: var(--robo);
  stroke-width: 1.7;
  stroke-linecap: round;
  opacity: 0.85;
}

.mouth path,
.mouth polyline,
.mouth circle {
  fill: none;
  stroke: var(--robo);
  stroke-width: 1.9;
  stroke-linecap: round;
}

.mouth-dot {
  fill: var(--robo);
  stroke: none;
  filter: drop-shadow(0 0 2.4px var(--robo));
  animation: pulse 1.2s ease-in-out infinite alternate;
}

.mouth-bar {
  fill: var(--robo);
  filter: drop-shadow(0 0 2.4px var(--robo));
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
    transform: scaleY(3);
  }
}

.select-ring {
  fill: none;
  stroke: var(--robo);
  stroke-width: 1.2;
  stroke-dasharray: 3 7;
  opacity: 0.4;
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 18s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.orbit circle {
  fill: none;
  stroke: var(--robo);
  stroke-width: 1.1;
  stroke-dasharray: 2 9;
  opacity: 0.55;
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 3.2s linear infinite reverse;
}

.state-happy .halo {
  opacity: 0.82;
}
</style>
