function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text) {
  return text
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
}

/**
 * Escapes everything first, then adds a deliberately small subset of markdown:
 * fenced code, inline code, bold, italics and links. No raw HTML, ever.
 */
export function renderMarkdown(input) {
  const source = String(input ?? '')
  const parts = []
  let last = 0
  const fence = /```([a-z0-9]*)\n?([\s\S]*?)```/gi
  let match
  while ((match = fence.exec(source))) {
    if (match.index > last) parts.push({ type: 'text', value: source.slice(last, match.index) })
    parts.push({ type: 'code', value: match[2].replace(/\n$/, '') })
    last = fence.lastIndex
  }
  if (last < source.length) parts.push({ type: 'text', value: source.slice(last) })

  return parts
    .map((part) => {
      if (part.type === 'code') {
        return `<pre class="md-code"><code>${escapeHtml(part.value)}</code></pre>`
      }
      const trimmed = part.value.trim()
      if (!trimmed) return ''
      const html = inline(escapeHtml(trimmed)).replace(/\n/g, '<br />')
      return `<p>${html}</p>`
    })
    .join('')
}

export function prettyArgs(args) {
  if (!args || typeof args !== 'object') return ''
  return Object.entries(args)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      return `${key}: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`
    })
    .join(' · ')
}
