// 세션(모델)이 쓰는 할 일 도구(todo) — 목록·제안·완료 제안, 사용자가 시킨 추가·완료·수정·삭제·되돌리기, 대화로 받은 제안 (spec AGENT.md 1~3절)
import type { EngineInterface, On } from 'claude-code'

import { isoAt, newId, openItems } from './note'
import type { Item, Note, Proposal } from './note'
import { describe, refOf } from './tell'
import {
  acceptIn,
  completeIn,
  editIn,
  forgetItem,
  liveProposals,
  readNote,
  removeIn,
  reopenIn,
  saveChange,
} from './view'

const NAME = 'todo'
const CALLED = 'mcp__session-note__todo'

// 제안 기준과 완료 대조 규칙은 이 설명문에 고정한다 — 매 답변 노트를 넣지 않는다(성공 기준 ③)
const DESCRIPTION = `The session note: a short list of things to do or check in this session, shared with the user. The user sees it above the prompt and in a side pane, and can add, edit, complete or delete items there; those changes reach you as messages starting with [session-note]. Items and proposals are named by an 8-character ref such as [a1b2c3d4].

Actions:
- list: the whole note (open items with details, done items, your proposals still waiting).
- propose: suggest a new item (title, optional body). It waits on the user's band until they add or dismiss it.
- propose_done: suggest that an open item is done (id). The user completes it or says not yet.
- add: add an item (title, optional body) — only when the user tells you to note something.
- complete: complete an item (id) — only when the user tells you it is done.
- edit: change an item's title and/or body (id, title, body; an empty body clears it) — only when the user tells you to.
- delete: delete an item (id) — only when the user tells you to.
- reopen: reopen a done item (id) — only when the user tells you it is not done.
- accept: accept a waiting proposal (id) — when the user answers it in the conversation ("keep it").

Never edit, delete or reopen items on your own. To change an item, edit it; do not add a new item in its place.

When to propose: only what the conversation clearly put off for later ("later", "let's skip that for now") and questions left without a conclusion ("is this right?", "we should check that"). Do not propose work you are about to do now, details you may decide yourself, or steps of your own plan. Never ask in your reply whether to add something to the note, and do not point the user to your proposals; they see them on the band. Propose and move on.

Completion check: when you finish a piece of work, and when the user asks you to check the note, compare the open items with what was done. For an item that looks done, use propose_done; never complete it yourself unless the user tells you to. After finishing a piece of work, if open items remain, mention them briefly at the end of your reply. Do not check the note on every turn.`

const SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'propose', 'propose_done', 'add', 'complete', 'edit', 'delete', 'reopen', 'accept'],
    },
    title: { type: 'string', description: 'The item title, one short line (propose, add, edit).' },
    body: { type: 'string', description: 'Optional details (propose, add, edit).' },
    id: {
      type: 'string',
      description: 'The 8-character ref of an item or proposal (propose_done, complete, edit, delete, reopen, accept).',
    },
  },
  required: ['action'],
} as const

type Answer = { result: string } | { deny: string }

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// [a1b2c3d4]·a1b2c3d4·id 전체 모두 받는다
const refIn = (value: unknown) => textOf(value).replace(/^\[|\]$/g, '')

const sameRef = (id: string, ref: string) => ref !== '' && (id === ref || refOf(id) === ref)

const named = (item: Item) => `[${refOf(item.id)}] "${item.title}"`

const unsaved: Answer = { deny: "Couldn't save the note (or it is not open yet). Try again later." }

export function registerTool($: EngineInterface) {
  return $.tool.register({ name: NAME, description: DESCRIPTION, inputSchema: SCHEMA, isDeferred: false })
}

export function serveTool(on: On) {
  on('tool.call', { tool: CALLED }, async ($, e) => answer($, e as unknown as Record<string, unknown>)).catch(() => ({
    deny: 'The todo tool failed. Try again later.',
  }))
}

async function answer($: EngineInterface, args: Record<string, unknown>): Promise<Answer> {
  const action = textOf(args['action'])
  if (action === 'list') return { result: describe(await readNote($), true) }
  if (action === 'propose') return propose($, textOf(args['title']), textOf(args['body']))
  if (action === 'add') return add($, textOf(args['title']), textOf(args['body']))
  const ref = refIn(args['id'])
  if (action === 'propose_done') return proposeDone($, ref)
  if (action === 'complete') return complete($, ref)
  if (action === 'edit') return edit($, ref, textOf(args['title']), bodyIn(args['body']))
  if (action === 'delete') return remove($, ref)
  if (action === 'reopen') return reopen($, ref)
  if (action === 'accept') return accept($, ref)
  return {
    deny: `Unknown action "${action}". Use list, propose, propose_done, add, complete, edit, delete, reopen or accept.`,
  }
}

const openItem = (n: Note, ref: string) => openItems(n).find(item => sameRef(item.id, ref))

const anyItem = (n: Note, ref: string) => n.items.find(item => sameRef(item.id, ref))

// edit의 내용 — 주지 않았으면 그대로 두고, 빈 글이면 비운다
const bodyIn = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined)

async function propose($: EngineInterface, title: string, body: string): Promise<Answer> {
  if (title === '') return { deny: 'A proposal needs a title.' }
  const current = await readNote($)
  const same = (other: string) => other.toLowerCase() === title.toLowerCase()
  if (openItems(current).some(item => same(item.title))) return { result: `"${title}" is already an open item.` }
  if (current.proposals.some(p => p.kind === 'new' && same(p.title)))
    return { result: `"${title}" is already proposed and waiting for the user.` }
  const proposal: Proposal = { id: newId(), kind: 'new', title, body, proposedAt: isoAt(await $.clock.now()) }
  const saved = await saveChange($, n => ({ ...n, proposals: [...n.proposals, proposal] }))
  if (saved === null) return unsaved
  return {
    result: `Proposed "${title}" [${refOf(proposal.id)}]. It waits on the user's band; do not mention it in your reply.`,
  }
}

async function proposeDone($: EngineInterface, ref: string): Promise<Answer> {
  const item = openItem(await readNote($), ref)
  if (item === undefined) return { deny: `No open item [${ref}]. Use list to see the refs.` }
  if ((await readNote($)).proposals.some(p => p.kind === 'done' && p.itemId === item.id))
    return { result: `${named(item)} is already proposed as done and waiting for the user.` }
  const proposal: Proposal = { id: newId(), kind: 'done', itemId: item.id, proposedAt: isoAt(await $.clock.now()) }
  const saved = await saveChange($, n => ({ ...n, proposals: [...n.proposals, proposal] }))
  if (saved === null) return unsaved
  return { result: `Proposed ${named(item)} as done. It waits on the user's band; do not mention it in your reply.` }
}

async function add($: EngineInterface, title: string, body: string): Promise<Answer> {
  if (title === '') return { deny: 'An item needs a title.' }
  const item: Item = {
    id: newId(),
    title,
    body,
    source: 'instruction',
    status: 'open',
    createdAt: isoAt(await $.clock.now()),
    doneAt: null,
  }
  const saved = await saveChange($, n => ({ ...n, items: [...n.items, item] }))
  if (saved === null) return unsaved
  return { result: `Added ${named(item)}.` }
}

async function complete($: EngineInterface, ref: string): Promise<Answer> {
  const item = openItem(await readNote($), ref)
  if (item === undefined) return { deny: `No open item [${ref}]. Use list to see the refs.` }
  const at = isoAt(await $.clock.now())
  const saved = await saveChange($, n => completeIn(n, item.id, at))
  if (saved === null) return unsaved
  return { result: `Completed ${named(item)}.` }
}

async function edit($: EngineInterface, ref: string, title: string, body: string | undefined): Promise<Answer> {
  const item = anyItem(await readNote($), ref)
  if (item === undefined) return { deny: `No item [${ref}]. Use list to see the refs.` }
  if (title === '' && body === undefined) return { deny: 'Give a new title or body to edit.' }
  const saved = await saveChange($, n => editIn(n, item.id, title, body))
  if (saved === null) return unsaved
  const edited = saved.items.find(one => one.id === item.id)
  if (edited === undefined) return { deny: `The item [${ref}] is gone.` }
  return { result: `Edited ${named(edited)}.` }
}

async function remove($: EngineInterface, ref: string): Promise<Answer> {
  const item = anyItem(await readNote($), ref)
  if (item === undefined) return { deny: `No item [${ref}]. Use list to see the refs.` }
  const saved = await saveChange($, n => removeIn(n, item.id))
  if (saved === null) return unsaved
  await forgetItem($, item.id)
  return { result: `Deleted ${named(item)}.` }
}

async function reopen($: EngineInterface, ref: string): Promise<Answer> {
  const item = anyItem(await readNote($), ref)
  if (item === undefined) return { deny: `No item [${ref}]. Use list to see the refs.` }
  if (item.status === 'open') return { result: `${named(item)} is already open.` }
  const saved = await saveChange($, n => reopenIn(n, item.id))
  if (saved === null) return unsaved
  return { result: `Reopened ${named(item)}.` }
}

async function accept($: EngineInterface, ref: string): Promise<Answer> {
  const proposal = liveProposals(await readNote($)).find(p => sameRef(p.id, ref))
  if (proposal === undefined) return { deny: `No waiting proposal [${ref}]. Use list to see the refs.` }
  const at = isoAt(await $.clock.now())
  const itemId = newId()
  const saved = await saveChange($, n => {
    const latest = n.proposals.find(p => p.id === proposal.id)
    return latest === undefined ? n : acceptIn(n, latest, at, itemId)
  })
  if (saved === null) return unsaved
  const item = saved.items.find(one => one.id === (proposal.kind === 'new' ? itemId : proposal.itemId))
  if (item === undefined) return { deny: `The proposal [${ref}] is gone.` }
  return { result: proposal.kind === 'new' ? `Added ${named(item)}.` : `Completed ${named(item)}.` }
}
