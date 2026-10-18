// 패널의 탭 줄과 과정 탭 — 진행 중·대기·끝난 과정, 상태 네모, 단계 접기, 순번 다시 매김, 탭을 고르는 열기 (spec UI.md 2절)
import { expect, test } from 'claude-code/testing'

import type { Process } from '../types'
import { BAND, PANE, PATH, PROCESS_TOOL, item, proc, start, step } from './world'

const SURFACES = ['terminal', 'desktop'] as const

// 진행 중 "Release"(2번 main 병합이 지금 단계, 1번 아래에 두 단계), 대기 "Plan the tab"(2.1에서 멈춤), 끝난 과정 둘
const PROCESSES: Process[] = [
  proc(
    'r',
    'Release',
    'active',
    [
      step('r1', 'Bump the version', 'done', [step('r11', 'plugin.json', 'done'), step('r12', 'Changelog', 'done')]),
      step('r2', 'Merge to main', 'active'),
      step('r3', 'Tag', 'waiting'),
      step('r4', 'Release notes', 'waiting'),
    ],
    '2026-10-16T15:00:00+09:00',
  ),
  proc('w', 'Plan the tab', 'waiting', [
    step('w1', 'Goals', 'done'),
    step('w2', 'Structure', 'active', [step('w21', 'States', 'active'), step('w22', 'Numbers', 'waiting')]),
  ]),
  proc('f1', 'Old release', 'waiting', [step('f11', 'Ship', 'done')]),
  proc('f2', 'Dropped idea', 'waiting', [step('f21', 'Try', 'done'), step('f22', 'Give up', 'stopped')]),
]

const withProcesses = (processes: Process[] = PROCESSES) => ({
  version: 1 as const,
  items: [item('a', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00')],
  proposals: [],
  processes,
})

type Mounted = {
  find: (query: { key: string }) => Promise<{ text: string } | undefined>
  findAll: (query: { type: string }) => Promise<{ key: string | undefined; text: string }[]>
}

// 줄 글자 — 그려진 글자를 이어 붙인 것이라 네모·순번 상자와 제목 상자 사이의 한 칸(gap)은 빠진다
const rowText = async (pane: Mounted, id: string) => (await pane.find({ key: `step-${id}` }))?.text
const rowKeys = async (pane: Mounted) =>
  (await pane.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('step-') ? [box.key.slice(5)] : []))

for (const surface of SURFACES) {
  test(`the tab row counts open items and open processes and switches tabs (${surface})`, async ($, on) => {
    await start($, on, withProcesses())
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    expect((await pane.find({ key: 'tab-todo' }))?.text).toBe('☑ To do 1')
    expect((await pane.find({ key: 'tab-process' }))?.text).toBe('≡ Process 2')
    const tabText = async (key: string) => (await pane.findAll({ type: 'Text' })).find(one => one.text.startsWith(key))
    expect((await tabText('☑ To do'))?.props['bold']).toBe(true)
    expect((await tabText('≡ Process'))?.props['dimColor']).toBe(true)
    expect(await pane.find({ key: 'title-a' })).toBeDefined()

    await pane.press({ key: 'tab-process' })
    expect((await tabText('≡ Process'))?.props['bold']).toBe(true)
    expect((await tabText('☑ To do'))?.props['dimColor']).toBe(true)
    expect(await pane.find({ key: 'title-a' })).toBeUndefined()
    expect(await pane.find({ key: 'add' })).toBeUndefined()
    await pane.press({ key: 'tab-todo' })
    expect(await pane.find({ key: 'title-a' })).toBeDefined()
  })

  test(`the active process is open on top, the waiting one is one line with where it stopped (${surface})`, async ($, on) => {
    await start($, on, withProcesses())
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'tab-process' })
    expect((await pane.find({ key: 'proc-r' }))?.text).toBe('◼Release')
    // 아래 단계가 있는 끝난 1번은 접혀 있고, 지금 단계는 굵다
    expect(await rowKeys(pane)).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(await rowText(pane, 'r1')).toBe('◼ 1Bump the version ▸')
    expect(await rowText(pane, 'r2')).toBe('◼ 2Merge to main')
    expect(await rowText(pane, 'r3')).toBe('◻ 3Tag')
    const texts = await pane.findAll({ type: 'Text' })
    expect(texts.find(one => one.text === 'Merge to main')?.props['bold']).toBe(true)
    expect(texts.find(one => one.text === 'Tag')?.props['bold']).toBeUndefined()
    // 네모 색: 머리줄과 진행 중 파랑, 완료 초록
    expect(
      (await pane.findAll({ type: 'Text' })).filter(one => one.text === '◼').map(one => one.props['color']),
    ).toEqual(['suggestion', 'success', 'suggestion'])
    expect((await pane.find({ key: 'proc-w' }))?.text).toBe('◻Plan the tab ▸  paused at 2.1')
    expect((await pane.find({ key: 'finished-group' }))?.text).toContain('Finished 2 ▸')
    expect(await pane.find({ key: 'proc-f1' })).toBeUndefined()
  })

  test(`pressing a step with steps below opens and closes it, and a waiting process opens only to look (${surface})`, async ($, on) => {
    const world = await start($, on, withProcesses())
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'tab-process' })
    await pane.press({ key: 'fold-r1' })
    expect(await rowText(pane, 'r1')).toBe('◼ 1Bump the version ▾')
    expect(await rowKeys(pane)).toEqual(['r1', 'r11', 'r12', 'r2', 'r3', 'r4'])
    expect(await rowText(pane, 'r11')).toBe('◼ 1.1plugin.json')
    await pane.press({ key: 'fold-r1' })
    expect(await rowKeys(pane)).toEqual(['r1', 'r2', 'r3', 'r4'])

    // 대기 과정을 펼치면 진행 중인 단계(2 Structure)가 펼쳐져 있고, 진행 중 과정은 그대로다
    await pane.press({ key: 'fold-w' })
    expect((await pane.find({ key: 'proc-w' }))?.text).toBe('◻Plan the tab ▾  paused at 2.1')
    expect(await rowKeys(pane)).toEqual(['r1', 'r2', 'r3', 'r4', 'w1', 'w2', 'w21', 'w22'])
    expect(await rowText(pane, 'w2')).toBe('◼ 2Structure ▾')
    // 대기 과정의 멈춘 단계는 굵게 쓰지 않는다
    const texts = await pane.findAll({ type: 'Text' })
    expect(texts.find(one => one.text === 'States')?.props['bold']).toBeUndefined()
    // 펼쳐 보기는 노트를 바꾸지 않는다
    expect(world.files.get(PATH)).toBe(JSON.stringify(withProcesses()))
  })

  test(`the finished group opens to finished processes with green or red squares (${surface})`, async ($, on) => {
    await start($, on, withProcesses())
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    await pane.press({ key: 'tab-process' })
    await pane.press({ key: 'finished-group' })
    expect((await pane.find({ key: 'finished-group' }))?.text).toContain('Finished 2 ▾')
    expect((await pane.find({ key: 'proc-f1' }))?.text).toBe('◼Old release ▸')
    expect((await pane.find({ key: 'proc-f2' }))?.text).toBe('◼Dropped idea ▸')
    const colors = (await pane.findAll({ type: 'Text' }))
      .filter(one => one.text === '◼')
      .map(one => one.props['color'])
    // 진행 중 과정 머리줄·단계들 다음에 끝난 과정 둘: 모두 완료는 초록, 중단이 있으면 빨강
    expect(colors.slice(-2)).toEqual(['success', 'error'])
    await pane.press({ key: 'finished-group' })
    expect(await pane.find({ key: 'proc-f1' })).toBeUndefined()
  })
}

test('with no open process the tab says so and still offers the finished ones', async ($, on) => {
  await start($, on, withProcesses(PROCESSES.slice(2)))
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  expect((await pane.find({ key: 'tab-process' }))?.text).toBe('≡ Process 0')
  await pane.press({ key: 'tab-process' })
  expect(await pane.find({ type: 'Text', text: 'No open processes' })).toBeDefined()
  expect((await pane.find({ key: 'finished-group' }))?.text).toContain('Finished 2 ▸')
})

test('removing step 3 through the process tool renumbers the steps in the pane', async ($, on) => {
  await start($, on, withProcesses())
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  await pane.press({ key: 'tab-process' })
  await $.tool.call({ tool: PROCESS_TOOL, tool_use_id: 't1', action: 'remove', ids: ['3'] } as never)
  expect(await rowKeys(pane)).toEqual(['r1', 'r2', 'r4'])
  expect(await rowText(pane, 'r4')).toBe('◻ 3Release notes')
})

test('the band Open keeps the last chosen tab, and View opens the to-do tab where proposals are', async ($, on) => {
  const world = await start($, on, {
    ...withProcesses(),
    proposals: [
      { id: 'p1', kind: 'new', title: 'One', body: '', proposedAt: '2026-10-16T14:10:00+09:00' },
      { id: 'p2', kind: 'new', title: 'Two', body: '', proposedAt: '2026-10-16T14:11:00+09:00' },
    ],
  })
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  await pane.press({ key: 'tab-process' })
  expect((await band.find({ key: 'toggle' }))?.text).toContain('View')
  await band.press({ key: 'toggle' })
  expect(world.panes.has('session-note')).toBe(true)
  expect(await pane.find({ key: 'ptitle-p1' })).toBeDefined()

  // 제안이 없으면 열기는 마지막으로 고른 탭(과정)으로 연다
  await pane.press({ key: 'dismiss-p1' })
  await pane.press({ key: 'dismiss-p2' })
  await pane.press({ key: 'tab-process' })
  await band.press({ key: 'toggle' })
  expect(world.panes.has('session-note')).toBe(false)
  expect((await band.find({ key: 'toggle' }))?.text).toContain('Open')
  await band.press({ key: 'toggle' })
  expect(world.panes.has('session-note')).toBe(true)
  expect(await pane.find({ key: 'proc-r' })).toBeDefined()
})

test('the tab row and the process tab are in Korean when it is the chosen language', { options: { language: '한국어' } }, async ($, on) => {
  await start($, on, withProcesses())
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  expect((await pane.find({ key: 'tab-todo' }))?.text).toBe('☑ 할 일 1')
  expect((await pane.find({ key: 'tab-process' }))?.text).toBe('≡ 과정 2')
  await pane.press({ key: 'tab-process' })
  expect((await pane.find({ key: 'proc-w' }))?.text).toBe('◻Plan the tab ▸  2.1에서 멈춤')
  expect((await pane.find({ key: 'finished-group' }))?.text).toContain('끝난 과정 2 ▸')
})
