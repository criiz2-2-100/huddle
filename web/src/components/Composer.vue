<template>
  <form class="composer" @submit.prevent="submit">
    <div class="rows">
      <div class="targets" aria-label="Who answers">
        <span class="targets-label mono">ON DECK</span>
        <button
          v-for="robo in robos"
          :key="robo.id"
          type="button"
          class="target"
          :class="{ on: selected.includes(robo.id) }"
          :style="{ '--robo': robo.color }"
          :title="selected.includes(robo.id) ? `Remove ${robo.name}` : `Add ${robo.name}`"
          @click="$emit('toggle', robo.id)"
        >
          <span class="glyph">{{ robo.glyph }}</span>{{ robo.name }}
        </button>
        <span class="spacer"></span>
        <button type="button" class="mode mono" :title="modeTitle" @click="cycleMode">
          {{ mode === 'debate' ? 'DEBATE · 2×' : 'HUDDLE · 1×' }}
        </button>
        <button
          type="button"
          class="sound"
          :class="{ on: autoSpeak }"
          :title="autoSpeak ? 'Mute robo voices' : 'Let robos speak their replies'"
          @click="$emit('toggle-voice')"
        >
          {{ autoSpeak ? '🔊' : '🔈' }}
        </button>
      </div>

      <div class="box" :class="{ busy: running }">
        <textarea
          ref="input"
          v-model="draft"
          rows="1"
          :placeholder="placeholder"
          aria-label="Message the Robos"
          @input="autosize"
          @keydown="onKeydown"
          @blur="drafting = false"
        ></textarea>
        <div class="actions">
          <button
            v-if="listenSupported"
            type="button"
            class="icon-btn dictation"
            :class="{ listening }"
            :title="listening ? 'Stop dictation' : 'Dictate'"
            @click="toggleDictation"
          >
            {{ listening ? '■' : '🎙' }}
          </button>
          <button v-if="running" type="button" class="stop" @click="$emit('stop')">◼ Stop</button>
          <button v-else type="submit" class="send" :disabled="!draft.trim()">Send <span>↵</span></button>
        </div>
      </div>

      <div v-if="mentionOptions.length" class="mentions">
        <button
          v-for="robo in mentionOptions"
          :key="robo.id"
          type="button"
          @click="insertMention(robo)"
        >
          <span class="glyph" :style="{ color: robo.color }">{{ robo.glyph }}</span>
          @{{ robo.name.toLowerCase() }}
          <small>{{ robo.role }}</small>
        </button>
      </div>

      <div class="hint">
        <span class="mono">ENTER SEND · SHIFT+ENTER NEWLINE</span>
        <span v-if="micError" class="mic-error">{{ micError }}</span>
        <span v-else-if="mode === 'debate'" class="mono">TWO PASSES — ROBOS ANSWER EACH OTHER</span>
        <span v-else class="mono">ONE PASS AROUND THE CREW · @ TO PICK A ROBO</span>
      </div>
    </div>
  </form>
</template>

<script>
import { listen, listenSupported } from '../voice'

export default {
  name: 'Composer',
  props: {
    robos: { type: Array, default: () => [] },
    selected: { type: Array, default: () => [] },
    running: Boolean,
    mode: { type: String, default: 'huddle' },
    autoSpeak: Boolean,
  },
  emits: ['send', 'stop', 'toggle', 'update:mode', 'toggle-voice'],
  data() {
    return {
      draft: '',
      listening: false,
      stopListening: null,
      micError: '',
      listenSupported,
      mentionMatch: null,
      drafting: false,
    }
  },
  computed: {
    placeholder() {
      if (this.running) return 'The crew is talking…'
      return 'Give the crew something to chew on…'
    },
    modeTitle() {
      return this.mode === 'debate'
        ? 'Debate: two passes so robos can answer each other'
        : 'Huddle: one pass around the crew'
    },
    mentionOptions() {
      if (!this.mentionMatch) return []
      const query = this.mentionMatch[2].toLowerCase()
      return this.robos.filter(
        (robo) =>
          robo.name.toLowerCase().startsWith(query) || robo.id.toLowerCase().startsWith(query),
      )
    },
  },
  mounted() {
    this.autosize()
  },
  methods: {
    autosize() {
      const input = this.$refs.input
      if (!input) return
      input.style.height = 'auto'
      input.style.height = `${Math.min(180, input.scrollHeight)}px`
    },
    submit() {
      const text = this.draft.trim()
      if (!text || this.running) return
      this.draft = ''
      this.micError = ''
      this.$nextTick(this.autosize)
      this.$emit('send', text)
    },
    onKeydown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.submit()
        return
      }
      if (event.key === 'Escape' && this.running) {
        event.preventDefault()
        this.$emit('stop')
        return
      }
      if (event.key === 'Escape' && this.mentionMatch) {
        this.mentionMatch = null
        return
      }
      this.$nextTick(() => {
        const match = this.draft.match(/(^|\s)@(\w*)$/)
        this.mentionMatch = match ? { index: match.index + match[1].length, query: match[2] } : null
      })
    },
    insertMention(robo) {
      if (!this.mentionMatch) return
      const before = this.draft.slice(0, this.mentionMatch.index)
      this.draft = `${before}@${robo.name.toLowerCase()} `
      this.mentionMatch = null
      this.$nextTick(() => {
        this.$refs.input?.focus()
        this.autosize()
      })
    },
    cycleMode() {
      this.$emit('update:mode', this.mode === 'debate' ? 'huddle' : 'debate')
    },
    toggleDictation() {
      if (this.listening) {
        this.stopListening?.()
        return
      }
      this.listening = true
      this.micError = ''
      this.stopListening = listen({
        onResult: (text) => {
          this.draft = this.draft ? `${this.draft} ${text}` : text
          this.listening = false
          this.$nextTick(() => {
            this.$refs.input?.focus()
            this.autosize()
          })
        },
        onEnd: () => {
          this.listening = false
        },
        onError: (message) => {
          this.micError = message
        },
      })
    },
  },
}
</script>

<style scoped>
.composer {
  flex: 0 0 auto;
  padding: 0 30px 16px;
  background: linear-gradient(to top, rgba(4, 7, 12, 0.96) 55%, transparent);
}

.rows {
  max-width: 880px;
  margin: 0 auto;
}

.targets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 2px 9px;
}

.targets-label {
  margin-right: 3px;
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.14em;
}

.target {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 25px;
  padding: 0 9px 0 6px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: transparent;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  transition: 0.15s ease;
}

.target .glyph {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border: 1px solid color-mix(in srgb, var(--robo) 40%, transparent);
  border-radius: 50%;
  color: var(--robo);
  font-size: 9px;
}

.target.on {
  border-color: color-mix(in srgb, var(--robo) 55%, transparent);
  background: color-mix(in srgb, var(--robo) 9%, transparent);
  color: var(--robo);
}

.target:hover {
  border-color: var(--line-strong);
}

.spacer {
  flex: 1;
}

.mode {
  height: 25px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: transparent;
  color: var(--muted);
  font-size: 9px;
  letter-spacing: 0.1em;
}

.mode:hover {
  border-color: rgba(176, 139, 255, 0.5);
  color: var(--violet);
}

.sound {
  width: 27px;
  height: 25px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: transparent;
  font-size: 11px;
  filter: grayscale(1);
  opacity: 0.6;
}

.sound.on {
  border-color: rgba(94, 241, 194, 0.4);
  filter: none;
  opacity: 1;
}

.box {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 9px 9px 9px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background: rgba(9, 15, 24, 0.92);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(8px);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.box:focus-within {
  border-color: rgba(94, 241, 194, 0.5);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35), 0 0 0 3px rgba(94, 241, 194, 0.07);
}

.box.busy {
  border-color: rgba(255, 194, 74, 0.36);
}

textarea {
  flex: 1;
  min-height: 26px;
  max-height: 180px;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  line-height: 1.55;
  outline: none;
  resize: none;
}

textarea::placeholder {
  color: var(--dim);
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 1px;
}

.dictation {
  width: 33px;
  height: 33px;
  border-radius: 10px;
  font-size: 13px;
}

.dictation.listening {
  border-color: rgba(255, 95, 168, 0.5);
  color: var(--pink);
  animation: pulse 1s ease-in-out infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 1;
  }
}

.send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--mint);
  color: #03130e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.send span {
  font-family: var(--mono);
  opacity: 0.6;
}

.send:disabled {
  background: rgba(126, 178, 220, 0.14);
  color: var(--dim);
}

.stop {
  height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(255, 107, 107, 0.4);
  border-radius: 10px;
  background: rgba(255, 107, 107, 0.1);
  color: #ffb0b0;
  font-size: 12px;
  font-weight: 600;
}

.mentions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(9, 15, 24, 0.97);
}

.mentions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  font-family: var(--mono);
  font-size: 10px;
}

.mentions button:hover {
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, 0.03);
}

.mentions .glyph {
  font-size: 12px;
}

.mentions small {
  color: var(--dim);
  font-family: var(--sans);
  font-size: 9px;
}

.hint {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 4px 0;
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.06em;
}

.mic-error {
  color: var(--pink);
  text-align: right;
}

@media (max-width: 720px) {
  .composer {
    padding: 0 10px 10px;
  }
  .targets-label,
  .targets .target:nth-of-type(n + 4) {
    display: none;
  }
  .hint span:first-child {
    display: none;
  }
}
</style>
