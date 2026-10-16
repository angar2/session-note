// 띠·패널이 그리는 값($.state)과 노트를 바꾸는 동작 — 바꿀 때마다 파일에 저장하고, 실패하면 화면을 그대로 둔다
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Draft, Item, Note, View } from '../types'
import { isoAt, newId } from './note'
import { saveNote } from './store'
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
})

const session = atom({ plugin: 'session-note', key: 'session' } as const, null)
const note = atom({ plugin: 'session-note', key: 'note' } as const, { version: 1, items: [], proposals: [] })
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

// 세션의 노트를 화면 값으로 올리고, 패널이 지금 열려 있는지 맞춘다
export async function showSession($: EngineInterface, opened: { id: string; path: string }, shown: Note) {
  await update($, session, () => opened)
  await update($, note, () => shown)
  const panes = await $.ui.panes()
  await update($, paneOpen, () => panes.some(pane => pane.id === PANE))
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

export async function togglePane($: EngineInterface, title: string) {
  if (!(await read($, paneOpen))) return openPane($, title)
  // 자기 $.ui.close에는 자기 ui.close 훅이 돌지 않을 수 있어 여기서도 닫힘을 기록한다
  await $.ui.close({ id: PANE })
  await paneClosed($)
}

// 열린 항목은 먼저 올라온 것이 위, 완료 항목은 최근에 끝난 것이 위
export const openItems = (n: Note) =>
  n.items.filter(item => item.status === 'open').sort((a, b) => a.createdAt.localeCompare(b.createdAt))

export const doneItems = (n: Note) =>
  n.items.filter(item => item.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))

// 노트를 바꿔 저장한다. 저장에 성공했을 때만 화면 값을 바꾸고, 실패하면 토스트를 띄우고 false
async function change($: EngineInterface, text: Text, edit: (n: Note) => Note): Promise<boolean> {
  const opened = await read($, session)
  if (opened === null) return false
  try {
    const saved = await saveNote($, opened.path, edit)
    await update($, note, () => saved)
    return true
  } catch {
    $.ui.toast(text.saveFailed)
    return false
  }
}

const withItem = (n: Note, id: string, edit: (item: Item) => Item): Note => ({
  ...n,
  items: n.items.map(item => (item.id === id ? edit(item) : item)),
})

// 완료로 바꾸면 그 항목의 완료 제안은 없앤다(spec DATA.md 2절)
export async function toggleDone($: EngineInterface, text: Text, id: string) {
  const at = isoAt(await $.clock.now())
  const ok = await change($, text, n => {
    const toggled = withItem(n, id, item =>
      item.status === 'open' ? { ...item, status: 'done', doneAt: at } : { ...item, status: 'open', doneAt: null },
    )
    const isDone = toggled.items.find(item => item.id === id)?.status === 'done'
    return isDone
      ? { ...toggled, proposals: toggled.proposals.filter(p => !(p.kind === 'done' && p.itemId === id)) }
      : toggled
  })
  if (ok)
    await setView($, view => (view.openId === id ? { ...view, openId: null, editing: null, armedId: null } : view))
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
  const ok = await change($, text, n => ({ ...n, items: [...n.items, item] }))
  if (ok) await setView($, view => ({ ...view, adding: null }))
}

// 제목을 비우고 저장하면 제목은 그대로 두고 내용만 저장한다
export async function saveEdit($: EngineInterface, text: Text, id: string, draft: Draft) {
  const title = draft.title.trim()
  const ok = await change($, text, n =>
    withItem(n, id, item => ({ ...item, title: title === '' ? item.title : title, body: draft.body.trim() })),
  )
  if (ok) await setView($, view => ({ ...view, editing: null }))
}

// 항목과 그 항목을 가리키는 제안을 완전히 지운다
export async function removeItem($: EngineInterface, text: Text, id: string) {
  const ok = await change($, text, n => ({
    ...n,
    items: n.items.filter(item => item.id !== id),
    proposals: n.proposals.filter(p => !(p.kind === 'done' && p.itemId === id)),
  }))
  if (ok) await setView($, view => ({ ...view, openId: null, armedId: null, editing: null }))
}
