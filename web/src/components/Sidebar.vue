<template>
  <aside class="sidebar" :class="{ open }">
    <div class="brand">
      <div class="mark" aria-hidden="true">
        <span style="--c: #3ee6ff">2</span>
        <span style="--c: #ffc24a">1</span>
        <span style="--c: #ff5fa8">0</span>
      </div>
      <div class="brand-text">
        <h1>HUDDLE</h1>
        <p>2·2·100 ROBO CONSOLE</p>
      </div>
    </div>

    <button class="new" @click="$emit('create')"><span>+</span> NEW HUDDLE</button>

    <p class="section-label mono">HUDDLES</p>
    <nav class="rooms">
      <div
        v-for="room in rooms"
        :key="room.id"
        class="room"
        :class="{ active: room.id === currentId }"
        @click="$emit('select', room.id)"
      >
        <div class="room-head">
          <input
            v-if="renaming === room.id"
            v-model="draft"
            class="rename mono"
            spellcheck="false"
            @click.stop
            @keydown.enter.prevent="commit(room)"
            @keydown.esc.prevent="cancel(room)"
            @blur="commit(room)"
          />
          <template v-else>
            <span class="room-name" :title="room.name" @dblclick.stop="startRename(room)">{{
              room.name
            }}</span>
            <button class="remove" title="Delete huddle" @click.stop="$emit('remove', room.id)">
              ×
            </button>
          </template>
        </div>
        <p class="preview">{{ room.preview || 'Empty room. Send the first mission.' }}</p>
        <div class="meta mono">
          <span>{{ room.count }} lines</span>
          <span>{{ when(room.updatedAt) }}</span>
        </div>
      </div>
      <p v-if="!rooms.length" class="no-rooms">No huddles yet.</p>
    </nav>

    <div class="sidebar-foot">
      <div class="link mono">
        <span class="led" :class="{ on: online }"></span>
        {{ online ? 'OLLAMA LINKED' : 'LINK OFFLINE' }}
      </div>
      <div class="engine mono">{{ provider.toUpperCase() }} ENGINE</div>
      <p>Local-first. No account. Your machine is the cloud.</p>
    </div>
  </aside>
</template>

<script>
export default {
  name: 'Sidebar',
  props: {
    rooms: { type: Array, default: () => [] },
    currentId: { type: String, default: '' },
    online: Boolean,
    provider: { type: String, default: 'ollama' },
    open: Boolean,
  },
  emits: ['select', 'create', 'rename', 'remove'],
  data() {
    return { renaming: '', draft: '' }
  },
  methods: {
    startRename(room) {
      this.renaming = room.id
      this.draft = room.name
      this.$nextTick(() => this.$el.querySelector('.rename')?.focus())
    },
    commit(room) {
      const name = this.draft.trim()
      this.renaming = ''
      if (name && name !== room.name) this.$emit('rename', { id: room.id, name })
    },
    cancel(room) {
      this.draft = room.name
      this.renaming = ''
    },
    when(ts) {
      if (!ts) return ''
      const delta = Date.now() - ts
      if (delta < 60_000) return 'now'
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`
      return `${Math.floor(delta / 86_400_000)}d`
    },
  },
}
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  padding: 18px 14px 14px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(10, 17, 28, 0.72), rgba(4, 7, 12, 0.35));
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 4px 18px;
}

.mark {
  display: flex;
  gap: 3px;
}

.mark span {
  display: grid;
  place-items: center;
  width: 20px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--c) 9%, transparent);
  color: var(--c);
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 0 12px color-mix(in srgb, var(--c) 16%, transparent);
}

.mark span:nth-child(2) {
  transform: translateY(-3px);
}

.brand-text h1 {
  margin: 0;
  font-family: var(--mono);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.brand-text p {
  margin: 2px 0 0;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 7.5px;
  letter-spacing: 0.12em;
}

.new {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 11px;
  border: 1px solid rgba(94, 241, 194, 0.32);
  border-radius: 9px;
  background: rgba(94, 241, 194, 0.055);
  color: var(--mint);
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  transition: 0.16s ease;
}

.new:hover {
  background: rgba(94, 241, 194, 0.12);
  border-color: rgba(94, 241, 194, 0.5);
}

.new span {
  font-size: 15px;
  line-height: 1;
}

.section-label {
  margin: 22px 4px 8px;
  color: var(--dim);
  font-size: 8.5px;
  letter-spacing: 0.16em;
}

.rooms {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -4px;
  padding: 0 4px;
}

.room {
  padding: 9px 10px 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: 0.14s ease;
}

.room:hover {
  background: rgba(255, 255, 255, 0.025);
}

.room.active {
  border-color: rgba(94, 241, 194, 0.22);
  background: rgba(94, 241, 194, 0.055);
}

.room-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.room-name {
  flex: 1;
  overflow: hidden;
  color: #c4d6e8;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room.active .room-name {
  color: #effaff;
}

.remove {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dim);
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: 0.14s ease;
}

.room:hover .remove {
  opacity: 1;
}

.remove:hover {
  color: var(--danger);
  background: rgba(255, 107, 107, 0.1);
}

.rename {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 5px;
  border: 1px solid rgba(94, 241, 194, 0.45);
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.3);
  font-size: 11px;
  outline: none;
}

.preview {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--dim);
  font-size: 10px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  color: #42566b;
  font-size: 8px;
  letter-spacing: 0.05em;
}

.no-rooms {
  padding: 8px 10px;
  color: var(--dim);
  font-size: 11px;
}

.sidebar-foot {
  padding: 14px 5px 0;
  border-top: 1px solid var(--line);
  margin-top: 12px;
}

.link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 8.5px;
  letter-spacing: 0.1em;
}

.led {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 6px var(--danger);
}

.led.on {
  background: var(--mint);
  box-shadow: 0 0 7px var(--mint);
}

.engine {
  margin-top: 4px;
  color: var(--dim);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.sidebar-foot p {
  margin: 10px 0 0;
  color: #3f5266;
  font-size: 9px;
  line-height: 1.5;
}

@media (max-width: 899px) {
  .sidebar {
    position: fixed;
    z-index: 70;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(280px, 86vw);
    border-right: 1px solid var(--line);
    background: #070d16;
    box-shadow: 24px 0 60px rgba(0, 0, 0, 0.55);
    transform: translateX(-102%);
    transition: transform 0.24s ease;
  }

  .sidebar.open {
    transform: none;
  }
}
</style>
