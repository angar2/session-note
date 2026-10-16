// 세션 전환과 읽을 수 없는 파일 — /clear·/resume·--fork-session 갈아끼우기, 불러온 세션에 전하는 글, 사본 남기기 (spec AGENT.md 5절, DATA.md 3절)
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import type { Note } from '../types'
import { BAND, PANE, PATH, TOOL, item, pathOf, saved, start } from './world'

const withOpen: Note = {
  version: 1,
  items: [
    item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00'),
    item('e5f6a7b8-0000', 'Old work', 'done', '2026-10-16T13:00:00+09:00'),
  ],
  proposals: [],
}

// 세션이 바뀌었다는 신호를 엔진처럼 보내고, 모드가 세션에 넘긴 글을 돌려준다
async function switchTo($: Engine, source: 'clear' | 'resume' | 'fork', id: string): Promise<string[]> {
  const answered = (await $.classic.SessionStart({ source, session_id: id })) as { additionalContext?: string[] }
  return answered.additionalContext ?? []
}

test('/clear swaps in the new session empty note, drops drafts and tells nothing', async ($, on) => {
  const world = await start($, on, withOpen)
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  await pane.press({ key: 'add' })
  expect(await pane.find({ key: 'add-title' })).toBeDefined()

  expect(await switchTo($, 'clear', 's2')).toEqual([])
  expect((await band.find({ key: 'count' }))?.text).toBe('Notes 0')
  expect(await pane.find({ key: 'add-title' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'No open items' })).toBeDefined()

  // 새 세션의 노트는 새 파일에 쓰이고, 앞 세션 파일은 그대로다
  await $.tool.call({ tool: TOOL, tool_use_id: 't1', action: 'add', title: 'New session work' } as never)
  expect(JSON.parse(world.files.get(pathOf('s2')) ?? 'null').items[0].title).toBe('New session work')
  expect(saved(world).items).toHaveLength(2)
})

test('/resume brings back that session note and hands the whole note over', async ($, on) => {
  const world = await start($, on)
  world.files.set(pathOf('old'), JSON.stringify(withOpen))
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  const [told] = await switchTo($, 'resume', 'old')
  expect((await band.find({ key: 'count' }))?.text).toBe('Notes 1')
  expect(told).toContain('[session-note] The session note now:')
  expect(told).toContain('- [a1b2c3d4] "Check the redirect"')
})

test('a resumed note with only done items, or none, is told in one line', async ($, on) => {
  const world = await start($, on)
  world.files.set(pathOf('done'), JSON.stringify({ ...withOpen, items: [withOpen.items[1]] }))
  expect(await switchTo($, 'resume', 'done')).toEqual(["[session-note] No open items in this session's note (1 done)."])
  expect(await switchTo($, 'resume', 'none')).toEqual(["[session-note] This session's note is empty."])
})

test('--fork-session starts the new session id with an empty note and says so', async ($, on) => {
  await start($, on, withOpen)
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect(await switchTo($, 'fork', 'forked')).toEqual(["[session-note] This session's note is empty."])
  expect((await band.find({ key: 'count' }))?.text).toBe('Notes 0')
})

test('an unreadable note is copied aside, the session starts empty and the next save writes a fresh note', async ($, on) => {
  const world = await start($, on, undefined)
  world.files.set(pathOf('broken'), '{ not json')
  await switchTo($, 'resume', 'broken')
  expect(world.toasts).toEqual(["Couldn't read the saved note; kept a copy"])
  const copies = [...world.files.keys()].filter(path => path.includes('broken.unreadable-'))
  expect(copies).toHaveLength(1)
  expect(copies[0]).toMatch(/\/sessions\/broken\.unreadable-\d{8}T\d{6}\.json$/)
  expect(world.files.get(copies[0] ?? '')).toBe('{ not json')

  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  await pane.press({ key: 'add' })
  await pane.input({ key: 'add-title', text: 'Start again' })
  expect(JSON.parse(world.files.get(pathOf('broken')) ?? 'null').items[0].title).toBe('Start again')
  expect(world.files.get(copies[0] ?? '')).toBe('{ not json')
})

test('when no copy can be kept the unreadable note is left alone and saving fails', async ($, on) => {
  const world = await start($, on)
  world.files.set(pathOf('broken'), '{ not json')
  world.failWrite = true
  await switchTo($, 'resume', 'broken')
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  await pane.press({ key: 'add' })
  await pane.input({ key: 'add-title', text: 'Never saved' })
  expect(world.toasts).toEqual(["Couldn't save the note"])
  expect(world.files.get(pathOf('broken'))).toBe('{ not json')
})

test(
  'an unreadable note at session start is copied aside too, in Korean',
  { options: { language: '한국어' } },
  async ($, on) => {
    const world = await start($, on, undefined, '{ not json')
    expect(world.toasts).toEqual(['저장된 노트를 읽지 못해 사본을 남겼어요'])
    expect([...world.files.keys()].some(path => path.includes('s1.unreadable-'))).toBe(true)
    expect(world.files.get(PATH)).toBe('{ not json')
  },
)
