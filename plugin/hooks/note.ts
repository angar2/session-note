// 노트·항목·제안·과정의 형식과 파일 글자 ↔ 노트 변환 (spec DATA.md 2·4절)

import type { Item, Note, Process, Proposal } from '../types'

export type { Item, ItemSource, Note, Process, Proposal, Step, StepStatus } from '../types'

export const emptyNote = (): Note => ({ version: 1, items: [], proposals: [], processes: [] })

export const isEmpty = (note: Note) =>
  note.items.length === 0 && note.proposals.length === 0 && note.processes.length === 0

export const newId = () => crypto.randomUUID()

// 열린 항목은 먼저 올라온 것이 위, 완료 항목은 최근에 끝난 것이 위
export const openItems = (n: Note) =>
  n.items.filter(item => item.status === 'open').sort((a, b) => a.createdAt.localeCompare(b.createdAt))

export const doneItems = (n: Note) =>
  n.items.filter(item => item.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))

// 완료 제안의 대상이 지워졌거나 이미 완료면 그 제안은 없는 것으로 본다(spec DATA.md 2절)
export const liveProposals = (n: Note) =>
  n.proposals.filter(p => p.kind === 'new' || n.items.some(item => item.id === p.itemId && item.status === 'open'))

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
  const { version, items, proposals, processes } = raw as Record<string, unknown>
  if (version !== 1) return { ok: false, reason: `unknown version ${String(version)}` }
  if (!Array.isArray(items) || !Array.isArray(proposals)) return { ok: false, reason: 'missing lists' }
  // processes가 없는 1.0.x 파일은 과정이 빈 노트다
  if (processes !== undefined && !Array.isArray(processes)) return { ok: false, reason: 'processes is not a list' }
  return {
    ok: true,
    note: {
      version: 1,
      items: items as Item[],
      proposals: proposals as Proposal[],
      processes: (processes ?? []) as Process[],
    },
  }
}

export const formatNote = (note: Note) => `${JSON.stringify(note, null, 2)}\n`
