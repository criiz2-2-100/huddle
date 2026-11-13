<template>
  <div class="boss">
    <header class="boss-head">
      <div class="seal" aria-hidden="true">B</div>
      <div class="head-copy">
        <p class="mono kicker">BOSS · DAILY REVIEW</p>
        <h2>{{ report?.headline || 'A seat above the table.' }}</h2>
        <p class="mono meta">
          {{ report ? when(report.generatedAt) : 'NO REVIEW YET' }}
          <span class="sep">·</span>
          {{ report ? sourceLabel(report.source) : 'LOCAL SIGNALS' }}
        </p>
      </div>
      <span class="status" :class="{ due: boss.due, running }">
        {{ running ? 'REVIEWING' : boss.due ? 'DUE' : 'CURRENT' }}
      </span>
    </header>

    <p v-if="report" class="summary">{{ report.summary }}</p>
    <div v-else class="empty">
      <p>No daily review yet.</p>
      <p>
        The Boss reads the last week of rallies, the crew shape and the workspace names, then
        returns a short list of improvements. It never changes roles or permissions.
      </p>
    </div>

    <div v-if="report?.stats" class="stats">
      <div>
        <strong>{{ report.stats.active }}</strong>
        <span>ON DECK</span>
      </div>
      <div>
        <strong>{{ report.stats.rooms }}</strong>
        <span>RALLIES</span>
      </div>
      <div>
        <strong>{{ report.stats.messagesThisWeek }}</strong>
        <span>THIS WEEK</span>
      </div>
      <div>
        <strong>{{ report.stats.skills }}</strong>
        <span>SKILLS</span>
      </div>
      <div :class="{ hot: report.stats.pending }">
        <strong>{{ report.stats.pending }}</strong>
        <span>PENDING</span>
      </div>
    </div>

    <section v-if="report?.improvements?.length" class="block">
      <div class="block-head">
        <h3>IMPROVEMENTS</h3>
        <span class="mono">{{ report.improvements.length }} FOUND</span>
      </div>
      <article v-for="item in report.improvements" :key="item.title" class="improvement">
        <span class="priority mono" :class="item.priority">{{ item.priority }}</span>
        <div>
          <strong>{{ item.title }}</strong>
          <p v-if="item.why">{{ item.why }}</p>
          <p v-if="item.action" class="action">{{ item.action }}</p>
        </div>
      </article>
    </section>

    <div v-if="report" class="split">
      <section class="block">
        <div class="block-head"><h3>WINS</h3></div>
        <ul>
          <li v-for="win in report.wins" :key="win">{{ win }}</li>
        </ul>
      </section>
      <section class="block">
        <div class="block-head"><h3>WATCH</h3></div>
        <ul class="risks">
          <li v-for="risk in report.risks" :key="risk">{{ risk }}</li>
        </ul>
      </section>
    </div>

    <section v-if="report?.nextMoves?.length" class="block">
      <div class="block-head"><h3>NEXT MOVES</h3></div>
      <ol class="moves">
        <li v-for="move in report.nextMoves" :key="move">{{ move }}</li>
      </ol>
    </section>

    <div class="boss-actions">
      <button class="btn primary" type="button" :disabled="running" @click="$emit('run', true)">
        {{ running ? 'BOSS IS THINKING…' : report ? 'RUN REVIEW' : 'ASK FOR A REVIEW' }}
      </button>
      <label class="auto">
        <input
          type="checkbox"
          :checked="boss.auto"
          @change="$emit('toggle-auto', $event.target.checked)"
        />
        <span>AUTO DAILY</span>
      </label>
      <button v-if="report" class="btn ghost" type="button" @click="copy">
        {{ copied ? 'COPIED' : 'COPY' }}
      </button>
    </div>

    <p class="note">
      The Boss reads local transcripts and visible workspace names. Its report is advice only; it
      cannot change a role, approve a proposal, or grant a tool.
    </p>
  </div>
</template>

<script>
export default {
  name: 'BossPanel',
  props: {
    boss: {
      type: Object,
      default: () => ({ report: null, due: true, auto: true, running: false }),
    },
    running: Boolean,
  },
  emits: ['run', 'toggle-auto'],
  data() {
    return { copied: false, copyTimer: 0 }
  },
  computed: {
    report() {
      return this.boss?.report || null
    },
  },
  beforeUnmount() {
    window.clearTimeout(this.copyTimer)
  },
  methods: {
    when(ts) {
      if (!ts) return 'NO DATE'
      return new Date(ts).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    },
    sourceLabel(source) {
      return source === 'model' ? 'MODEL REVIEW' : 'LOCAL SIGNALS'
    },
    reportText() {
      const r = this.report
      if (!r) return ''
      const lines = [
        `BOSS · ${this.when(r.generatedAt)}`,
        r.headline,
        '',
        r.summary,
        '',
        'WINS',
        ...(r.wins || []).map((item) => `- ${item}`),
        '',
        'WATCH',
        ...(r.risks || []).map((item) => `- ${item}`),
        '',
        'IMPROVEMENTS',
        ...(r.improvements || []).flatMap((item) => [
          `- [${item.priority.toUpperCase()}] ${item.title}`,
          ...(item.why ? [`  ${item.why}`] : []),
          ...(item.action ? [`  Next: ${item.action}`] : []),
        ]),
        '',
        'NEXT MOVES',
        ...(r.nextMoves || []).map((item, index) => `${index + 1}. ${item}`),
      ]
      return lines.join('\n')
    },
    async copy() {
      const text = this.reportText()
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const input = document.createElement('textarea')
        input.value = text
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        input.remove()
      }
      this.copied = true
      window.clearTimeout(this.copyTimer)
      this.copyTimer = window.setTimeout(() => {
        this.copied = false
      }, 2200)
    },
  },
}
</script>

<style scoped>
.boss {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.boss-head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--line);
}

.seal {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(255, 194, 74, 0.45);
  border-radius: 12px;
  background:
    linear-gradient(145deg, rgba(255, 194, 74, 0.18), rgba(255, 194, 74, 0.04)),
    #0b1018;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 21px;
  font-weight: 700;
  box-shadow: 0 0 24px rgba(255, 194, 74, 0.08);
}

.head-copy {
  flex: 1;
  min-width: 0;
}

.kicker {
  margin: 0;
  color: var(--amber);
  font-size: 7.5px;
  letter-spacing: 0.14em;
}

.boss-head h2 {
  margin: 4px 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.meta {
  margin: 0;
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.06em;
}

.sep {
  margin: 0 4px;
  opacity: 0.5;
}

.status {
  flex: 0 0 auto;
  padding: 3px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 6.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.status.due {
  border-color: rgba(255, 194, 74, 0.35);
  color: var(--amber);
}

.status.running {
  border-color: rgba(94, 241, 194, 0.35);
  color: var(--mint);
}

.summary {
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.6;
}

.empty {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 194, 74, 0.035);
}

.empty p {
  margin: 0;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.55;
}

.empty p + p {
  margin-top: 6px;
  color: var(--dim);
}

.stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 5px;
}

.stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.014);
  text-align: center;
}

.stats strong {
  color: var(--text);
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 600;
}

.stats span {
  color: var(--dim);
  font-family: var(--mono);
  font-size: 6.5px;
  letter-spacing: 0.06em;
}

.stats div.hot strong {
  color: var(--amber);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--line);
}

.block h3 {
  margin: 0;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
}

.block-head > span {
  color: #42566b;
  font-size: 7px;
  letter-spacing: 0.06em;
}

.improvement {
  display: flex;
  gap: 7px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.012);
}

.priority {
  align-self: flex-start;
  flex: 0 0 auto;
  padding: 2px 4px;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--dim);
  font-size: 6px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.priority.high {
  border-color: rgba(255, 107, 107, 0.32);
  color: #ff9b9b;
}

.priority.medium {
  border-color: rgba(255, 194, 74, 0.32);
  color: var(--amber);
}

.priority.low {
  border-color: rgba(94, 241, 194, 0.26);
  color: #79c9b2;
}

.improvement strong {
  display: block;
  color: var(--text);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.4;
}

.improvement p {
  margin: 3px 0 0;
  color: var(--dim);
  font-size: 9.5px;
  line-height: 1.45;
}

.improvement p.action {
  color: #8fb7a9;
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.block ul,
.block ol {
  margin: 0;
  padding-left: 15px;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.5;
}

.block li + li {
  margin-top: 4px;
}

.risks li::marker {
  color: var(--amber);
}

.moves li::marker {
  color: var(--mint);
  font-family: var(--mono);
}

.boss-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 2px;
}

.auto {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.auto input {
  width: 12px;
  height: 12px;
  accent-color: var(--mint);
}

.note {
  margin: 0;
  color: #465d73;
  font-size: 8.5px;
  line-height: 1.45;
}

@media (max-width: 380px) {
  .stats {
    grid-template-columns: repeat(3, 1fr);
  }

  .split {
    grid-template-columns: 1fr;
  }
}
</style>
