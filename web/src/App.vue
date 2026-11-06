<template>
  <div v-if="loading" class="boot">
    <div class="boot-mark" aria-hidden="true">
      <span style="--c: #3ee6ff">2</span>
      <span style="--c: #ffc24a">1</span>
      <span style="--c: #ff5fa8">0</span>
    </div>
    <p class="mono">SPINNING UP UNIT 2·2·100</p>
  </div>

  <div v-else-if="fatal" class="boot">
    <p class="mono kicker">LINK FAILURE</p>
    <h1>Can't reach the brain.</h1>
    <p class="boot-msg">{{ fatal }}</p>
    <button class="btn primary" @click="boot">Retry connection</button>
  </div>

  <div v-else class="shell">
    <Sidebar
      :rooms="rooms"
      :current-id="room?.id || ''"
      :online="health.linked"
      :provider="health.provider"
      :open="leftOpen"
      @select="selectRoom"
      @create="newRoom"
      @rename="renameRoomById"
      @remove="removeRoomById"
    />

    <main class="main">
      <header class="topbar">
        <button class="icon-btn only-narrow" aria-label="Open huddles" @click="leftOpen = true">
          ☰
        </button>
        <div class="room-head">
          <h1>{{ room?.name || 'Huddle' }}</h1>
          <p class="mono">
            <span class="unit">2·2·100</span><span class="sep">·</span>
            {{ activeIds.length }} ON DECK<span class="sep">·</span>
            <span :class="{ live: running }">{{ running ? 'HUDDLE LIVE' : 'STANDING BY' }}</span>
          </p>
        </div>
        <div class="top-actions">
          <span class="pill" :class="health.linked ? 'ok' : 'bad'">
            <span class="led" :class="{ on: health.linked }"></span>
            {{ health.linked ? 'LINKED' : 'OFFLINE' }}
          </span>
          <span class="pill model-pill" :title="settings.model || 'No model selected'">
            {{ shortModel }}
          </span>
          <a v-if="room" class="btn ghost" :href="exportHref" download>Export</a>
          <button class="btn ghost only-narrow" @click="openInspectorTab('crew')">Crew</button>
        </div>
      </header>

      <div v-if="!health.linked" class="banner">
        <span class="mono tag">LINK DOWN</span>
        <p>
          {{
            health.provider === 'openai'
              ? 'No API key saved for the online engine.'
              : `Ollama isn't answering at ${settings.ollamaUrl || 'localhost:11434'}.`
          }}
        </p>
        <code class="mono">{{ health.provider === 'openai' ? 'setup → engine' : 'ollama serve' }}</code>
        <button class="btn ghost" @click="retryLink">Retry</button>
      </div>

      <Transcript
        :messages="room?.messages || []"
        :robos="roster"
        @prompt="send"
      />

      <Composer
        :robos="roster"
        :selected="activeIds"
        :running="running"
        :mode="mode"
        :auto-speak="Boolean(settings.autoSpeak)"
        @send="send"
        @stop="stop"
        @toggle="toggleRobo"
        @update:mode="setMode"
        @toggle-voice="toggleVoice"
      />
    </main>

    <Inspector
      :current="inspectorTab"
      :robos="roster"
      :active-ids="activeIds"
      :robo-models="settings.roboModels || {}"
      :models="models"
      :memory="memory"
      :states="states"
      :speaker-id="speakerId"
      :room-name="room?.name || ''"
      :messages="room?.messages || []"
      :running="running"
      :free-running="freeRunning"
      :turn-label="turnLabel"
      :live-text="liveText"
      :max-speakers="maxSpeakers"
      :settings="settings"
      :model-meta="modelMeta"
      :saving="savingSettings"
      :open="rightOpen"
      @update:tab="openInspectorTab"
      @close="rightOpen = false"
      @toggle="toggleRobo"
      @solo="soloRobo"
      @set-model="setRoboModel"
      @clear-memory="clearRoboMemory"
      @open-identity="openIdentity"
      @save="saveAll"
      @refresh="retryLink"
      @free="startFreeTalk"
      @stop="stop"
    />

    <div class="scrim" :class="{ show: leftOpen || rightOpen }" @click="closeDrawers"></div>

    <Transition name="toast">
      <div v-if="toast" class="toast mono">{{ toast }}</div>
    </Transition>

    <IdentityConsole
      v-if="identityOpen"
      :robos="roster"
      :room-id="room?.id || ''"
      :initial-id="identityId"
      :model="settings.model"
      :provider="health.provider"
      :linked="health.linked"
      @close="identityOpen = false"
      @updated="onIdentityUpdated"
    />
  </div>
</template>

<script>
import Sidebar from './components/Sidebar.vue'
import Transcript from './components/Transcript.vue'
import Composer from './components/Composer.vue'
import Inspector from './components/Inspector.vue'
import IdentityConsole from './components/IdentityConsole.vue'
import {
  abortRun,
  clearMemory as clearMemoryApi,
  createRoom,
  getHealth,
  getMemory,
  getModels,
  getRoom,
  getRooms,
  getRoster,
  getSettings,
  removeRoom,
  renameRoom,
  saveSettings,
  streamHuddle,
} from './api'
import { speak, stopSpeaking } from './voice'

export default {
  name: 'HuddleApp',
  components: { Sidebar, Transcript, Composer, Inspector, IdentityConsole },
  data() {
    return {
      roster: [],
      settings: null,
      rooms: [],
      room: null,
      models: [],
      modelMeta: { linked: false, error: '', suggested: '' },
      health: { linked: false, provider: 'ollama', count: 0, model: '' },
      memory: {},
      loading: true,
      fatal: '',
      running: false,
      runId: '',
      controller: null,
      wasAborted: false,
      streamingMessageId: '',
      states: {},
      speakerId: '',
      turnLabel: '',
      liveText: '',
      mode: 'huddle',
      freeRunning: false,
      inspectorTab: 'stage',
      rightOpen: false,
      leftOpen: false,
      toast: '',
      toastTimer: 0,
      savingSettings: false,
      identityOpen: false,
      identityId: '',
    }
  },
  computed: {
    activeIds() {
      return this.settings?.active || []
    },
    roboById() {
      return Object.fromEntries(this.roster.map((robo) => [robo.id, robo]))
    },
    shortModel() {
      const name = this.settings?.model || ''
      if (!name) return 'NO MODEL'
      const short = name.replace(/:latest$/, '')
      return short.length > 26 ? `${short.slice(0, 24)}…` : short
    },
    exportHref() {
      return this.room ? `/api/export/${this.room.id}` : '#'
    },
    maxSpeakers() {
      return this.settings?.maxSpeakers || 3
    },
  },
  mounted() {
    this.boot()
    window.addEventListener('keydown', this.onKeydown)
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown)
    window.clearTimeout(this.toastTimer)
    this.controller?.abort()
  },
  methods: {
    /* ---------------------------------------------------------------- */
    /* Boot and rooms                                                    */
    /* ---------------------------------------------------------------- */

    async boot() {
      this.loading = true
      this.fatal = ''
      try {
        const [rosterRes, settings, modelsRes, roomsRes, health, memoryRes] = await Promise.all([
          getRoster(),
          getSettings(),
          getModels(),
          getRooms(),
          getHealth(),
          getMemory(),
        ])

        this.roster = rosterRes.robos || []
        this.models = modelsRes.models || []
        this.modelMeta = {
          linked: Boolean(modelsRes.linked),
          error: modelsRes.error || '',
          suggested: modelsRes.suggested || '',
        }
        this.rooms = roomsRes.rooms || []
        this.health = health
        this.memory = memoryRes.memory || {}
        this.states = Object.fromEntries(this.roster.map((robo) => [robo.id, 'idle']))

        let resolved = settings
        if (!resolved.model && modelsRes.suggested) {
          resolved = await saveSettings({ model: modelsRes.suggested })
        }
        this.settings = resolved

        if (this.rooms.length) {
          await this.openRoom(this.rooms[0].id, true)
        } else {
          const room = await createRoom('Huddle 01')
          this.room = room
          await this.refreshRooms()
        }

        if (!health.linked) {
          this.toastNow(
            health.provider === 'openai'
              ? 'No online key yet — open Setup.'
              : 'Ollama is offline. Run `ollama serve`.',
          )
        }
      } catch (error) {
        this.fatal = error.message
      } finally {
        this.loading = false
      }
    },

    async refreshRooms() {
      try {
        const { rooms } = await getRooms()
        this.rooms = rooms
      } catch {
        /* keep the current list */
      }
    },

    async openRoom(id, initial = false) {
      if (!initial && this.running) {
        this.toastNow('Stop the huddle before switching rooms.')
        return
      }
      try {
        const room = await getRoom(id)
        this.room = room
        this.states = Object.fromEntries(this.roster.map((robo) => [robo.id, 'idle']))
        this.speakerId = ''
        this.turnLabel = ''
        this.liveText = ''
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    selectRoom(id) {
      this.leftOpen = false
      if (id === this.room?.id) return
      this.openRoom(id)
    },

    async newRoom() {
      if (this.running) {
        this.toastNow('Stop the huddle first.')
        return
      }
      try {
        const name = `Huddle ${String(this.rooms.length + 1).padStart(2, '0')}`
        const room = await createRoom(name)
        await this.refreshRooms()
        await this.openRoom(room.id)
        this.leftOpen = false
        this.toastNow(`${room.name} is open.`)
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async renameRoomById({ id, name }) {
      try {
        await renameRoom(id, name)
        if (this.room?.id === id) this.room.name = name
        await this.refreshRooms()
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async removeRoomById(id) {
      if (this.running) {
        this.toastNow('Stop the huddle first.')
        return
      }
      if (!window.confirm('Delete this huddle and its transcript?')) return
      try {
        await removeRoom(id)
        await this.refreshRooms()
        if (this.room?.id !== id) return
        if (this.rooms.length) await this.openRoom(this.rooms[0].id)
        else {
          const room = await createRoom('Huddle 01')
          await this.refreshRooms()
          await this.openRoom(room.id)
        }
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async refreshRoom(roomId) {
      if (!roomId) return
      try {
        const fresh = await getRoom(roomId)
        if (!this.running && this.room?.id === roomId) this.room = fresh
      } catch {
        /* keep what is on screen */
      }
    },

    /* ---------------------------------------------------------------- */
    /* The huddle                                                        */
    /* ---------------------------------------------------------------- */

    resolveTargets(text) {
      const haystack = ` ${String(text || '').toLowerCase()} `
      const mentioned = this.roster.filter((robo) => {
        const name = robo.name.toLowerCase()
        return (
          new RegExp(`(^|\\s)@${name}(\\b|$)`).test(haystack) ||
          new RegExp(`(^|\\s)@${robo.id}(\\b|$)`).test(haystack)
        )
      })
      const pool = mentioned.length
        ? mentioned
        : this.roster.filter((robo) => this.activeIds.includes(robo.id))
      return pool.map((robo) => robo.id)
    },

    async startFreeTalk() {
      if (this.running || !this.room) return
      const targets = this.activeIds.slice()
      if (targets.length < 2) {
        this.toastNow('Free talk needs at least two Robos on deck.')
        return
      }

      this.running = true
      this.freeRunning = true
      this.wasAborted = false
      this.runId = ''
      this.liveText = ''
      this.turnLabel = ''
      this.speakerId = ''
      this.states = Object.fromEntries(this.roster.map((robo) => [robo.id, 'idle']))

      const controller = new AbortController()
      this.controller = controller
      const roomId = this.room.id

      try {
        this.toastNow('Free roam live — the floor is open.')
        await streamHuddle(
          { roomId, text: '', targets, mode: 'free' },
          { signal: controller.signal, onEvent: this.handleEvent },
        )
      } catch (error) {
        if (error.name === 'AbortError') {
          /* stopped by the operator */
        } else {
          this.toastNow(error.message)
          this.pushSystem(`Free talk failed: ${error.message}`)
        }
      } finally {
        this.running = false
        this.freeRunning = false
        this.controller = null
        this.speakerId = ''
        this.turnLabel = ''
        this.streamingMessageId = ''
        this.liveText = ''
        if (this.wasAborted) await new Promise((resolve) => setTimeout(resolve, 700))
        await this.refreshRoom(roomId)
        await this.refreshRooms()
      }
    },

    async send(text) {
      const clean = String(text || '').trim()
      if (!clean || this.running || !this.room) return
      const targets = this.resolveTargets(clean)
      if (!targets.length) {
        this.toastNow('Pick at least one Robo on deck.')
        return
      }

      this.running = true
      this.wasAborted = false
      this.runId = ''
      this.liveText = ''
      this.turnLabel = ''
      this.speakerId = ''
      this.states = Object.fromEntries(this.roster.map((robo) => [robo.id, 'idle']))
      this.room.messages.push({
        id: `local_${Date.now()}`,
        role: 'user',
        text: clean,
        ts: Date.now(),
      })

      const controller = new AbortController()
      this.controller = controller
      const roomId = this.room.id

      try {
        await streamHuddle(
          { roomId, text: clean, targets, mode: this.mode },
          { signal: controller.signal, onEvent: this.handleEvent },
        )
      } catch (error) {
        if (error.name === 'AbortError') {
          /* stopped by the operator */
        } else {
          this.toastNow(error.message)
          this.pushSystem(`Transmission failed: ${error.message}`)
        }
      } finally {
        this.running = false
        this.controller = null
        this.speakerId = ''
        this.turnLabel = ''
        this.streamingMessageId = ''
        this.liveText = ''
        if (this.wasAborted) await new Promise((resolve) => setTimeout(resolve, 700))
        await this.refreshRoom(roomId)
        await this.refreshRooms()
      }
    },

    handleEvent(event) {
      if (!this.room) return

      if (event.type === 'run') {
        this.runId = event.runId
        return
      }

      if (event.type === 'user_message') {
        const localIndex = this.room.messages.findIndex((message) =>
          String(message.id).startsWith('local_'),
        )
        if (localIndex >= 0) this.room.messages.splice(localIndex, 1, event.message)
        else if (!this.room.messages.some((message) => message.id === event.message.id)) {
          this.room.messages.push(event.message)
        }
        return
      }

      if (event.type === 'turn_start') {
        this.room.messages = this.room.messages.filter((message) => !message.streaming)
        this.states[event.roboId] = 'thinking'
        this.speakerId = event.roboId
        this.turnLabel = event.endless ? `${event.turn} / ∞` : `${event.turn} / ${event.total}`
        this.liveText = ''
        const message = {
          id: `live_${event.roboId}_${Date.now()}`,
          role: 'robo',
          roboId: event.roboId,
          text: '',
          model: event.model,
          tools: [],
          ts: Date.now(),
          streaming: true,
        }
        this.room.messages.push(message)
        this.streamingMessageId = message.id
        return
      }

      if (event.type === 'token') {
        const message = this.room.messages.find((item) => item.id === this.streamingMessageId)
        if (message) {
          message.text += event.text
          this.liveText = message.text.slice(-280)
          this.states[event.roboId] = 'speaking'
        }
        return
      }

      if (event.type === 'tool_start') {
        const message = this.room.messages.find((item) => item.id === this.streamingMessageId)
        if (!message) return
        if (!message.tools) message.tools = []
        message.tools.push({
          name: event.call.name,
          label: event.call.name,
          args: event.call.args,
          result: '',
          ok: true,
          pending: true,
        })
        return
      }

      if (event.type === 'tool_end') {
        const message = this.room.messages.find((item) => item.id === this.streamingMessageId)
        if (!message) return
        if (!message.tools) message.tools = []
        const pending = message.tools.find((tool) => tool.pending)
        if (pending) Object.assign(pending, event.card, { pending: false })
        else message.tools.push({ ...event.card, pending: false })
        return
      }

      if (event.type === 'turn_end') {
        const index = this.room.messages.findIndex((item) => item.id === this.streamingMessageId)
        const final = { ...event.message, streaming: false }
        if (index >= 0) this.room.messages.splice(index, 1, final)
        else this.room.messages.push(final)
        this.states[event.roboId] = 'happy'
        this.streamingMessageId = ''
        this.speakerId = ''
        const roboId = event.roboId
        setTimeout(() => {
          if (this.states[roboId] === 'happy') this.states[roboId] = 'idle'
        }, 3000)
        if (this.settings?.autoSpeak) this.speakMessage(final)
        return
      }

      if (event.type === 'note') {
        if (!this.room.messages.some((message) => message.id === event.message.id)) {
          this.room.messages.push(event.message)
        }
        return
      }

      if (event.type === 'turn_error') {
        this.toastNow(event.message)
        return
      }

      if (event.type === 'error') {
        this.toastNow(event.message)
        return
      }

      if (event.type === 'aborted') {
        this.pushSystem('Huddle stopped by the Operator.')
      }
    },

    stop() {
      if (!this.running) return
      this.wasAborted = true
      this.toastNow('Stopping the huddle…')
      this.controller?.abort()
      if (this.runId) abortRun(this.runId)
      stopSpeaking()
    },

    pushSystem(text) {
      if (!this.room) return
      this.room.messages.push({
        id: `sys_${Date.now()}`,
        role: 'system',
        text,
        ts: Date.now(),
      })
    },

    speakMessage(message) {
      const robo = this.roboById[message.roboId]
      if (!robo) return
      speak(message.text, {
        pitch: robo.pitch,
        rate: robo.rate,
        interrupt: false,
        onState: (talking) => {
          if (this.running) return
          this.states[robo.id] = talking ? 'speaking' : 'happy'
          if (!talking) {
            setTimeout(() => {
              if (this.states[robo.id] === 'happy') this.states[robo.id] = 'idle'
            }, 2200)
          }
        },
      })
    },

    /* ---------------------------------------------------------------- */
    /* Crew and settings                                                 */
    /* ---------------------------------------------------------------- */

    setMode(mode) {
      this.mode = mode === 'debate' ? 'debate' : 'huddle'
    },

    async toggleRobo(id) {
      const current = this.activeIds
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      if (!next.length) {
        this.toastNow('Keep at least one Robo on deck.')
        return
      }
      const ordered = this.roster.map((robo) => robo.id).filter((roboId) => next.includes(roboId))
      try {
        this.settings = await saveSettings({ active: ordered })
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async soloRobo(id) {
      const robo = this.roboById[id]
      if (!robo) return
      try {
        this.settings = await saveSettings({ active: [id] })
        this.mode = 'huddle'
        this.toastNow(`1:1 with ${robo.name}.`)
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async setRoboModel({ id, model }) {
      try {
        this.settings = await saveSettings({
          roboModels: { ...(this.settings.roboModels || {}), [id]: model || null },
        })
        this.toastNow(`${this.roboById[id]?.name || 'Robo'} now runs ${model || 'the unit default'}.`)
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async clearRoboMemory(id) {
      const robo = this.roboById[id]
      if (!window.confirm(`Forget everything ${robo?.name || 'this Robo'} has saved?`)) return
      try {
        const result = await clearMemoryApi(id)
        this.memory = result.memory || {}
        this.toastNow(`${robo?.name || 'Robo'} memory wiped.`)
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async toggleVoice() {
      try {
        const next = await saveSettings({ autoSpeak: !this.settings.autoSpeak })
        this.settings = next
        if (!next.autoSpeak) stopSpeaking()
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    async saveAll(patch) {
      this.savingSettings = true
      try {
        this.settings = await saveSettings(patch)
        await this.refreshModels(true)
        this.toastNow('Setup saved.')
      } catch (error) {
        this.toastNow(error.message)
      } finally {
        this.savingSettings = false
      }
    },

    async refreshModels(silent = false) {
      try {
        const [modelsRes, health] = await Promise.all([getModels(), getHealth()])
        this.models = modelsRes.models || []
        this.modelMeta = {
          linked: Boolean(modelsRes.linked),
          error: modelsRes.error || '',
          suggested: modelsRes.suggested || '',
        }
        this.health = health
        if (!silent) {
          this.toastNow(
            modelsRes.linked
              ? `${this.models.length} models on the shelf.`
              : modelsRes.error || 'Engine offline.',
          )
        }
      } catch (error) {
        if (!silent) this.toastNow(error.message)
      }
    },

    retryLink() {
      return this.refreshModels(false)
    },

    openInspectorTab(tab) {
      this.inspectorTab = tab
      this.rightOpen = true
    },

    openIdentity(id) {
      this.identityId = id
      this.identityOpen = true
    },

    async onIdentityUpdated() {
      await this.refreshRoster()
      await this.refreshRooms()
    },

    async refreshRoster() {
      try {
        const { robos } = await getRoster()
        this.roster = robos || []
      } catch (error) {
        this.toastNow(error.message)
      }
    },

    closeDrawers() {
      this.leftOpen = false
      this.rightOpen = false
    },

    onKeydown(event) {
      if (event.key === 'Escape') this.closeDrawers()
    },

    toastNow(text) {
      this.toast = String(text || '')
      window.clearTimeout(this.toastTimer)
      this.toastTimer = window.setTimeout(() => {
        this.toast = ''
      }, 4200)
    },
  },
}
</script>

<style scoped>
.shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr) 364px;
  height: 100%;
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
  background: rgba(4, 7, 12, 0.28);
}

.topbar {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 14px;
  height: 64px;
  padding: 0 22px;
  border-bottom: 1px solid var(--line);
  background: rgba(5, 9, 15, 0.6);
  backdrop-filter: blur(10px);
}

.room-head {
  min-width: 0;
}

.room-head h1 {
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-head p {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 3px 0 0;
  color: var(--dim);
  font-size: 8.5px;
  letter-spacing: 0.08em;
}

.room-head p .unit {
  color: var(--mint);
}

.room-head p .live {
  color: var(--amber);
}

.sep {
  opacity: 0.45;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
}

.model-pill {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  padding: 8px 22px;
  border-bottom: 1px solid rgba(255, 107, 107, 0.25);
  background: rgba(255, 107, 107, 0.055);
  color: #e7bbbb;
  font-size: 11px;
}

.banner .tag {
  color: #ff8f8f;
  font-size: 8px;
  letter-spacing: 0.12em;
}

.banner p {
  flex: 1;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner code {
  padding: 2px 6px;
  border: 1px solid rgba(255, 107, 107, 0.24);
  border-radius: 5px;
  color: #ffb0b0;
  font-size: 9px;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: none;
  background: rgba(2, 5, 9, 0.62);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.toast {
  position: fixed;
  z-index: 100;
  bottom: 24px;
  left: 50%;
  max-width: min(520px, 90vw);
  padding: 9px 15px;
  border: 1px solid var(--line-strong);
  border-radius: 99px;
  background: rgba(9, 15, 24, 0.97);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.03em;
  text-align: center;
  transform: translateX(-50%);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}

.boot {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 30px;
  text-align: center;
}

.boot-mark {
  display: flex;
  gap: 6px;
}

.boot-mark span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 47px;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--c) 8%, transparent);
  color: var(--c);
  font-family: var(--mono);
  font-size: 24px;
  font-weight: 700;
  box-shadow: 0 0 20px color-mix(in srgb, var(--c) 16%, transparent);
}

.boot-mark span:nth-child(2) {
  transform: translateY(-5px);
}

.boot > p.mono {
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.18em;
  animation: pulse 1.4s ease-in-out infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 1;
  }
}

.boot .kicker {
  color: var(--danger);
}

.boot h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.02em;
}

.boot-msg {
  max-width: 480px;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1399px) {
  .shell {
    grid-template-columns: 208px minmax(0, 1fr) 336px;
  }

  .topbar {
    padding: 0 16px;
  }
}

@media (max-width: 1120px) {
  .shell {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  .main {
    border-right: 0;
  }

  .scrim {
    display: block;
    pointer-events: none;
  }

  .scrim.show {
    pointer-events: auto;
    opacity: 1;
  }
}

@media (max-width: 899px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .main {
    border-left: 0;
  }

  .topbar {
    gap: 8px;
    padding: 0 12px;
    height: 58px;
  }

  .room-head h1 {
    max-width: 38vw;
    font-size: 13px;
  }

  .room-head p {
    font-size: 7.5px;
  }

  .top-actions .model-pill {
    display: none;
  }

  .banner {
    padding: 7px 12px;
    flex-wrap: wrap;
  }

  .banner p {
    flex-basis: 100%;
    white-space: normal;
    order: 3;
  }
}
</style>
