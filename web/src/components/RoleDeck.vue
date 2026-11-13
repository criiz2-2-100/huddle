<template>
  <Teleport to="body">
    <div class="role-shell" @click.self="$emit('close')">
      <section class="deck" role="dialog" aria-modal="true" aria-label="Mission role deck">
        <header class="deck-head">
          <div class="head-copy">
            <p class="mono kicker">MISSION CONTROL · UNIT 2·2·100</p>
            <h2>Who does what</h2>
            <p class="lede">
              The unit role is locked. The mission role is yours to assign — tune the crew to the
              brief without changing who they are.
            </p>
          </div>
          <div class="presets">
            <span class="mono presets-label">CREW</span>
            <button type="button" @click="$emit('preset', 'solo')">SOLO</button>
            <button type="button" @click="$emit('preset', 'duo')">DUO</button>
            <button type="button" @click="$emit('preset', 'full')">FULL</button>
          </div>
          <button class="close" type="button" title="Close role deck" @click="$emit('close')">×</button>
        </header>

        <div class="deck-body">
          <div class="crew-list">
            <article
              v-for="robo in robos"
              :key="robo.id"
              class="seat"
              :class="{ off: !activeIds.includes(robo.id) }"
              :style="{ '--robo': robo.color }"
            >
              <RoboAvatar
                :glyph="robo.glyph"
                :color="robo.color"
                state="idle"
                :size="46"
                :seed="robo.name.length"
                :active="activeIds.includes(robo.id)"
                :dim="!activeIds.includes(robo.id)"
              />
              <div class="seat-copy">
                <div class="seat-head">
                  <strong>{{ robo.name }}</strong>
                  <span class="mono unit-lock">UNIT · {{ robo.role }}</span>
                </div>
                <select
                  :value="assignments[robo.id]"
                  :aria-label="`Mission role for ${robo.name}`"
                  @change="assign(robo.id, $event.target.value)"
                >
                  <option v-for="role in roles" :key="role.id" :value="role.id">
                    {{ role.label }} · {{ role.short }}
                  </option>
                </select>
                <p v-if="reasons[robo.id]" class="reason">{{ reasons[robo.id] }}</p>
              </div>
            </article>
          </div>

          <aside class="library">
            <div class="fit">
              <div class="fit-head">
                <div>
                  <p class="mono kicker">AUTO-FIT</p>
                  <h3>Give the deck a brief</h3>
                </div>
                <span class="mono fit-count">{{ activeIds.length }} ON DECK</span>
              </div>
              <textarea
                v-model="brief"
                rows="3"
                placeholder="What is the next mission? One or two sentences is enough."
              ></textarea>
              <div class="fit-actions">
                <button class="btn primary" type="button" :disabled="fitBusy || !brief.trim()" @click="fit">
                  {{ fitBusy ? 'FITTING…' : 'FIT ACTIVE CREW' }}
                </button>
                <span class="mono fit-note">SUGGESTION ONLY · YOU CAN EDIT</span>
              </div>
            </div>

            <div v-if="selectedRole" class="role-card" :style="{ '--role': roleColor(selectedRole.id) }">
              <div class="role-top">
                <span class="mono role-kicker">{{ selectedRole.short }}</span>
                <span class="mono role-id">{{ selectedRole.id }}</span>
              </div>
              <h3>{{ selectedRole.label }}</h3>
              <p class="role-summary">{{ selectedRole.summary }}</p>
              <p class="mono role-label">BEST FOR</p>
              <div class="role-tags">
                <span v-for="fit in selectedRole.bestFor" :key="fit">{{ fit }}</span>
              </div>
              <p class="role-creed">{{ selectedRole.creed }}</p>
            </div>

            <div class="library-list">
              <p class="mono role-label">ROLE LIBRARY · {{ roles.length }}</p>
              <button
                v-for="role in roles"
                :key="role.id"
                type="button"
                class="library-item"
                :class="{ on: selectedRole?.id === role.id }"
                :style="{ '--role': roleColor(role.id) }"
                @click="selectedRoleId = role.id"
              >
                <span>{{ role.label }}</span>
                <small>{{ role.short }}</small>
              </button>
            </div>
          </aside>
        </div>

        <footer class="deck-foot">
          <button class="text-btn" type="button" @click="$emit('defaults')">RESET TO UNIT DEFAULTS</button>
          <span class="mono foot-note">MISSION ROLES SAVE TO THIS CREW</span>
          <button class="btn primary" type="button" @click="$emit('close')">DONE</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script>
import RoboAvatar from './RoboAvatar.vue'

const ROLE_COLORS = {
  strategist: '#3ee6ff',
  engineer: '#ffc24a',
  critic: '#ff5fa8',
  researcher: '#6cf3a2',
  operator: '#ff7a59',
  archivist: '#b08bff',
  designer: '#f08cff',
  analyst: '#78d6ff',
  negotiator: '#ffb17a',
  teacher: '#b8e986',
  scout: '#ffd166',
  guardian: '#ff8f8f',
}

export default {
  name: 'RoleDeck',
  components: { RoboAvatar },
  props: {
    robos: { type: Array, default: () => [] },
    roles: { type: Array, default: () => [] },
    assignments: { type: Object, default: () => ({}) },
    activeIds: { type: Array, default: () => [] },
    lastMission: { type: String, default: '' },
    reasons: { type: Object, default: () => ({}) },
    fitBusy: Boolean,
  },
  emits: ['close', 'set-role', 'fit', 'preset', 'defaults'],
  data() {
    return {
      selectedRoleId: '',
      brief: this.lastMission || '',
    }
  },
  computed: {
    selectedRole() {
      return this.roles.find((role) => role.id === this.selectedRoleId) || this.roles[0] || null
    },
  },
  watch: {
    lastMission(value) {
      if (!this.brief.trim()) this.brief = value || ''
    },
    roles: {
      immediate: true,
      handler() {
        if (!this.selectedRoleId) this.selectedRoleId = this.roles[0]?.id || ''
      },
    },
  },
  methods: {
    assign(id, roleId) {
      this.selectedRoleId = roleId
      this.$emit('set-role', { id, roleId })
    },
    fit() {
      const text = this.brief.trim()
      if (text) this.$emit('fit', text)
    },
    roleColor(id) {
      return ROLE_COLORS[id] || '#5ef1c2'
    },
  },
}
</script>

<style scoped>
.role-shell {
  position: fixed;
  z-index: 90;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(2, 5, 9, 0.76);
  backdrop-filter: blur(9px);
}

.deck {
  display: flex;
  flex-direction: column;
  width: min(1120px, 100%);
  max-height: min(860px, 94vh);
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  background:
    radial-gradient(700px 320px at 22% 0%, rgba(62, 230, 255, 0.08), transparent 65%),
    linear-gradient(145deg, #09121e, #060b12 70%);
  box-shadow: 0 28px 100px rgba(0, 0, 0, 0.6);
}

.deck-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--line);
}

.head-copy {
  flex: 1;
  min-width: 0;
}

.kicker {
  margin: 0;
  color: var(--mint);
  font-size: 8px;
  letter-spacing: 0.16em;
}

h2 {
  margin: 5px 0 5px;
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -0.035em;
}

.lede {
  max-width: 560px;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.presets {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 18px;
}

.presets-label {
  margin-right: 4px;
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.12em;
}

.presets button {
  height: 27px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.presets button:hover {
  border-color: rgba(94, 241, 194, 0.45);
  color: var(--mint);
}

.close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-top: 2px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 20px;
  line-height: 1;
}

.close:hover {
  border-color: var(--line-strong);
  color: var(--text);
}

.deck-body {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
  min-height: 0;
}

.crew-list {
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px 16px 24px;
  border-right: 1px solid var(--line);
}

.seat {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.014);
}

.seat + .seat {
  margin-top: 8px;
}

.seat.off {
  opacity: 0.48;
}

.seat:hover {
  border-color: color-mix(in srgb, var(--robo) 32%, var(--line));
}

.seat-copy {
  flex: 1;
  min-width: 0;
}

.seat-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.seat-head strong {
  color: var(--robo);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.1em;
}

.unit-lock {
  overflow: hidden;
  color: #465d73;
  font-size: 7px;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

select {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--text);
  font-size: 11px;
  outline: none;
}

select:focus {
  border-color: rgba(94, 241, 194, 0.55);
}

.reason {
  margin: 6px 0 0;
  color: var(--dim);
  font-size: 9.5px;
  line-height: 1.45;
}

.library {
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 16px 18px;
}

.fit {
  padding: 13px;
  border: 1px solid rgba(94, 241, 194, 0.22);
  border-radius: 11px;
  background: rgba(94, 241, 194, 0.035);
}

.fit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.fit-head h3 {
  margin: 3px 0 0;
  font-size: 14px;
  font-weight: 600;
}

.fit-count {
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.08em;
}

textarea {
  width: 100%;
  min-height: 68px;
  margin-top: 10px;
  padding: 8px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.28);
  color: var(--text);
  font-size: 11px;
  line-height: 1.5;
  outline: none;
  resize: vertical;
}

textarea:focus {
  border-color: rgba(94, 241, 194, 0.55);
}

.fit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.fit-note {
  color: var(--dim);
  font-size: 6.8px;
  letter-spacing: 0.06em;
}

.role-card {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--role) 22%, var(--line));
  border-radius: 11px;
  background: color-mix(in srgb, var(--role) 4%, transparent);
}

.role-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.role-kicker,
.role-id,
.role-label {
  color: var(--role);
  font-size: 7px;
  letter-spacing: 0.1em;
}

.role-id {
  color: #465d73;
}

.role-card h3 {
  margin: 4px 0 5px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.role-summary {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.role-label {
  margin: 13px 0 5px;
  color: var(--dim);
}

.role-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.role-tags span {
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: #9cb0c4;
  font-size: 9px;
}

.role-creed {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  color: #7890a7;
  font-size: 10px;
  font-style: italic;
  line-height: 1.55;
}

.library-list {
  margin-top: 15px;
  padding-bottom: 4px;
}

.library-list > .role-label {
  margin: 0 0 7px;
}

.library-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  text-align: left;
}

.library-item:hover {
  background: rgba(255, 255, 255, 0.025);
}

.library-item.on {
  border-color: color-mix(in srgb, var(--role) 30%, transparent);
  background: color-mix(in srgb, var(--role) 7%, transparent);
  color: var(--role);
}

.library-item span {
  font-size: 11px;
}

.library-item small {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7px;
  letter-spacing: 0.08em;
}

.deck-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  border-top: 1px solid var(--line);
}

.text-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7.5px;
  letter-spacing: 0.08em;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.text-btn:hover {
  color: var(--muted);
}

.foot-note {
  flex: 1;
  color: var(--dim);
  font-size: 7px;
  letter-spacing: 0.08em;
  text-align: right;
}

@media (max-width: 899px) {
  .role-shell {
    padding: 0;
  }

  .deck {
    width: 100%;
    max-height: 100dvh;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }

  .deck-head {
    padding: 17px 16px 14px;
  }

  .head-copy h2 {
    font-size: 22px;
  }

  .presets {
    padding-top: 4px;
  }

  .deck-body {
    display: block;
    overflow-y: auto;
  }

  .crew-list {
    padding: 12px 16px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .library {
    padding: 14px 16px calc(20px + env(safe-area-inset-bottom));
  }

  .deck-foot {
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }

  .foot-note {
    display: none;
  }
}
</style>
