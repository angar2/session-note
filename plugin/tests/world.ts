// 시험용 세계 — 플러그인 밑에서 파일·세션·화면 호출을 메모리로 받아 주고 세션을 시작한다
import type { Engine } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Item, Note, Process } from '../types'

export const pathOf = (id: string) => `/home/zeke/.claude/plugins/data/session-note-inline/sessions/${id}.json`
export const PATH = pathOf('s1')
export const TOOL = 'mcp__session-note__todo'
export const PROCESS_TOOL = 'mcp__session-note__process'

// 파일에 둔 노트 — 1.0.x 파일처럼 processes가 없어도 된다
export type NoteFile = Omit<Note, 'processes'> & { processes?: Process[] }

export const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

export const PANE = {
  component: 'Pane',
  requestId: 'session-note',
  props: {
    title: 'Notes',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

export const item = (
  id: string,
  title: string,
  status: 'open' | 'done',
  at: string,
  source: Item['source'] = 'proposal',
): Item => ({
  id,
  title,
  body: '',
  source,
  status,
  createdAt: at,
  doneAt: status === 'done' ? at : null,
})

export type World = {
  files: Map<string, string>
  toasts: string[]
  panes: Set<string>
  // 키보드를 달라고(focus) 연 패널 id — 커서가 칸에 가는지는 시험 키트가 다루지 않아 가상 터미널로 본다
  focusOpened: string[]
  tools: string[]
  failWrite: boolean
  // 세션(모델)에게 전해진 글
  told: () => string[]
}

// raw: 노트 대신 파일에 그대로 둘 글(깨진 파일 시험)
export async function start($: Engine, on: On, note?: NoteFile, raw?: string): Promise<World> {
  const session = mock.session(on)
  const world: World = {
    files: new Map(),
    toasts: [],
    panes: new Set(),
    focusOpened: [],
    tools: [],
    failWrite: false,
    told: () =>
      session
        .appended()
        .flatMap(row => (Array.isArray(row.message.content) ? row.message.content : []))
        .flatMap(block => (block.type === 'text' ? [String(block.text)] : [])),
  }
  if (note) world.files.set(PATH, JSON.stringify(note))
  if (raw !== undefined) world.files.set(PATH, raw)
  mock.env(on, { HOME: '/home/zeke' })
  mock.clock(on, { now: Date.parse('2026-10-16T05:00:00Z') })
  on('fs.exists', (_, e) => ({ value: world.files.has(e.path) }))
  on('fs.read', (_, e) => {
    const text = world.files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.write', (_, e) => {
    if (world.failWrite) return { deny: `EACCES ${e.path}` }
    world.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('session.id', () => ({ value: 's1' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => {
    world.tools.push(e.name)
    return { value: { tool: e.name } }
  })
  on('ui.open', (_, e) => {
    world.panes.add(e.id)
    if (e.focus) world.focusOpened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    world.panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...world.panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', (_, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // 설정 훅이 없는 세션처럼 SessionStart는 아무것도 더하지 않는다
  on('classic.SessionStart', () => ({}))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  return world
}

export const saved = (world: World): Note => JSON.parse(world.files.get(PATH) ?? 'null')

type Drawing = { findAll: (query: { type: string }) => Promise<{ key: string | undefined; text: string }[]> }

// 수정 칸은 저장할 때마다 key 끝이 바뀐다 — 앞부분(edit-title·edit-body)으로 지금 그려진 칸의 key를 찾는다
export async function fieldKey(ui: Drawing, prefix: string): Promise<string> {
  const found = (await ui.findAll({ type: 'Input' })).find(one => one.key?.startsWith(`${prefix}-`))
  if (found?.key === undefined) throw new Error(`no ${prefix} field`)
  return found.key
}

// 그려진 버튼 중 key가 prefix로 시작하고 글자에 title이 든 것의 key
export async function keyOf(ui: Drawing, prefix: string, title: string): Promise<string> {
  const buttons = await ui.findAll({ type: 'Button' })
  const found = buttons.find(one => one.key?.startsWith(prefix) && (title === '' || one.text.includes(title)))
  if (found?.key === undefined) throw new Error(`no ${prefix} button for ${title}`)
  return found.key
}
