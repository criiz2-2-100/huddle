<template>
  <div class="crew">
    <p class="panel-note">
      Toggle who is on deck. Any Robo can run a different model — a fast local one for the
      engineer, a cloud reasoner for the critic.
    </p>

    <article
      v-for="robo in robos"
      :key="robo.id"
      class="card"
      :style="{ '--robo': robo.color }"
      :class="{ off: !activeIds.includes(robo.id) }"
    >
      <RoboAvatar
        :glyph="robo.glyph"
        :color="robo.color"
        state="idle"
        :size="54"
        :seed="robo.name.length"
        :active="activeIds.includes(robo.id)"
        :dim="!activeIds.includes(robo.id)"
      />
      <div class="info">
        <header>
          <strong>{{ robo.name }}</strong>
          <span class="serial mono">{{ robo.serial }}</span>
        </header>
        <p class="role">{{ robo.role }}</p>
        <p class="origin" v-if="robo.identity?.custom">
          was {{ robo.defaultName }} · self-named v{{ robo.identity.version }}
        </p>
        <p class="origin" v-if="robo.skillCount">
          {{ robo.skillCount }} craft {{ robo.skillCount === 1 ? 'skill' : 'skills' }}
          <span v-if="robo.skillSeedCount"> · {{ robo.skillSeedCount }} seed</span>
          <span v-if="robo.skillAdoptedCount"> · {{ robo.skillAdoptedCount }} adopted</span>
        </p>
        <p class="creed">{{ robo.creed }}</p>

        <div class="controls">
          <button
            class="switch"
            :class="{ on: activeIds.includes(robo.id) }"
            @click="$emit('toggle', robo.id)"
          >
            <span class="pin"></span>{{ activeIds.includes(robo.id) ? 'ON DECK' : 'BENCHED' }}
          </button>
          <select
            :value="roboModels[robo.id] || ''"
            :title="`Model for ${robo.name}`"
            @change="$emit('set-model', { id: robo.id, model: $event.target.value })"
          >
            <option value="">unit default{{ defaultModel ? ` · ${shortModel(defaultModel)}` : '' }}</option>
            <option v-for="model in models" :key="model.name" :value="model.name">
              {{ model.name }}
            </option>
          </select>
          <button class="solo" title="Talk to this Robo alone" @click="$emit('solo', robo.id)">
            1:1
          </button>
        </div>

        <button class="self" @click="$emit('open-identity', robo.id)">
          <span class="self-badge mono">SELF</span>
          <span class="self-copy">{{ identityLabel(robo) }}</span>
          <span class="self-arrow" aria-hidden="true">→</span>
        </button>

        <details v-if="notesFor(robo.id).length" class="memory">
          <summary class="mono">{{ notesFor(robo.id).length }} MEMORIES</summary>
          <ul>
            <li v-for="note in notesFor(robo.id)" :key="note.ts">{{ note.note }}</li>
          </ul>
          <button class="clear" @click="$emit('clear-memory', robo.id)">Forget these</button>
        </details>
      </div>
    </article>
  </div>
</template>

<script>
import RoboAvatar from './RoboAvatar.vue'

export default {
  name: 'CrewPanel',
  components: { RoboAvatar },
  props: {
    robos: { type: Array, default: () => [] },
    activeIds: { type: Array, default: () => [] },
    roboModels: { type: Object, default: () => ({}) },
    models: { type: Array, default: () => [] },
    memory: { type: Object, default: () => ({}) },
    defaultModel: { type: String, default: '' },
  },
  emits: ['toggle', 'set-model', 'solo', 'clear-memory', 'open-identity'],
  methods: {
    notesFor(id) {
      return this.memory[id] || []
    },
    identityLabel(robo) {
      if (robo.identity?.custom) {
        return `v${robo.identity.version} · ${robo.identity.tagline}`
      }
      return 'name, voice, quirks'
    },
    shortModel(model) {
      const name = String(model || '').replace(/:latest$/, '')
      return name.length > 20 ? `${name.slice(0, 18)}…` : name
    },
  },
}
</script>

<style scoped>
.crew {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.panel-note {
  margin: 0 0 4px;
  color: var(--dim);
  font-size: 10.5px;
  line-height: 1.55;
}

.card {
  display: flex;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.014);
  transition: 0.2s ease;
}

.card.off {
  background: transparent;
}

.card:hover {
  border-color: color-mix(in srgb, var(--robo) 30%, var(--line));
}

.card :deep(.robo) {
  margin-top: 2px;
}

.info {
  flex: 1;
  min-width: 0;
}

header {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

header strong {
  color: var(--robo);
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 0.1em;
}

.serial {
  overflow: hidden;
  color: #42566b;
  font-size: 7.5px;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role {
  margin: 1px 0 4px;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.03em;
}

.origin {
  margin: -2px 0 4px;
  color: #4d6378;
  font-family: var(--mono);
  font-size: 7.5px;
  letter-spacing: 0.04em;
}

.creed {
  margin: 0 0 8px;
  color: #6f8499;
  font-size: 10px;
  line-height: 1.5;
}

.controls {
  display: flex;
  align-items: center;
  gap: 5px;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.switch .pin {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--dim);
}

.switch.on {
  border-color: color-mix(in srgb, var(--robo) 50%, transparent);
  background: color-mix(in srgb, var(--robo) 9%, transparent);
  color: var(--robo);
}

.switch.on .pin {
  background: var(--robo);
  box-shadow: 0 0 5px var(--robo);
}

select {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8px;
  outline: none;
}

.solo {
  height: 24px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 8px;
  font-weight: 700;
}

.solo:hover {
  border-color: rgba(176, 139, 255, 0.45);
  color: var(--violet);
}

.self {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-top: 7px;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--robo) 22%, var(--line));
  border-radius: 7px;
  background: color-mix(in srgb, var(--robo) 4%, transparent);
  color: var(--muted);
  text-align: left;
}

.self:hover {
  border-color: color-mix(in srgb, var(--robo) 52%, transparent);
  background: color-mix(in srgb, var(--robo) 9%, transparent);
}

.self-badge {
  color: var(--robo);
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.self-copy {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--dim);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-arrow {
  color: var(--dim);
  font-size: 10px;
}

.memory {
  margin-top: 7px;
}

.memory summary {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.memory ul {
  margin: 6px 0;
  padding: 0 0 0 12px;
  color: #8095aa;
  font-size: 9.5px;
  line-height: 1.5;
}

.memory li {
  margin-bottom: 3px;
}

.clear {
  padding: 3px 6px;
  border: 1px solid rgba(255, 107, 107, 0.25);
  border-radius: 5px;
  background: transparent;
  color: #d98b8b;
  font-size: 8px;
}

.clear:hover {
  background: rgba(255, 107, 107, 0.08);
}
</style>
