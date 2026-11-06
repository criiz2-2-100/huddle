<template>
  <Teleport to="body">
    <div class="identity-shell" @click.self="$emit('close')">
      <section class="identity" role="dialog" aria-modal="true" aria-label="Controlled Robo identity">
        <header class="identity-top">
          <div>
            <p class="mono kicker">CONTROLLED SELF-REVIEW · UNIT 2·2·100</p>
            <h2>Shape a Robo</h2>
          </div>
          <div class="top-meta mono">
            <span class="led" :class="{ on: linked }"></span>
            {{ linked ? (provider === 'ollama' ? 'OLLAMA ENGINE' : 'OPENAI ENGINE') : 'ENGINE OFFLINE' }}
            <span class="sep">·</span>
            <span class="model">{{ modelLabel }}</span>
          </div>
          <button ref="closeBtn" class="close" title="Close identity console" @click="$emit('close')">
            ×
          </button>
        </header>

        <div v-if="loading" class="loading mono">LOADING IDENTITIES…</div>

        <div v-else class="identity-body">
          <nav class="rail" aria-label="Crew">
            <button
              v-for="robo in robos"
              :key="robo.id"
              class="rail-item"
              :class="{ on: robo.id === selectedId }"
              :style="{ '--c': robo.color }"
              :disabled="busy"
              @click="select(robo.id)"
            >
              <span class="rail-glyph" :style="{ color: robo.color }">{{ robo.glyph }}</span>
              <span class="rail-copy">
                <strong>{{ robo.name }}</strong>
                <small>{{ robo.role }}</small>
              </span>
              <span
                v-if="proposalIds.includes(robo.id)"
                class="rail-pending mono"
                title="Pending proposal"
              ></span>
            </button>
          </nav>

          <div v-if="selected" class="detail">
            <div class="identity-head">
              <RoboAvatar
                :glyph="selected.glyph"
                :color="selected.color"
                state="idle"
                :size="92"
                :seed="1"
                active
              />
              <div class="identity-title">
                <p class="mono role-lock">ROLE LOCKED · {{ selected.role }}</p>
                <h3>{{ currentIdentity.name }}</h3>
                <p v-if="currentIdentity.custom" class="origin mono">
                  ORIGINALLY {{ selected.defaultName }} · SELF-NAMED v{{ currentIdentity.version }}
                </p>
                <p v-else class="origin mono">ORIGINAL IDENTITY · NOT YET SELF-NAMED</p>
                <p class="tagline">
                  {{ currentIdentity.custom ? currentIdentity.tagline : selected.creed }}
                </p>
              </div>
            </div>

            <p class="control-note">
              Growth can change <strong>name, voice, personal creed, practice and toolkit</strong>.
              The unit role, unit creed, permissions and safety stay locked. Manual proposals wait
              for you; armed autonomy applies only these bounded fields.
            </p>

            <div class="autonomy-box" :class="{ on: autonomy }">
              <div class="autonomy-head">
                <div>
                  <span class="mono kicker">AUTONOMY</span>
                  <strong>{{ autonomy ? 'ARMED' : 'OFF' }}</strong>
                </div>
                <button class="btn ghost" :disabled="busy" @click="toggleAutonomy">
                  {{ autonomy ? 'PAUSE' : 'ARM AUTONOMY' }}
                </button>
              </div>
              <p>
                When armed, a Robo may apply a bounded personal creed, working practice and
                role-scoped craft skills after a huddle. It cannot change its unit role, unit
                creed, permissions or safety. Catalog discovery works during a turn even when
                autonomy is off. Identity max once / 6 h · skills max 2 / 24 h.
              </p>
              <div class="autonomy-actions">
                <button
                  class="btn primary run-auto"
                  :disabled="busy || runningAuto || !autonomy || !linked"
                  @click="runAutonomyNow"
                >
                  {{ runningAuto ? 'IMPROVING…' : 'RUN NOW' }}
                </button>
                <span class="hint">
                  Local models have no app token or reflection-time cap. Each learned skill is used
                  in future turns.
                </span>
              </div>
            </div>

            <div class="lock-box">
              <span class="mono lock-label">IMMUTABLE UNIT ROLE · UNIT CREED</span>
              <p>{{ selected.creed }}</p>
            </div>

            <div class="skills-box">
              <div class="section-head">
                <span class="mono">CRAFT SKILLS · {{ skillsFor.length }}</span>
                <span class="mono">{{ skillSeedCount }} SEED · {{ skillAdoptedCount }} ADOPTED</span>
              </div>
              <p v-if="!skillsFor.length" class="hint">
                No craft skills yet. Ask the Robo to search the skill catalog while it works.
              </p>
              <article v-for="skill in skillsFor" :key="skill.id" class="skill-card">
                <div class="skill-head">
                  <strong>{{ skill.name }}</strong>
                  <span class="skill-origin mono" :class="skillOriginClass(skill)">{{ skillOriginLabel(skill) }}</span>
                  <span v-if="skill.auto" class="auto-badge mono">AUTO</span>
                  <button class="skill-forget" :disabled="busy" @click="forgetSkill(skill.id)">
                    FORGET
                  </button>
                </div>
                <p class="skill-trigger"><span class="mono">WHEN</span> {{ skill.trigger }}</p>
                <ol>
                  <li v-for="step in skill.steps" :key="step">{{ step }}</li>
                </ol>
              </article>
              <details v-if="autonomyFor.length" class="autonomy-log">
                <summary class="mono">{{ autonomyFor.length }} AUTONOMY EVENTS</summary>
                <ul>
                  <li v-for="entry in autonomyFor" :key="entry.id">
                    <span class="mono">{{ entry.kind }}</span> · {{ entry.title }}
                  </li>
                </ul>
              </details>
            </div>

            <div v-if="notice" class="notice mono">{{ notice }}</div>
            <p v-if="error" class="error">{{ error }}</p>

            <div v-if="!draft" class="idle-panel">
              <div v-if="currentIdentity.traits.length" class="traits">
                <span
                  v-for="trait in currentIdentity.traits"
                  :key="trait"
                  class="trait mono"
                >{{ trait }}</span>
              </div>
              <p v-if="currentIdentity.custom" class="voice-line">
                <span class="mono">VOICE</span> {{ currentIdentity.voice }}
              </p>
              <p v-if="currentIdentity.custom" class="voice-line">
                <span class="mono">QUIRK</span> {{ currentIdentity.quirk }}
              </p>
              <p v-if="currentIdentity.personalCreed" class="voice-line">
                <span class="mono">PERSONAL CREED</span> {{ currentIdentity.personalCreed }}
              </p>
              <p v-if="currentIdentity.practice" class="voice-line">
                <span class="mono">PRACTICE</span> {{ currentIdentity.practice }}
              </p>

              <button
                class="btn primary reflect"
                :disabled="busy || !linked"
                @click="reflect"
              >
                {{ busy ? 'REFLECTING…' : 'REFLECT' }}
              </button>
              <p class="hint">
                {{
                  linked
                    ? `Reflection engine: ${modelLabel}. Growth prefers an installed local model, so a review works offline.`
                    : 'Start Ollama (or fix the engine in Setup) to reflect.'
                }}
                A reflection is a proposal, never an automatic change.
              </p>
            </div>

            <div v-else class="review">
              <div class="review-head">
                <span class="mono proposal-tag">PROPOSAL · v{{ draft.version }} · {{ draft.model }}</span>
                <span class="mono waiting">AWAITING YOUR APPROVAL</span>
              </div>

              <div class="fields">
                <label class="field">
                  <span>CHOSEN NAME</span>
                  <input v-model="draft.name" maxlength="14" :disabled="busy" />
                </label>
                <label class="field">
                  <span>TAGLINE</span>
                  <input v-model="draft.tagline" maxlength="90" :disabled="busy" />
                </label>
                <label class="field full">
                  <span>TRAITS · COMMA SEPARATED</span>
                  <input v-model="traitsText" maxlength="120" :disabled="busy" />
                </label>
                <label class="field">
                  <span>VOICE</span>
                  <input v-model="draft.voice" maxlength="140" :disabled="busy" />
                </label>
                <label class="field">
                  <span>QUIRK</span>
                  <input v-model="draft.quirk" maxlength="140" :disabled="busy" />
                </label>
                <label class="field full">
                  <span>PERSONAL CREED · WITHIN THE UNIT ROLE</span>
                  <textarea
                    v-model="draft.personalCreed"
                    rows="2"
                    maxlength="240"
                    :disabled="busy"
                    placeholder="How you practise the fixed role"
                  ></textarea>
                </label>
                <label class="field full">
                  <span>WORKING PRACTICE · WHAT MAKES YOU BETTER</span>
                  <textarea
                    v-model="draft.practice"
                    rows="2"
                    maxlength="180"
                    :disabled="busy"
                    placeholder="A concrete habit you will use in future turns"
                  ></textarea>
                </label>
                <div class="field full">
                  <span>TOOLKIT · CHOOSE FROM THE ENABLED BELT</span>
                  <div class="tool-picks">
                    <label v-for="tool in toolChoices" :key="tool">
                      <input
                        v-model="draft.tools"
                        type="checkbox"
                        :value="tool"
                        :disabled="busy"
                      />
                      <span>{{ tool }}</span>
                    </label>
                  </div>
                  <p class="hint">
                    This narrows the toolkit; it never grants write or shell permissions.
                  </p>
                </div>
                <label class="field full">
                  <span>WHY IT FITS THE ROLE</span>
                  <textarea v-model="draft.rationale" rows="2" maxlength="260" :disabled="busy"></textarea>
                </label>
              </div>

              <div class="actions">
                <button class="btn primary" :disabled="busy" @click="approve">APPROVE & APPLY</button>
                <button class="btn ghost" :disabled="busy" @click="discard">DISCARD</button>
                <button class="btn ghost" :disabled="busy || !linked" @click="reflect">
                  RE-REFLECT
                </button>
              </div>
              <p class="hint">You can edit any field before approving. The role lock stays enforced.</p>
            </div>

            <div class="footer-actions">
              <details v-if="historyFor.length" class="history">
                <summary class="mono">{{ historyFor.length }} PREVIOUS IDENTITIES</summary>
                <ul>
                  <li v-for="(item, index) in historyFor.slice().reverse()" :key="index">
                    <span class="mono">{{ item.name }}</span> · v{{ item.version }} · {{ item.tagline }}
                  </li>
                </ul>
              </details>
              <button
                v-if="currentIdentity.custom"
                class="revert"
                :disabled="busy"
                @click="revert"
              >
                REVERT TO {{ selected.defaultName }}
              </button>
            </div>
          </div>
        </div>

        <footer class="identity-foot mono">
          <span>OPERATOR-ARMED · ROLE LOCKED · NO CODE OR PERMISSION CHANGES</span>
          <span>ESC TO CLOSE</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script>
import RoboAvatar from './RoboAvatar.vue'
import {
  approveRobo,
  discardRobo,
  forgetSkill as forgetSkillApi,
  getGrowth,
  reflectRobo,
  revertRobo,
  runAutonomyNow as runAutonomyApi,
  saveSettings,
} from '../api'

export default {
  name: 'IdentityConsole',
  components: { RoboAvatar },
  props: {
    robos: { type: Array, default: () => [] },
    initialId: { type: String, default: '' },
    roomId: { type: String, default: '' },
    model: { type: String, default: '' },
    provider: { type: String, default: 'ollama' },
    linked: Boolean,
  },
  emits: ['close', 'updated'],
  data() {
    return {
      selectedId: '',
      growth: { identities: {}, proposals: {}, history: {}, skills: {}, autonomyLog: [] },
      draft: null,
      traitsText: '',
      localIdentity: null,
      growthModel: '',
      autonomy: false,
      runningAuto: false,
      toolChoices: [
        'list_files',
        'read_file',
        'search_skill_catalog',
        'read_skill_catalog',
        'adopt_skill',
        'fetch_url',
        'current_time',
        'remember',
        'write_file',
        'run_shell',
        'learn_skill',
      ],
      loading: true,
      busy: false,
      error: '',
      notice: '',
    }
  },
  computed: {
    selected() {
      return this.robos.find((robo) => robo.id === this.selectedId) || null
    },
    currentIdentity() {
      if (this.localIdentity) return this.localIdentity
      if (this.selected?.identity) return this.selected.identity
      return {
        name: this.selected?.name || '',
        tagline: '',
        traits: [],
        voice: '',
        quirk: '',
        personalCreed: '',
        practice: '',
        tools: null,
        version: 0,
        custom: false,
      }
    },
    skillsFor() {
      return this.growth.skills?.[this.selectedId] || []
    },
    skillSeedCount() {
      return this.skillsFor.filter((skill) => skill.origin === 'seed').length
    },
    skillAdoptedCount() {
      return this.skillsFor.filter((skill) => skill.origin === 'catalog').length
    },
    autonomyFor() {
      return (this.growth.autonomyLog || [])
        .filter((entry) => entry.roboId === this.selectedId)
        .slice(-8)
        .reverse()
    },
    proposalIds() {
      return Object.keys(this.growth.proposals || {})
    },
    historyFor() {
      return this.growth.history?.[this.selectedId] || []
    },
    modelLabel() {
      const name = String(this.growthModel || this.model || '').replace(/:latest$/, '')
      return name.length > 32 ? `${name.slice(0, 30)}…` : name || 'the unit model'
    },
  },
  async mounted() {
    window.addEventListener('keydown', this.onKeydown)
    this.selectedId = this.robos.some((robo) => robo.id === this.initialId)
      ? this.initialId
      : this.robos[0]?.id || ''
    await this.load()
    this.$nextTick(() => this.$refs.closeBtn?.focus())
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    async load() {
      this.loading = true
      this.error = ''
      try {
        this.growth = await getGrowth()
        this.growthModel = this.growth.model || this.model
        this.autonomy = Boolean(this.growth.autonomy)
        this.syncDraft()
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
      }
    },
    syncDraft() {
      this.localIdentity = null
      const pending = this.growth.proposals?.[this.selectedId]
      this.draft = pending
        ? {
            ...pending,
            traits: [...(pending.traits || [])],
            tools: Array.isArray(pending.tools) ? [...pending.tools] : [],
          }
        : null
      this.traitsText = pending ? (pending.traits || []).join(', ') : ''
      this.error = ''
      this.notice = ''
    },
    select(id) {
      if (this.busy || id === this.selectedId) return
      this.selectedId = id
      this.syncDraft()
    },
    async reflect() {
      if (this.busy || !this.selected || !this.linked) return
      this.busy = true
      this.error = ''
      this.notice = ''
      try {
        const result = await reflectRobo(this.selectedId, this.roomId)
        this.growth = result.growth
        this.growthModel = result.proposal.model || this.growthModel
        this.draft = {
          ...result.proposal,
          traits: [...(result.proposal.traits || [])],
          tools: Array.isArray(result.proposal.tools) ? [...result.proposal.tools] : [],
        }
        this.traitsText = (result.proposal.traits || []).join(', ')
        this.localIdentity = null
        this.notice = 'Proposal ready. Review and edit it, then approve.'
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },
    async approve() {
      if (this.busy || !this.draft) return
      const traits = this.traitsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      if (traits.length < 2) {
        this.error = 'Keep at least two traits.'
        return
      }
      this.busy = true
      this.error = ''
      try {
        const result = await approveRobo(this.selectedId, {
          name: this.draft.name,
          tagline: this.draft.tagline,
          traits,
          voice: this.draft.voice,
          quirk: this.draft.quirk,
          personalCreed: this.draft.personalCreed || '',
          practice: this.draft.practice || '',
          tools: this.draft.tools || [],
          rationale: this.draft.rationale,
        })
        this.growth = result.growth
        this.localIdentity = result.identity
        this.draft = null
        this.traitsText = ''
        this.notice = 'Applied. The role lock held; the next huddle uses the new identity.'
        this.$emit('updated')
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },
    async discard() {
      if (this.busy) return
      this.busy = true
      this.error = ''
      try {
        const result = await discardRobo(this.selectedId)
        this.growth = result.growth
        this.draft = null
        this.traitsText = ''
        this.notice = 'Proposal discarded. Nothing changed.'
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },
    async toggleAutonomy() {
      if (this.busy) return
      this.busy = true
      this.error = ''
      try {
        const saved = await saveSettings({ autonomy: !this.autonomy })
        this.autonomy = Boolean(saved.autonomy)
        this.notice = this.autonomy
          ? 'Autonomy armed. It still cannot touch role, unit creed, permissions or safety.'
          : 'Autonomy paused. Existing identities and skills stay.'
        this.$emit('updated')
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },
    skillOriginLabel(skill) {
      if (skill.origin === 'seed') return 'SEED'
      if (skill.origin === 'catalog') return 'ADOPTED'
      return 'LEARNED'
    },
    skillOriginClass(skill) {
      if (skill.origin === 'seed') return 'seed'
      if (skill.origin === 'catalog') return 'catalog'
      return 'learned'
    },
    async runAutonomyNow() {
      if (this.busy || this.runningAuto || !this.selected || !this.autonomy) return
      this.runningAuto = true
      this.error = ''
      this.notice = ''
      try {
        const result = await runAutonomyApi(this.selectedId, this.roomId)
        this.growth = result.growth
        this.localIdentity = result.growth.identities?.[this.selectedId] || null
        this.draft = null
        this.traitsText = ''
        const changed = [result.identity, result.skill]
          .filter((item) => item?.status === 'applied')
          .map((item) => item.name || 'update')
        this.notice = changed.length
          ? `Applied: ${changed.join(', ')}. Role lock held.`
          : 'No change: cooldown or caps active.'
        this.$emit('updated')
      } catch (error) {
        this.error = error.message
      } finally {
        this.runningAuto = false
      }
    },
    async forgetSkill(skillId) {
      if (this.busy || !this.selected) return
      if (!window.confirm('Forget this learned skill?')) return
      this.busy = true
      this.error = ''
      try {
        const result = await forgetSkillApi(this.selectedId, skillId)
        this.growth = result.growth
        this.notice = 'Skill forgotten.'
        this.$emit('updated')
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },
    async revert() {
      if (this.busy) return
      if (
        !window.confirm(
          `Return ${this.selected.name} to the original ${this.selected.defaultName} identity?`,
        )
      ) {
        return
      }
      this.busy = true
      this.error = ''
      try {
        const result = await revertRobo(this.selectedId)
        this.growth = result.growth
        const base = this.currentIdentity
        this.localIdentity = {
          ...base,
          name: this.selected.defaultName,
          tagline: this.selected.role,
          traits: [],
          voice: '',
          quirk: '',
          version: 0,
          custom: false,
        }
        this.draft = null
        this.traitsText = ''
        this.notice = 'Original identity restored.'
        this.$emit('updated')
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },
    onKeydown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      this.$emit('close')
    },
  },
}
</script>

<style scoped>
.identity-shell {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 5, 9, 0.72);
  backdrop-filter: blur(10px);
  animation: identity-in 0.22s ease-out;
}

@keyframes identity-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.identity {
  display: flex;
  flex-direction: column;
  width: min(940px, 96vw);
  height: min(760px, 92vh);
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  background: #070c14;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.7);
}

.identity-top {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 0 0 auto;
  min-height: 64px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(9, 15, 24, 0.8);
}

.identity-top > div:first-child {
  flex: 1;
  min-width: 0;
}

.kicker {
  margin: 0 0 2px;
  color: var(--mint);
  font-size: 8px;
  letter-spacing: 0.16em;
}

.identity-top h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.top-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--dim);
  font-size: 8px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.top-meta .led {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--danger);
}

.top-meta .led.on {
  background: var(--mint);
  box-shadow: 0 0 6px var(--mint);
}

.top-meta .sep {
  opacity: 0.4;
}

.top-meta .model {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 20px;
  line-height: 1;
}

.close:hover,
.close:focus-visible {
  border-color: rgba(94, 241, 194, 0.5);
  color: var(--mint);
  outline: none;
}

.loading {
  display: grid;
  place-items: center;
  flex: 1;
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.16em;
}

.identity-body {
  display: grid;
  grid-template-columns: 206px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}

.rail {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  padding: 10px;
  border-right: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.12);
}

.rail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  text-align: left;
}

.rail-item:hover {
  border-color: var(--line);
  background: rgba(255, 255, 255, 0.025);
}

.rail-item.on {
  border-color: color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 8%, transparent);
}

.rail-glyph {
  display: grid;
  place-items: center;
  width: 26px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  border-radius: 7px;
  font-family: var(--mono);
  font-size: 16px;
  font-weight: 700;
}

.rail-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.rail-copy strong {
  overflow: hidden;
  color: var(--text);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-copy small {
  color: var(--dim);
  font-size: 9px;
}

.rail-pending {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--amber);
  box-shadow: 0 0 7px var(--amber);
}

.detail {
  overflow-y: auto;
  padding: 20px 24px 24px;
}

.identity-head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.identity-head :deep(.robo) {
  flex: 0 0 auto;
}

.identity-title {
  min-width: 0;
}

.role-lock {
  margin: 0 0 4px;
  color: var(--mint);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.identity-title h3 {
  margin: 0;
  font-size: 30px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.origin {
  margin: 3px 0 0;
  color: var(--dim);
  font-size: 8px;
  letter-spacing: 0.06em;
}

.tagline {
  max-width: 600px;
  margin: 8px 0 0;
  color: #a9bfd3;
  font-size: 12px;
  line-height: 1.55;
}

.control-note {
  margin: 16px 0 10px;
  padding: 9px 11px;
  border-left: 2px solid var(--mint);
  background: rgba(94, 241, 194, 0.035);
  color: #91a9bd;
  font-size: 10.5px;
  line-height: 1.55;
}

.control-note strong {
  color: var(--mint);
  font-weight: 600;
}

.lock-box {
  padding: 9px 11px;
  border: 1px dashed var(--line);
  border-radius: 9px;
  color: #748ca2;
  font-size: 10.5px;
  line-height: 1.55;
}

.lock-label {
  display: block;
  margin-bottom: 3px;
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.1em;
}

.lock-box p {
  margin: 0;
}

.notice {
  margin-top: 12px;
  padding: 7px 9px;
  border: 1px solid rgba(94, 241, 194, 0.25);
  border-radius: 7px;
  background: rgba(94, 241, 194, 0.05);
  color: var(--mint);
  font-size: 8.5px;
  line-height: 1.45;
}

.error {
  margin: 12px 0 0;
  color: #ff9c9c;
  font-size: 11px;
  line-height: 1.5;
}

.idle-panel {
  margin-top: 16px;
}

.traits {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.trait {
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 99px;
  color: var(--muted);
  font-size: 8px;
  letter-spacing: 0.05em;
}

.voice-line {
  margin: 5px 0;
  color: #9cb2c6;
  font-size: 11px;
  line-height: 1.5;
}

.voice-line .mono {
  margin-right: 7px;
  color: var(--dim);
  font-size: 8px;
  letter-spacing: 0.08em;
}

.reflect {
  margin-top: 14px;
}

.hint {
  max-width: 620px;
  margin: 8px 0 0;
  color: var(--dim);
  font-size: 9.5px;
  line-height: 1.5;
}

.review {
  margin-top: 16px;
  padding: 13px;
  border: 1px solid rgba(176, 139, 255, 0.28);
  border-radius: 12px;
  background: rgba(176, 139, 255, 0.035);
}

.review-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.proposal-tag {
  color: var(--violet);
  font-size: 8px;
  letter-spacing: 0.08em;
}

.waiting {
  color: var(--amber);
  font-size: 8px;
  letter-spacing: 0.08em;
}

.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field.full {
  grid-column: 1 / -1;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.footer-actions {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.history summary {
  color: var(--dim);
  font-size: 8px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.history ul {
  margin: 7px 0 0;
  padding: 0 0 0 13px;
  color: #71879c;
  font-size: 10px;
  line-height: 1.6;
}

.revert {
  padding: 5px 8px;
  border: 1px solid rgba(255, 107, 107, 0.28);
  border-radius: 6px;
  background: transparent;
  color: #d98b8b;
  font-family: var(--mono);
  font-size: 7.5px;
  letter-spacing: 0.06em;
}

.revert:hover {
  background: rgba(255, 107, 107, 0.08);
}

.autonomy-box {
  margin: 14px 0;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
}

.autonomy-box.on {
  border-color: rgba(94, 241, 194, 0.34);
  background: rgba(94, 241, 194, 0.035);
}

.autonomy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.autonomy-head > div {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.autonomy-head strong {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.1em;
}

.autonomy-box.on .autonomy-head strong {
  color: var(--mint);
}

.autonomy-box p {
  margin: 7px 0 0;
  color: #8299ad;
  font-size: 9.5px;
  line-height: 1.5;
}

.autonomy-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 9px;
}

.run-auto {
  margin: 0;
  flex: 0 0 auto;
}

.skills-box {
  margin: 14px 0;
  padding: 11px 0 0;
  border-top: 1px solid var(--line);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.1em;
}

.skill-card {
  margin-top: 7px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.018);
}

.skill-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.skill-head strong {
  color: #b9cfe0;
  font-size: 11px;
  font-weight: 600;
}

.auto-badge {
  padding: 2px 5px;
  border: 1px solid rgba(94, 241, 194, 0.24);
  border-radius: 4px;
  color: var(--mint);
  font-size: 6.5px;
  letter-spacing: 0.08em;
}

.skill-origin {
  padding: 2px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--dim);
  font-size: 6.5px;
  letter-spacing: 0.08em;
}

.skill-origin.seed {
  border-color: rgba(104, 163, 210, 0.32);
  color: #8bb8dc;
}

.skill-origin.catalog {
  border-color: rgba(255, 194, 74, 0.38);
  color: var(--amber);
}

.skill-origin.learned {
  border-color: rgba(94, 241, 194, 0.24);
  color: var(--mint);
}

.skill-forget {
  margin-left: auto;
  padding: 3px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7px;
  letter-spacing: 0.05em;
}

.skill-forget:hover {
  border-color: rgba(255, 107, 107, 0.4);
  color: #e3a0a0;
}

.skill-trigger {
  margin: 5px 0 0;
  color: #8299ad;
  font-size: 9.5px;
  line-height: 1.45;
}

.skill-trigger .mono {
  margin-right: 4px;
  color: var(--dim);
  font-size: 7px;
}

.skill-card ol {
  margin: 5px 0 0;
  padding-left: 15px;
  color: #6f869b;
  font-size: 9px;
  line-height: 1.5;
}

.autonomy-log {
  margin-top: 10px;
}

.autonomy-log summary {
  color: var(--dim);
  font-size: 7.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.autonomy-log ul {
  margin: 6px 0 0;
  padding-left: 13px;
  color: #71879c;
  font-size: 9px;
  line-height: 1.5;
}

.tool-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 10px;
  margin-top: 5px;
}

.tool-picks label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #8ba3b7;
  font-family: var(--mono);
  font-size: 8px;
}

.tool-picks input {
  accent-color: var(--mint);
}

.identity-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 20px;
  border-top: 1px solid var(--line);
  color: #415467;
  font-size: 7.5px;
  letter-spacing: 0.07em;
}

@media (max-width: 760px) {
  .identity-shell {
    padding: 0;
  }

  .identity {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
  }

  .identity-top {
    gap: 8px;
    padding: 10px 12px;
  }

  .top-meta {
    display: none;
  }

  .identity-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .rail {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 7px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .rail-item {
    flex: 0 0 auto;
    min-width: 132px;
    padding: 6px;
  }

  .detail {
    padding: 14px;
  }

  .identity-head {
    align-items: flex-start;
  }

  .identity-head :deep(.robo) {
    width: 64px !important;
  }

  .identity-title h3 {
    font-size: 24px;
  }

  .fields {
    grid-template-columns: 1fr;
  }

  .identity-foot {
    padding: 0 12px;
    font-size: 7px;
  }

  .identity-foot span:first-child {
    max-width: 70%;
  }
}
</style>
