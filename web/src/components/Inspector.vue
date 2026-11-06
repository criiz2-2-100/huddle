<template>
  <aside class="inspector" :class="{ open }">
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="mono"
        :class="{ on: current === tab.id }"
        @click="$emit('update:tab', tab.id)"
      >
        {{ tab.label }}
        <span v-if="tab.id === 'crew'" class="count">{{ activeIds.length }}</span>
      </button>
      <button class="close only-narrow" title="Close panel" @click="$emit('close')">×</button>
    </div>

    <div class="scroll">
      <Stage
        v-if="current === 'stage'"
        :robos="robos"
        :active-ids="activeIds"
        :states="states"
        :speaker-id="speakerId"
        :room-name="roomName"
        :messages="messages"
        :running="running"
        :free-running="freeRunning"
        :turn-label="turnLabel"
        :live-text="liveText"
        :max-speakers="maxSpeakers"
        @toggle="$emit('toggle', $event)"
        @solo="$emit('solo', $event)"
        @free="$emit('free')"
        @stop="$emit('stop')"
      />
      <CrewPanel
        v-else-if="current === 'crew'"
        :robos="robos"
        :active-ids="activeIds"
        :robo-models="roboModels"
        :models="models"
        :memory="memory"
        :default-model="settings.model"
        @toggle="$emit('toggle', $event)"
        @set-model="$emit('set-model', $event)"
        @solo="$emit('solo', $event)"
        @clear-memory="$emit('clear-memory', $event)"
        @open-identity="$emit('open-identity', $event)"
      />
      <SetupPanel
        v-else
        :settings="settings"
        :models="models"
        :model-meta="modelMeta"
        :busy="saving"
        @save="$emit('save', $event)"
        @refresh="$emit('refresh')"
      />
    </div>
  </aside>
</template>

<script>
import Stage from './Stage.vue'
import CrewPanel from './CrewPanel.vue'
import SetupPanel from './SetupPanel.vue'

export default {
  name: 'Inspector',
  components: { Stage, CrewPanel, SetupPanel },
  props: {
    current: { type: String, default: 'stage' },
    robos: { type: Array, default: () => [] },
    activeIds: { type: Array, default: () => [] },
    roboModels: { type: Object, default: () => ({}) },
    models: { type: Array, default: () => [] },
    memory: { type: Object, default: () => ({}) },
    states: { type: Object, default: () => ({}) },
    speakerId: { type: String, default: '' },
    roomName: { type: String, default: '' },
    messages: { type: Array, default: () => [] },
    running: Boolean,
    freeRunning: Boolean,
    turnLabel: { type: String, default: '' },
    liveText: { type: String, default: '' },
    maxSpeakers: { type: Number, default: 3 },
    settings: { type: Object, required: true },
    modelMeta: { type: Object, default: () => ({}) },
    saving: Boolean,
    open: Boolean,
  },
  emits: [
    'update:tab',
    'close',
    'toggle',
    'solo',
    'set-model',
    'clear-memory',
    'open-identity',
    'save',
    'refresh',
    'free',
    'stop',
  ],
  data() {
    return {
      tabs: [
        { id: 'stage', label: 'STAGE' },
        { id: 'crew', label: 'CREW' },
        { id: 'setup', label: 'SETUP' },
      ],
    }
  },
}
</script>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: linear-gradient(180deg, rgba(9, 15, 24, 0.72), rgba(4, 7, 12, 0.4));
}

.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  padding: 14px 14px 0;
  border-bottom: 1px solid var(--line);
}

.tabs > button {
  position: relative;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--dim);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

.tabs > button:hover {
  color: var(--muted);
}

.tabs > button.on {
  border-bottom-color: var(--mint);
  color: var(--mint);
}

.count {
  display: inline-grid;
  place-items: center;
  min-width: 14px;
  height: 14px;
  margin-left: 4px;
  padding: 0 3px;
  border-radius: 7px;
  background: rgba(94, 241, 194, 0.12);
  color: var(--mint);
  font-size: 7.5px;
}

.close {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-left: auto;
  margin-bottom: 4px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 14px 24px;
}

@media (max-width: 1120px) {
  .inspector {
    position: fixed;
    z-index: 60;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, 94vw);
    border-left: 1px solid var(--line);
    background: #070d16;
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.55);
    transform: translateX(102%);
    transition: transform 0.24s ease;
  }

  .inspector.open {
    transform: none;
  }
}
</style>
