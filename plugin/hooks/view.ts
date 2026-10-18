// 띠·패널이 그리는 값($.state)과 노트를 바꾸는 동작 — 바꿀 때마다 파일에 저장하고, 실패하면 화면을 그대로 둔다
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Draft, Item, Note, Proposal, View } from '../types'
import { emptyNote, isoAt, newId } from './note'

export { doneItems, liveProposals, openItems } from './note'
import { keepCopy, loadNote, notePath, saveNote } from './store'
import { tell, told } from './tell'
import type { Text } from './text'

export type { Draft, View } from '../types'

export const PANE = 'session-note'

// 모듈을 불러올 때마다 새로 정해진다 — 다시 켜지기 전의 초안을 알아보는 표시
export const LOAD = newId()

const blankView = (): View => ({
  load: LOAD,
  openId: null,
  armedId: null,
  showDone: false,
  showAll: false,
  adding: null,
  editing: null,
  editKey: LOAD,
})

const session = atom({ plugin: 'session-note', key: 'session' } as const, null)
const note = atom({ plugin: 'session-note', key: 'note' } as const, emptyNote())
const paneOpen = atom({ plugin: 'session-note', key: 'paneOpen' } as const, false)
const viewAtom = atom({ plugin: 'session-note', key: 'view' } as const, blankView())

// 엔진은 다른 파일로 넘긴 $를 function 선언 안에서만 따라가므로, $를 받는 공용 함수는 모두 function으로 쓴다
export async function readView($: EngineInterface): Promise<View> {
  const view = await read($, viewAtom)
  return view.load === LOAD ? view : blankView()
}

export async function setView($: EngineInterface, change: (view: View) => View) {
  await update($, viewAtom, view => change(view.load === LOAD ? view : blankView()))
}

// 엔진은 상태 값을 그 값을 정의한 파일 안에서만 읽고 쓰게 하므로, 다른 파일은 아래 함수로 다룬다
export async function readNote($: EngineInterface): Promise<Note> {
  return read($, note)
}

export async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return read($, paneOpen)
}

// 세션의 노트를 화면 값으로 올리고, 패널이 지금 열려 있는지 맞춘다. 앞 세션의 초안·펼침은 버린다
async function showSession($: EngineInterface, opened: { id: string; path: string; overwrite: boolean }, shown: Note) {
  await update($, session, () => opened)
  await update($, note, () => shown)
  await update($, viewAtom, () => blankView())
  const panes = await $.ui.panes()
  await update($, paneOpen, () => panes.some(pane => pane.id === PANE))
}

// 세션 시작·전환 때 그 세션의 노트 파일을 연다. 읽을 수 없으면 사본을 남기고 빈 노트로 시작한다(spec DATA.md 3절)
export async function openSession($: EngineInterface, text: Text, id: string): Promise<Note> {
  const path = await notePath($, id)
  const loaded = await loadNote($, path)
  if (loaded.ok) {
    await showSession($, { id, path, overwrite: false }, loaded.note)
    return loaded.note
  }
  const copy = loaded.text === undefined ? null : await keepCopy($, path, loaded.text, isoAt(await $.clock.now()))
  if (copy === null) $.ui.log(`could not keep a copy of ${path}: ${loaded.reason}`, { to: 'debug' })
  else $.ui.toast(text.unreadable)
  // 사본을 못 남겼으면 원본을 지킨다 — 저장은 실패로 둔다
  await showSession($, { id, path, overwrite: copy !== null }, emptyNote())
  return emptyNote()
}

// 패널이 닫혔다 — 초안을 버린다
export async function paneClosed($: EngineInterface) {
  await update($, paneOpen, () => false)
  await dropDrafts($)
}

// 초안을 모두 버린다(패널 닫기 등)
export async function dropDrafts($: EngineInterface) {
  await setView($, view => ({ ...view, adding: null, editing: null, armedId: null }))
}

export async function openPane($: EngineInterface, title: string) {
  await $.ui.open({ id: PANE, title })
  await update($, paneOpen, () => true)
}

// 수정 칸의 key — 끝의 editKey는 수정을 저장할 때마다 바뀐다(types View.editKey)
export const editFieldKey = (field: keyof Draft, editKey: string) => `edit-${field}-${editKey}`

// [수정]을 누르면 그 항목을 수정 칸으로 바꾸고, 패널이 키보드를 받아 제목 칸 끝에 커서를 둔다.
// 패널은 누른 즉시 다시 연다 — 기다린 뒤 열면 좁은 터미널에서 엔진이 누름에 대한 열기로 보지 않는다(TASK-010).
// 채팅 입력창에 치다 만 글이 있으면 엔진이 키보드를 넘기지 않는다 — 커서 옮기기는 덤이라, 거절되거나 실패해도 수정 칸은 그대로 둔다
export async function startEdit($: EngineInterface, title: string, item: Item) {
  const opened = $.ui.open({ id: PANE, title, focus: true })
  await setView($, view => ({
    ...view,
    adding: null,
    armedId: null,
    editing: { id: item.id, title: item.title, body: item.body },
  }))
  await opened
  const { editKey } = await readView($)
  await $.ui.focus({ requestId: PANE, key: editFieldKey('title', editKey) }).catch(() => undefined)
}

// 데스크톱 앱은 누른 버튼이 누른 결과로 사라지면 다음 첫 클릭에 반응하지 않는다(TASK-014). 동작이 끝나면 커서를
// 그 화면(site: 패널 id 또는 띠의 requestId)에 남는 버튼(key)으로 옮긴다 — 덤이라, 거절되거나 실패해도 그대로 둔다
export async function focusAfter($: EngineInterface, site: string, key: string, action: Promise<unknown>) {
  await action
  await $.ui.focus({ requestId: site, key }).catch(() => undefined)
}

// isOpen: 띠가 그릴 때 읽은 열림 상태. 열 때는 기다림 없이 $.ui.open부터 불러야 엔진이 누름에 대한 열기로
// 보고 폭과 상관없이 배치한다 — 기다린 뒤 열면 좁은 터미널(110칸 미만)에서 그리지 않는다 (spec UI.md 2절)
export async function togglePane($: EngineInterface, title: string, isOpen: boolean) {
  if (!isOpen) return openPane($, title)
  // 자기 $.ui.close에는 자기 ui.close 훅이 돌지 않을 수 있어 여기서도 닫힘을 기록한다
  await $.ui.close({ id: PANE })
  await paneClosed($)
}

// 노트를 바꿔 저장한다. 저장에 성공하면 화면 값을 바꾸고 저장된 노트를, 노트가 열리지 않았거나 실패하면 null
export async function saveChange($: EngineInterface, edit: (n: Note) => Note): Promise<Note | null> {
  const opened = await read($, session)
  if (opened === null) return null
  try {
    const saved = await saveNote($, opened.path, edit, opened.overwrite)
    await update($, note, () => saved)
    if (opened.overwrite) await update($, session, () => ({ ...opened, overwrite: false }))
    return saved
  } catch {
    return null
  }
}

// 사용자가 화면에서 바꾼 것 — 실패하면 토스트를 띄운다
async function change($: EngineInterface, text: Text, edit: (n: Note) => Note): Promise<Note | null> {
  const saved = await saveChange($, edit)
  if (saved === null) $.ui.toast(text.saveFailed)
  return saved
}

const withItem = (n: Note, id: string, edit: (item: Item) => Item): Note => ({
  ...n,
  items: n.items.map(item => (item.id === id ? edit(item) : item)),
})

const itemIn = (n: Note, id: string) => n.items.find(item => item.id === id)

// 항목을 완료한다. 그 항목의 완료 제안은 없앤다(spec DATA.md 2절)
export const completeIn = (n: Note, id: string, at: string): Note => ({
  ...withItem(n, id, item => (item.status === 'open' ? { ...item, status: 'done', doneAt: at } : item)),
  proposals: n.proposals.filter(p => !(p.kind === 'done' && p.itemId === id)),
})

// 완료한 항목을 다시 연다
export const reopenIn = (n: Note, id: string): Note =>
  withItem(n, id, item => (item.status === 'done' ? { ...item, status: 'open', doneAt: null } : item))

// 항목과 그 항목을 가리키는 완료 제안을 지운다
export const removeIn = (n: Note, id: string): Note => ({
  ...n,
  items: n.items.filter(item => item.id !== id),
  proposals: n.proposals.filter(p => !(p.kind === 'done' && p.itemId === id)),
})

// 제목·내용을 고친다. 빈 제목과 주지 않은 내용은 그대로 둔다
export const editIn = (n: Note, id: string, title: string, body?: string): Note =>
  withItem(n, id, item => ({ ...item, title: title === '' ? item.title : title, body: body ?? item.body }))

// 제안을 받는다: 새 항목 제안은 받은 시각의 항목(올린 경로 proposal)이 되고, 완료 제안은 그 항목을 완료한다
export function acceptIn(n: Note, proposal: Proposal, at: string, itemId: string): Note {
  const rest = { ...n, proposals: n.proposals.filter(p => p.id !== proposal.id) }
  if (proposal.kind === 'done') return completeIn(rest, proposal.itemId, at)
  const item: Item = {
    id: itemId,
    title: proposal.title,
    body: proposal.body,
    source: 'proposal',
    status: 'open',
    createdAt: at,
    doneAt: null,
  }
  return { ...rest, items: [...rest.items, item] }
}

export async function toggleDone($: EngineInterface, text: Text, id: string) {
  const at = isoAt(await $.clock.now())
  const saved = await change($, text, n => (itemIn(n, id)?.status === 'open' ? completeIn(n, id, at) : reopenIn(n, id)))
  if (saved === null) return
  await setView($, view => (view.openId === id ? { ...view, openId: null, editing: null, armedId: null } : view))
  const item = itemIn(saved, id)
  if (item) await tell($, item.status === 'done' ? told.completed(item) : told.reopened(item))
}

// 빈 제목은 추가하지 않고 초안을 그대로 둔다
export async function addItem($: EngineInterface, text: Text, draft: Draft) {
  const title = draft.title.trim()
  if (title === '') return
  const at = isoAt(await $.clock.now())
  const item: Item = {
    id: newId(),
    title,
    body: draft.body.trim(),
    source: 'user',
    status: 'open',
    createdAt: at,
    doneAt: null,
  }
  const saved = await change($, text, n => ({ ...n, items: [...n.items, item] }))
  if (saved === null) return
  await setView($, view => ({ ...view, adding: null }))
  await tell($, told.added(item))
}

// 제목을 비우고 저장하면 제목은 그대로 두고 내용만 저장한다
export async function saveEdit($: EngineInterface, text: Text, id: string, draft: Draft) {
  const title = draft.title.trim()
  const saved = await change($, text, n => editIn(n, id, title, draft.body.trim()))
  if (saved === null) return
  await setView($, view => ({ ...view, editing: null, editKey: newId() }))
  const item = itemIn(saved, id)
  if (item) await tell($, told.edited(item))
}

// 항목과 그 항목을 가리키는 제안을 완전히 지운다
export async function removeItem($: EngineInterface, text: Text, id: string) {
  const before = itemIn(await read($, note), id)
  const saved = await change($, text, n => removeIn(n, id))
  if (saved === null) return
  await setView($, view => ({ ...view, openId: null, armedId: null, editing: null }))
  if (before) await tell($, told.removed(before))
}

// 세션이 지운 항목의 펼침·초안을 닫는다
export async function forgetItem($: EngineInterface, id: string) {
  await setView($, view => ({
    ...view,
    openId: view.openId === id ? null : view.openId,
    armedId: view.armedId === id ? null : view.armedId,
    editing: view.editing?.id === id ? null : view.editing,
  }))
}

// 띠·패널의 추가·완료 — 제안을 받는다
export async function acceptProposal($: EngineInterface, text: Text, id: string) {
  const proposal = (await read($, note)).proposals.find(p => p.id === id)
  if (proposal === undefined) return
  const at = isoAt(await $.clock.now())
  const itemId = newId()
  const saved = await change($, text, n => {
    const latest = n.proposals.find(p => p.id === id)
    return latest === undefined ? n : acceptIn(n, latest, at, itemId)
  })
  if (saved === null) return
  const item = itemIn(saved, proposal.kind === 'new' ? itemId : proposal.itemId)
  if (item) await tell($, proposal.kind === 'new' ? told.accepted(item) : told.confirmed(item))
}

// 띠·패널의 무시·아직 — 제안만 없앤다
export async function dismissProposal($: EngineInterface, text: Text, id: string) {
  const proposal = (await read($, note)).proposals.find(p => p.id === id)
  if (proposal === undefined) return
  const saved = await change($, text, n => ({ ...n, proposals: n.proposals.filter(p => p.id !== id) }))
  if (saved === null) return
  if (proposal.kind === 'new') return tell($, told.dismissed(proposal.title))
  const item = itemIn(saved, proposal.itemId)
  if (item) await tell($, told.notYet(item))
}
