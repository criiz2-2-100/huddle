<template>
  <section ref="scroller" class="transcript" @scroll="onScroll">
    <div v-if="!messages.length" class="empty">
      <div class="empty-mark" aria-hidden="true">
        <span style="--c: #3ee6ff">2</span>
        <span style="--c: #ffc24a">1</span>
        <span style="--c: #ff5fa8">0</span>
      </div>
      <p class="kicker">UNIT 2·2·100 · SIX ROBOS ONLINE</p>
      <h2>The room is warm.</h2>
      <p class="sub">
        Hand the crew a job, a question or a half-formed idea. They will argue it out in the open —
        and you can watch every move.
      </p>
      <div class="prompts">
        <button v-for="prompt in prompts" :key="prompt" @click="$emit('prompt', prompt)">
          {{ prompt }}
        </button>
      </div>
    </div>

    <div v-else class="stream">
      <article
        v-for="message in messages"
        :key="message.id"
        class="msg"
        :class="[message.role, { streaming: message.streaming, error: message.error }]"
      >
        <template v-if="message.role === 'user'">
          <div class="avatar you">YOU</div>
          <div class="body">
            <header>
              <span class="name operator">OPERATOR</span>
              <span class="role">human · founder</span>
              <span class="time mono">{{ time(message.ts) }}</span>
            </header>
            <div class="text" v-html="renderMarkdown(message.text)"></div>
          </div>
        </template>

        <template v-else-if="message.role === 'robo'">
          <RoboAvatar
            :glyph="roboFor(message.roboId)?.glyph || '0'"
            :color="roboFor(message.roboId)?.color || '#5ef1c2'"
            :state="message.streaming ? 'speaking' : 'idle'"
            :size="44"
            :seed="seedFor(message.roboId)"
          />
          <div class="body">
            <header>
              <span class="name" :style="{ color: roboFor(message.roboId)?.color || '#5ef1c2' }">
                {{ roboFor(message.roboId)?.name || 'ROBO' }}
              </span>
              <span class="role">{{ roboFor(message.roboId)?.role || 'unit 2·2·100' }}</span>
              <span v-if="message.model" class="model mono">{{ shortModel(message.model) }}</span>
              <span class="time mono">{{ time(message.ts) }}</span>
            </header>

            <div v-if="message.streaming && !message.text" class="thinking">
              <span></span><span></span><span></span>
              tuning in…
            </div>

            <div v-if="message.text" class="text" v-html="renderMarkdown(message.text)"></div>
            <span v-if="message.streaming" class="caret" aria-hidden="true"></span>

            <div v-if="message.tools?.length" class="tools">
              <details v-for="(tool, index) in message.tools" :key="index" class="tool">
                <summary>
                  <span class="dot" :class="{ bad: tool.ok === false, pending: tool.pending }"></span>
                  <span class="mono">{{ tool.label || tool.name }}</span>
                  <span class="tool-state mono">{{ tool.pending ? 'running' : tool.ok === false ? 'error' : 'done' }}</span>
                </summary>
                <pre v-if="tool.args && Object.keys(tool.args).length" class="args">{{
                  prettyArgs(tool.args)
                }}</pre>
                <pre v-if="tool.result" class="out">{{ tool.result }}</pre>
              </details>
            </div>

            <p v-if="message.interrupted" class="interrupted">signal cut — partial transmission</p>
          </div>
        </template>

        <template v-else>
          <p class="system-note">{{ message.text }}</p>
        </template>
      </article>
    </div>
    <div ref="anchor" class="anchor"></div>
  </section>
</template>

<script>
import RoboAvatar from './RoboAvatar.vue'
import { prettyArgs, renderMarkdown } from '../format'

const PROMPTS = [
  'Plan the smallest working version of Huddle.',
  'Debate: local models vs cloud models for this build.',
  'Read the project files and tell me what to fix first.',
]

export default {
  name: 'Transcript',
  components: { RoboAvatar },
  props: {
    messages: { type: Array, default: () => [] },
    robos: { type: Array, default: () => [] },
  },
  emits: ['prompt'],
  data() {
    return {
      prompts: PROMPTS,
      pinned: true,
    }
  },
  computed: {
    lastSignature() {
      const last = this.messages[this.messages.length - 1]
      return `${this.messages.length}:${last?.id || ''}:${last?.text?.length || 0}:${last?.tools?.length || 0}`
    },
  },
  watch: {
    lastSignature() {
      if (this.pinned) this.scrollToEnd()
    },
  },
  mounted() {
    this.scrollToEnd()
  },
  methods: {
    renderMarkdown,
    prettyArgs,
    roboFor(id) {
      return this.robos.find((robo) => robo.id === id)
    },
    seedFor(id) {
      return (this.robos.findIndex((robo) => robo.id === id) % 7) + 1
    },
    shortModel(model) {
      const name = String(model || '').replace(/:latest$/, '')
      return name.length > 24 ? `${name.slice(0, 22)}…` : name
    },
    time(ts) {
      if (!ts) return ''
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    },
    onScroll() {
      const box = this.$refs.scroller
      if (!box) return
      this.pinned = box.scrollHeight - box.scrollTop - box.clientHeight < 140
    },
    scrollToEnd() {
      this.$nextTick(() => {
        const box = this.$refs.scroller
        if (!box) return
        box.scrollTop = box.scrollHeight
        this.pinned = true
      })
    },
  },
}
</script>

<style scoped>
.transcript {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px 28px 70px;
  text-align: center;
}

.empty-mark {
  display: flex;
  gap: 8px;
  margin-bottom: 26px;
}

.empty-mark span {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--c) 8%, transparent);
  color: var(--c);
  font-family: var(--mono);
  font-size: 24px;
  font-weight: 700;
  box-shadow: 0 0 22px color-mix(in srgb, var(--c) 18%, transparent);
}

.empty-mark span:nth-child(2) {
  transform: translateY(-7px);
}

.kicker {
  margin: 0 0 10px;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
}

.empty h2 {
  margin: 0;
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 650;
  letter-spacing: -0.03em;
  background: linear-gradient(100deg, #f2f9ff 20%, #8fd8ff 60%, #5ef1c2);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.empty .sub {
  max-width: 480px;
  margin: 12px 0 26px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
}

.prompts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 620px;
}

.prompts button {
  padding: 8px 13px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--muted);
  font-size: 12px;
  transition: 0.16s ease;
}

.prompts button:hover {
  border-color: rgba(94, 241, 194, 0.45);
  color: var(--text);
  background: rgba(94, 241, 194, 0.06);
}

.stream {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 880px;
  margin: 0 auto;
  padding: 26px 30px 40px;
}

.msg {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 13px;
  padding: 13px 14px;
  border: 1px solid transparent;
  border-radius: 13px;
  animation: arrive 0.28s ease both;
}

.msg:hover {
  border-color: var(--line);
  background: rgba(255, 255, 255, 0.012);
}

.msg.user {
  background: rgba(62, 230, 255, 0.035);
  border-color: rgba(62, 230, 255, 0.1);
}

.msg.error {
  border-color: rgba(255, 107, 107, 0.22);
}

@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.avatar.you {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-top: 2px;
  border: 1px dashed rgba(94, 241, 194, 0.4);
  border-radius: 10px;
  color: var(--mint);
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.msg :deep(.robo) {
  margin-top: -2px;
}

.body {
  min-width: 0;
}

header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.name {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.name.operator {
  color: var(--mint);
}

.role {
  color: var(--dim);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.model {
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--muted);
  font-size: 9px;
}

.time {
  margin-left: auto;
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.04em;
}

.text {
  color: #cfdeef;
  font-size: 13.5px;
  line-height: 1.62;
  overflow-wrap: anywhere;
}

.msg.user .text {
  color: #e8f4ff;
}

.thinking {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
}

.thinking span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--mint);
  animation: dot 1.1s ease-in-out infinite;
}

.thinking span:nth-child(2) {
  animation-delay: 0.15s;
}

.thinking span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes dot {
  0%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 3px;
  border-radius: 1px;
  background: var(--mint);
  animation: caret 0.85s steps(2) infinite;
  vertical-align: -2px;
}

@keyframes caret {
  50% {
    opacity: 0;
  }
}

.tools {
  display: grid;
  gap: 6px;
  margin-top: 9px;
}

.tool {
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.tool summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  list-style: none;
}

.tool summary::-webkit-details-marker {
  display: none;
}

.tool summary .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mint);
  box-shadow: 0 0 7px var(--mint);
  flex: 0 0 auto;
}

.tool .dot.pending {
  background: var(--amber);
  box-shadow: 0 0 7px var(--amber);
  animation: pulse 0.7s ease-in-out infinite alternate;
}

.tool .dot.bad {
  background: var(--danger);
  box-shadow: 0 0 7px var(--danger);
}

.tool-state {
  margin-left: auto;
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.tool pre {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--line);
  overflow-x: auto;
  color: #a9c3d9;
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tool pre.args {
  color: var(--dim);
  background: rgba(255, 255, 255, 0.015);
}

.interrupted {
  margin: 6px 0 0;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 10px;
}

.msg.system {
  display: block;
  padding: 4px 14px;
}

.system-note {
  margin: 6px auto;
  padding: 7px 12px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10.5px;
  text-align: center;
}

.msg.error .system-note {
  border-color: rgba(255, 107, 107, 0.3);
  color: #ffb3b3;
}

.anchor {
  height: 1px;
}

@media (max-width: 720px) {
  .stream {
    padding: 18px 12px 30px;
  }
  .msg {
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 10px;
    padding: 10px 8px;
  }
  .msg :deep(.robo) {
    width: 36px !important;
  }
  .avatar.you {
    width: 34px;
    height: 34px;
    font-size: 9px;
  }
  .empty {
    padding: 28px 18px 50px;
  }
}
</style>
