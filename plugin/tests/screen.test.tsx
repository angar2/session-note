// 띠·패널의 글자와 버튼 동작을 terminal·desktop 두 화면에서 확인한다 (spec UI.md 1~5절) — 화면마다 새 세션으로 돈다
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Item, Note } from '../types'

const SURFACES = ['terminal', 'desktop'] as const
const PATH = '/home/zeke/.claude/plugins/data/session-note-inline/sessions/s1.json'

const BAND = {
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

const PANE = {
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

const item = (
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

type World = { files: Map<string, string>; toasts: string[]; panes: Set<string>; failWrite: boolean }

// 플러그인 밑에서 파일·세션·화면 호출을 메모리로 받아 주고, 세션을 시작한다
async function start($: Engine, on: On, note?: Note): Promise<World> {
  const world: World = { files: new Map(), toasts: [], panes: new Set(), failWrite: false }
  if (note) world.files.set(PATH, JSON.stringify(note))
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
  on('ui.open', (_, e) => {
    world.panes.add(e.id)
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
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  return world
}

const saved = (world: World): Note => JSON.parse(world.files.get(PATH) ?? 'null')

type Drawing = { findAll: (query: { type: string }) => Promise<{ key: string | undefined; text: string }[]> }

// 그려진 버튼 중 key가 prefix로 시작하고 글자에 title이 든 것의 key
async function keyOf(ui: Drawing, prefix: string, title: string): Promise<string> {
  const buttons = await ui.findAll({ type: 'Button' })
  const found = buttons.find(one => one.key?.startsWith(prefix) && one.text.includes(title))
  if (found?.key === undefined) throw new Error(`no ${prefix} button for ${title}`)
  return found.key
}

for (const surface of SURFACES) {
  test(`an empty note shows a dim count and opens and closes the pane from the band (${surface})`, async ($, on) => {
    const world = await start($, on)
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    expect((await band.find({ key: 'count' }))?.text).toBe('Notes 0')
    expect((await band.find({ key: 'toggle' }))?.text).toContain('Open')
    await band.press({ key: 'toggle' })
    expect(world.panes.has('session-note')).toBe(true)
    expect((await band.find({ key: 'toggle' }))?.text).toContain('Close')
    await band.press({ key: 'toggle' })
    expect(world.panes.has('session-note')).toBe(false)
    expect((await band.find({ key: 'toggle' }))?.text).toContain('Open')
  })

  test(`items added by hand are saved, counted on the band and marked as written by hand (${surface})`, async ($, on) => {
    const world = await start($, on)
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    expect(await pane.find({ type: 'Text', text: 'No open items' })).toBeDefined()

    await pane.press({ key: 'add' })
    await pane.input({ key: 'add-title', text: 'Check token expiry', kind: 'change' })
    await pane.input({ key: 'add-body', text: 'A 500 right after expiry', kind: 'change' })
    await pane.press({ key: 'add-ok' })
    // 제목 칸 Enter로도 추가된다
    await pane.press({ key: 'add' })
    await pane.input({ key: 'add-title', text: 'Translate the login error' })

    expect(saved(world).items.map(one => [one.title, one.body, one.source, one.status])).toEqual([
      ['Check token expiry', 'A 500 right after expiry', 'user', 'open'],
      ['Translate the login error', '', 'user', 'open'],
    ])
    expect(saved(world).items[0]?.createdAt).toMatch(/^2026-10-16T\d\d:00:00[+-]\d\d:\d\d$/)
    expect((await band.find({ key: 'count' }))?.text).toBe('Notes 2')
    expect((await pane.find({ key: await keyOf(pane, 'title-', 'Check token expiry') }))?.text).toContain('☺')
    expect(await pane.find({ key: 'add-title' })).toBeUndefined()
  })

  test(`an empty title adds nothing and keeps the fields open; cancel drops the draft (${surface})`, async ($, on) => {
    const world = await start($, on)
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'add' })
    await pane.input({ key: 'add-title', text: '   ' })
    expect(world.files.has(PATH)).toBe(false)
    expect(await pane.find({ key: 'add-title' })).toBeDefined()
    await pane.press({ key: 'add-cancel' })
    expect(await pane.find({ key: 'add-title' })).toBeUndefined()
    expect(await pane.find({ key: 'add' })).toBeDefined()
  })

  test(`an expanded item shows details and time, an emptied title is kept on edit, and delete asks first (${surface})`, async ($, on) => {
    const world = await start($, on, {
      version: 1,
      items: [
        { ...item('a', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00'), body: 'Query strings fall back' },
        item('b', 'Second', 'open', '2026-10-16T14:06:00+09:00'),
      ],
      proposals: [],
    })
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'title-a' })
    expect(await pane.find({ type: 'Text', text: 'Query strings fall back' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '2026-10-16 14:05' })).toBeDefined()

    await pane.press({ key: 'edit-a' })
    await pane.input({ key: 'edit-title', text: '', kind: 'change' })
    await pane.input({ key: 'edit-body', text: 'Fixed with URL origin check' })
    expect(saved(world).items[0]).toMatchObject({ title: 'Check the redirect', body: 'Fixed with URL origin check' })
    expect(await pane.find({ key: 'edit-title' })).toBeUndefined()

    await pane.press({ key: 'delete-a' })
    await pane.press({ key: 'delete-cancel' })
    expect(saved(world).items).toHaveLength(2)
    await pane.press({ key: 'delete-a' })
    await pane.press({ key: 'delete-ok-a' })
    expect(saved(world).items.map(one => one.id)).toEqual(['b'])
  })

  test(`checking moves an item to the done group and checking it there brings it back (${surface})`, async ($, on) => {
    const world = await start($, on, {
      version: 1,
      items: [item('a', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00')],
      proposals: [{ id: 'p', kind: 'done', itemId: 'a', proposedAt: '2026-10-16T14:10:00+09:00' }],
    })
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'check-a' })
    expect(saved(world).items[0]).toMatchObject({ status: 'done' })
    expect(saved(world).items[0]?.doneAt).not.toBeNull()
    expect(saved(world).proposals).toEqual([])
    expect((await band.find({ key: 'count' }))?.text).toBe('Notes 0')
    expect((await pane.find({ key: 'done-group' }))?.text).toContain('Done 1 ▸')

    await pane.press({ key: 'done-group' })
    expect((await pane.find({ key: 'check-a' }))?.text).toContain('☑')
    await pane.press({ key: 'check-a' })
    expect(saved(world).items[0]).toMatchObject({ status: 'open', doneAt: null })
    expect((await band.find({ key: 'count' }))?.text).toBe('Notes 1')
  })

  test(`the done group shows the five most recent and the rest behind show more (${surface})`, async ($, on) => {
    const done = Array.from({ length: 7 }, (_, n) =>
      item(`d${n}`, `Done item ${n}`, 'done', `2026-10-16T1${n}:00:00+09:00`),
    )
    await start($, on, { version: 1, items: done, proposals: [] })
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'done-group' })
    const titles = async () =>
      (await pane.findAll({ type: 'Button' })).filter(one => one.key?.startsWith('title-')).map(one => one.key)
    expect(await titles()).toEqual(['title-d6', 'title-d5', 'title-d4', 'title-d3', 'title-d2'])
    expect((await pane.find({ key: 'more' }))?.text).toContain('Show more (2)')
    await pane.press({ key: 'more' })
    expect(await titles()).toHaveLength(7)
  })

  test(`a failed save keeps the screen as it was and says so (${surface})`, async ($, on) => {
    const world = await start($, on, {
      version: 1,
      items: [item('a', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00')],
      proposals: [],
    })
    world.failWrite = true
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'check-a' })
    await pane.press({ key: 'add' })
    await pane.input({ key: 'add-title', text: 'Never saved' })
    expect(world.toasts).toEqual(["Couldn't save the note", "Couldn't save the note"])
    expect((await pane.find({ key: 'check-a' }))?.text).toContain('☐')
    expect(await pane.find({ key: 'add-title' })).toBeDefined()
    expect(saved(world).items).toHaveLength(1)
  })

  test(
    `Korean is drawn when it is the chosen language (${surface})`,
    { options: { language: '한국어' } },
    async ($, on) => {
      await start($, on, {
        version: 1,
        items: [item('a', '리다이렉트 확인', 'open', '2026-10-16T14:05:00+09:00')],
        proposals: [],
      })
      const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
      expect((await band.find({ key: 'count' }))?.text).toBe('노트 1')
      expect((await band.find({ key: 'toggle' }))?.text).toContain('열기')
      const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
      expect((await pane.find({ key: 'add' }))?.text).toContain('+ 새 항목')
      await pane.press({ key: 'title-a' })
      expect((await pane.find({ key: 'edit-a' }))?.text).toContain('[수정]')
      expect(await pane.find({ type: 'Text', text: '내용 없음' })).toBeDefined()
    },
  )
}

test('/note opens the pane and leaves no line in the conversation', async ($, on) => {
  const world = await start($, on)
  const ran = await $.command.run({
    command: 'note',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  } as never)
  expect(ran.text).toBeUndefined()
  expect(world.panes.has('session-note')).toBe(true)
})
