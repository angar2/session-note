// 세션(모델)에게 노트를 전하는 글 — 사용자가 바꾼 것 한 줄과 노트 전체 (spec AGENT.md 4절). 세션이 읽는 글이라 영어 하나로 쓴다
import type { EngineInterface } from 'claude-code'

import { doneItems, liveProposals, openItems } from './note'
import type { Item, Note, Proposal } from './note'

// 노트 전체를 한 번에 전하는 글의 상한 — 넘으면 내용을 빼고 제목만 보낸다
const LIMIT = 4000
const HEAD = '[session-note]'

// 세션에게 보이는 번호는 id의 앞 8글자다
export const refOf = (id: string) => id.slice(0, 8)

const named = (item: Item) => `[${refOf(item.id)}] "${item.title}"`

export const told = {
  added: (item: Item) => `${HEAD} The user added ${named(item)} to the note.`,
  edited: (item: Item) =>
    `${HEAD} The user edited ${named(item)}${item.body === '' ? '' : ` — details: ${item.body}`}.`,
  removed: (item: Item) => `${HEAD} The user deleted ${named(item)} from the note.`,
  completed: (item: Item) => `${HEAD} The user completed ${named(item)}.`,
  reopened: (item: Item) => `${HEAD} The user reopened ${named(item)}.`,
  accepted: (item: Item) => `${HEAD} The user accepted your proposal; it is now item ${named(item)}.`,
  dismissed: (title: string) => `${HEAD} The user dismissed your proposal "${title}".`,
  confirmed: (item: Item) => `${HEAD} The user confirmed ${named(item)} is done.`,
  notYet: (item: Item) => `${HEAD} The user said ${named(item)} is not done yet; it stays open.`,
}

const proposalLine = (note: Note, p: Proposal) => {
  if (p.kind === 'new') return `- [${refOf(p.id)}] new item: "${p.title}"`
  const item = note.items.find(one => one.id === p.itemId)
  return `- [${refOf(p.id)}] done: ${item === undefined ? `[${refOf(p.itemId)}]` : named(item)}`
}

// 노트를 글로 — 열린 항목은 제목과 내용, 완료 항목은 제목, 사용자가 아직 답하지 않은 제안
export function describe(note: Note, withBody: boolean): string {
  const open = openItems(note)
  const done = doneItems(note)
  const proposals = liveProposals(note)
  const lines = [`${HEAD} The session note now:`, 'Open items:']
  if (open.length === 0) lines.push('- (none)')
  for (const item of open) {
    lines.push(`- ${named(item)}`)
    if (withBody && item.body !== '') lines.push(`  ${item.body}`)
  }
  if (done.length > 0) lines.push('Done items:', ...done.map(item => `- ${named(item)}`))
  if (proposals.length > 0)
    lines.push('Your proposals still waiting for the user:', ...proposals.map(p => proposalLine(note, p)))
  return lines.join('\n')
}

// 압축 직후에 전하는 노트 전체. 비었으면 한 줄, 상한을 넘으면 제목만
export function wholeNote(note: Note): string {
  if (note.items.length === 0 && liveProposals(note).length === 0) return `${HEAD} This session's note is empty.`
  const full = describe(note, true)
  if (full.length <= LIMIT) return full
  return `${describe(note, false)}\nDetails were left out; use the note tool's list action to read them.`
}

// 세션에게 한 줄을 전한다. 사용자 화면에는 보이지 않고 모델만 읽는다. 거부되면 디버그 로그에만 남긴다(6-4 ⑦)
export async function tell($: EngineInterface, text: string) {
  try {
    const stored = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
    if ('deny' in stored) $.ui.log(`not told: ${String(stored.deny)}`, { to: 'debug' })
  } catch (error) {
    $.ui.log(`not told: ${String(error)}`, { to: 'debug' })
  }
}
