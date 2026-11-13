<template>
  <form class="setup" @submit.prevent="submit">
    <section>
      <h3 class="mono">ENGINE</h3>
      <div class="seg">
        <button
          type="button"
          :class="{ on: form.provider === 'ollama' }"
          @click="form.provider = 'ollama'"
        >
          OLLAMA
        </button>
        <button
          type="button"
          :class="{ on: form.provider === 'openai' }"
          @click="form.provider = 'openai'"
        >
          OPENAI-COMPATIBLE
        </button>
      </div>

      <template v-if="form.provider === 'ollama'">
        <label class="field">
          <span>Ollama URL</span>
          <input v-model="form.ollamaUrl" spellcheck="false" placeholder="http://localhost:11434" />
        </label>
        <p class="note">
          Local models run on your machine, free. <code>:cloud</code> tags route through your
          signed-in Ollama account — run <code>ollama signin</code> first. If a cloud turn fails,
          Rally Up falls back to an installed local model. Growth defaults to local so it works
          offline; override either slot under GROWTH MODELS.
        </p>
      </template>

      <template v-else>
        <label class="field">
          <span>Base URL</span>
          <input
            v-model="form.openaiBaseUrl"
            spellcheck="false"
            placeholder="https://openrouter.ai/api/v1"
          />
        </label>
        <label class="field">
          <span>API key</span>
          <input
            v-model="keyDraft"
            type="password"
            autocomplete="off"
            :placeholder="settings.hasKey ? '•••• saved — type to replace' : 'sk-…'"
          />
        </label>
        <div class="key-row">
          <span class="note">
            {{ settings.hasKey ? 'A key is stored locally.' : 'Stored locally, never shown again.' }}
          </span>
          <button
            v-if="settings.hasKey"
            type="button"
            class="text-btn"
            @click="clearKey = !clearKey"
          >
            {{ clearKey ? 'keep key' : 'clear key' }}
          </button>
        </div>
        <p class="note">
          Any OpenAI-compatible endpoint works: OpenRouter free models, Groq, LM Studio, llama.cpp,
          vLLM.
        </p>
      </template>

      <label class="field">
        <span>Unit default model</span>
        <input
          v-model="form.model"
          list="roboats-models"
          spellcheck="false"
          placeholder="llama3.2:latest"
        />
        <datalist id="roboats-models">
          <option v-for="model in models" :key="model.name" :value="model.name" />
        </datalist>
      </label>

      <div class="row">
        <button type="button" class="text-btn" @click="$emit('refresh')">↻ refresh shelf</button>
        <span class="engine-state mono" :class="{ bad: !modelMeta.linked }">
          {{ modelMeta.linked ? `${models.length} MODELS LINKED` : (modelMeta.error || 'ENGINE OFFLINE') }}
        </span>
      </div>
    </section>

    <section>
      <h3 class="mono">GROWTH MODELS</h3>
      <label class="field">
        <span>Identity reflection</span>
        <select v-model="form.growthModels.identity">
          <option value="">Auto · local-first</option>
          <option v-for="name in growthModelNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="field">
        <span>Skill updates</span>
        <select v-model="form.growthModels.skills">
          <option value="">Auto · local-first</option>
          <option v-for="name in growthModelNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <p class="note">
        Used for every Robo unless that Robo has its own override in SELF. Auto uses an installed
        local model when one exists, so growth works offline. A chosen model is used exactly, and
        cloud choices keep the 150 s reflection cap.
      </p>
    </section>

    <section>
      <h3 class="mono">RALLY</h3>
      <label class="field">
        <span>Max speakers per pass · {{ form.maxSpeakers }}</span>
        <input v-model.number="form.maxSpeakers" type="range" min="1" max="6" />
      </label>
      <label class="field">
        <span>Temperature · {{ Number(form.temperature).toFixed(2) }}</span>
        <input v-model.number="form.temperature" type="range" min="0" max="1.4" step="0.05" />
      </label>
      <label class="check">
        <input v-model="form.toolsEnabled" type="checkbox" />
        <span>Tool belt — files, web, clock, memory</span>
      </label>
      <label class="check">
        <input v-model="form.allowWrite" type="checkbox" :disabled="!form.toolsEnabled" />
        <span>Let Robos write files</span>
      </label>
      <label class="check">
        <input v-model="form.allowShell" type="checkbox" />
        <span>Arm the shell <b class="warn">risky</b></span>
      </label>
      <p class="note">
        The shell runs commands with your account inside the workspace. Only arm it when you want
        the crew to actually operate the machine.
      </p>
      <label class="check">
        <input v-model="form.autonomy" type="checkbox" />
        <span>Autonomous growth — role-scoped identity, creed and skills</span>
      </label>
      <p class="note">
        When armed, a Robo may apply a bounded personal creed, working practice and learned craft
        skills after a rally. Role, unit creed, permissions and safety stay locked. Local models
        have no app-side token or reflection-time cap.
      </p>
    </section>

    <section>
      <h3 class="mono">WORKSPACE</h3>
      <label class="field">
        <span>Folder Robos may touch</span>
        <input v-model="form.workspace" spellcheck="false" />
      </label>
      <p class="note">
        Secrets (<code>.env</code>), <code>data/</code>, <code>.git</code>,
        <code>.freebuff</code> and <code>node_modules</code> stay off-limits.
      </p>
    </section>

    <section v-if="hostLocal !== false">
      <h3 class="mono">PHONE LINK</h3>
      <label class="check">
        <input
          type="checkbox"
          :checked="remote.enabled"
          :disabled="remoteBusy"
          @change="$emit('remote-toggle', $event.target.checked)"
        />
        <span>Let a phone on this Wi-Fi open the console</span>
      </label>
      <p class="note">
        Same Wi-Fi only. The link carries an access key, so rotate it if it leaks; the desktop
        stays the only place where the key is shown.
      </p>
      <p v-if="remote.error" class="remote-error">{{ remote.error }}</p>
      <template v-if="remote.enabled">
        <div class="remote-link">
          <input :value="remote.url" readonly aria-label="Phone link" />
          <button type="button" class="text-btn" :disabled="remoteBusy" @click="$emit('copy-remote')">
            COPY
          </button>
        </div>
        <div class="row">
          <span class="note">Open it on the phone, then add it to the home screen.</span>
          <button type="button" class="text-btn" :disabled="remoteBusy" @click="$emit('remote-rotate')">
            ROTATE KEY
          </button>
        </div>
      </template>
      <p v-else-if="!remoteBusy" class="note">Off. The console only listens on this computer.</p>
    </section>

    <div class="save-row">
      <button type="submit" class="btn primary" :disabled="busy || !dirty">
        {{ busy ? 'SAVING…' : 'SAVE SETUP' }}
      </button>
      <span v-if="dirty" class="mono unsaved">UNSAVED</span>
    </div>

    <section class="shelf">
      <h3 class="mono">MODEL SHELF</h3>
      <div class="models">
        <button
          v-for="model in models"
          :key="model.name"
          type="button"
          class="model"
          :class="{ on: form.model === model.name }"
          @click="form.model = model.name"
        >
          <span class="mname">{{ model.name }}</span>
          <span class="badges">
            <span v-if="model.cloud" class="badge cloud">CLOUD</span>
            <span v-else class="badge local">LOCAL</span>
            <span v-if="model.tools" class="badge">TOOLS</span>
            <span v-if="model.params" class="badge">{{ model.params }}</span>
            <span v-if="model.size" class="badge">{{ sizeOf(model.size) }}</span>
          </span>
        </button>
        <p v-if="!models.length" class="note">No models listed. Is the engine running?</p>
      </div>
    </section>
  </form>
</template>

<script>
const FORM_KEYS = [
  'provider',
  'ollamaUrl',
  'openaiBaseUrl',
  'model',
  'maxSpeakers',
  'temperature',
  'toolsEnabled',
  'allowWrite',
  'allowShell',
  'autonomy',
  'workspace',
]

export default {
  name: 'SetupPanel',
  props: {
    settings: { type: Object, required: true },
    models: { type: Array, default: () => [] },
    modelMeta: { type: Object, default: () => ({}) },
    busy: Boolean,
    remote: { type: Object, default: () => ({}) },
    hostLocal: { type: Boolean, default: true },
    remoteBusy: Boolean,
  },
  emits: ['save', 'refresh', 'remote-toggle', 'remote-rotate', 'copy-remote'],
  data() {
    return {
      form: {
        provider: 'ollama',
        ollamaUrl: '',
        openaiBaseUrl: '',
        model: '',
        growthModels: { identity: '', skills: '' },
        maxSpeakers: 3,
        temperature: 0.85,
        toolsEnabled: true,
        allowWrite: true,
        allowShell: false,
        autonomy: false,
        workspace: '',
      },
      keyDraft: '',
      clearKey: false,
    }
  },
  computed: {
    dirty() {
      if (FORM_KEYS.some((key) => this.form[key] !== this.settings[key])) return true
      if (
        this.form.growthModels.identity !== (this.settings.growthModels?.identity || '') ||
        this.form.growthModels.skills !== (this.settings.growthModels?.skills || '')
      ) {
        return true
      }
      return Boolean(this.keyDraft.trim()) || this.clearKey
    },
    growthModelNames() {
      const names = this.models.map((model) => model.name)
      for (const value of Object.values(this.form.growthModels)) {
        if (value && !names.includes(value)) names.push(value)
      }
      return names
    },
  },
  watch: {
    settings: {
      deep: true,
      immediate: true,
      handler() {
        this.reset()
      },
    },
  },
  methods: {
    reset() {
      for (const key of FORM_KEYS) this.form[key] = this.settings[key]
      this.form.growthModels = {
        identity: this.settings.growthModels?.identity || '',
        skills: this.settings.growthModels?.skills || '',
      }
      this.keyDraft = ''
      this.clearKey = false
    },
    submit() {
      const patch = {}
      for (const key of FORM_KEYS) patch[key] = this.form[key]
      patch.growthModels = {
        identity: this.form.growthModels.identity.trim(),
        skills: this.form.growthModels.skills.trim(),
      }
      if (this.keyDraft.trim()) patch.openaiKey = this.keyDraft.trim()
      if (this.clearKey) patch.clearKey = true
      this.keyDraft = ''
      this.clearKey = false
      this.$emit('save', patch)
    },
    sizeOf(bytes) {
      return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`
    },
  },
}
</script>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

h3 {
  margin: 0 0 2px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--line);
  color: var(--dim);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.22);
}

.seg button {
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.seg button.on {
  background: rgba(94, 241, 194, 0.12);
  color: var(--mint);
}

.note {
  margin: 0;
  color: var(--dim);
  font-size: 9.5px;
  line-height: 1.5;
}

.note code {
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.92em;
}

.remote-link {
  display: flex;
  align-items: center;
  gap: 6px;
}

.remote-link input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--mint);
  font-family: var(--mono);
  font-size: 8px;
}

.remote-link .text-btn {
  align-self: center;
}

.remote-error {
  margin: 0;
  color: #ff9b9b;
  font-size: 9px;
  line-height: 1.45;
}

.key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.text-btn {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--mint);
  font-family: var(--mono);
  font-size: 8px;
  letter-spacing: 0.06em;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.engine-state {
  color: var(--mint);
  font-size: 8px;
  letter-spacing: 0.06em;
}

.engine-state.bad {
  color: var(--danger);
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 10.5px;
  cursor: pointer;
}

.check input {
  width: 13px;
  height: 13px;
  accent-color: var(--mint);
}

.warn {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(255, 107, 107, 0.12);
  color: #ff9b9b;
  font-size: 7.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

input[type="range"] {
  width: 100%;
  height: 18px;
  padding: 0;
  accent-color: var(--mint);
  background: transparent;
}

.save-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.unsaved {
  color: var(--amber);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.shelf {
  padding-top: 2px;
}

.models {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 230px;
  overflow-y: auto;
}

.model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.015);
  text-align: left;
}

.model:hover {
  border-color: var(--line);
}

.model.on {
  border-color: rgba(94, 241, 194, 0.3);
  background: rgba(94, 241, 194, 0.055);
}

.mname {
  overflow: hidden;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model.on .mname {
  color: var(--mint);
}

.badges {
  display: flex;
  gap: 3px;
  flex: 0 0 auto;
}

.badge {
  padding: 1px 4px;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 6.5px;
  letter-spacing: 0.04em;
}

.badge.local {
  border-color: rgba(94, 241, 194, 0.25);
  color: #79c9b2;
}

.badge.cloud {
  border-color: rgba(176, 139, 255, 0.3);
  color: var(--violet);
}
</style>
