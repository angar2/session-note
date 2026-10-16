// 노트·항목·제안의 형식과 파일 글자 ↔ 노트 변환 (spec DATA.md 2절)

export type ItemSource = 'proposal' | 'user' | 'instruction' | 'auto'

export type Item = {
  id: string
  title: string
  body: string
  source: ItemSource
  status: 'open' | 'done'
  createdAt: string
  doneAt: string | null
}

export type Proposal =
  | { id: string; kind: 'new'; title: string; body: string; proposedAt: string }
  | { id: string; kind: 'done'; itemId: string; proposedAt: string }

export type Note = { version: 1; items: Item[]; proposals: Proposal[] }

export const emptyNote = (): Note => ({ version: 1, items: [], proposals: [] })

export const isEmpty = (note: Note) => note.items.length === 0 && note.proposals.length === 0

export const newId = () => crypto.randomUUID()

// 시간대를 붙인 ISO 형식: 2026-10-15T14:32:00+09:00
export function isoAt(ms: number): string {
  const d = new Date(ms)
  const offset = -d.getTimezoneOffset()
  const local = new Date(ms + offset * 60_000).toISOString().slice(0, 19)
  const sign = offset >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const mm = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${local}${sign}${hh}:${mm}`
}

export type Parsed = { ok: true; note: Note } | { ok: false; reason: string }

export function parseNote(text: string): Parsed {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not JSON' }
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'not an object' }
  const { version, items, proposals } = raw as Record<string, unknown>
  if (version !== 1) return { ok: false, reason: `unknown version ${String(version)}` }
  if (!Array.isArray(items) || !Array.isArray(proposals)) return { ok: false, reason: 'missing lists' }
  return { ok: true, note: { version: 1, items: items as Item[], proposals: proposals as Proposal[] } }
}

export const formatNote = (note: Note) => `${JSON.stringify(note, null, 2)}\n`
