// 띠의 두 구역 — 왼쪽 할 일 개수·제안, 오른쪽 과정의 지금 단계, 늘 있는 열기, 좁은 띠 줄이기 (spec UI.md 1절)
import { expect, test } from 'claude-code/testing'

import type { Process } from '../types'
import { BAND, item, proc, start, step } from './world'
import type { NoteFile } from './world'

const SURFACES = ['terminal', 'desktop'] as const

const noteWith = (processes: Process[], titles: string[] = []): NoteFile => ({
  version: 1,
  items: titles.map((title, n) => item(`i${n}`, title, 'open', `2026-10-16T14:0${n}:00+09:00`)),
  proposals: [],
  processes,
})

const bandOf = (columns: number) => ({ ...BAND, props: { ...BAND.props, bodyColumns: columns } })

for (const surface of SURFACES) {
  test(`with no active step the process side is empty and Open stays at the right (${surface})`, async ($, on) => {
    await start($, on, noteWith([proc('p', 'Release', 'active', [step('a', 'Bump', 'waiting')])], ['One']))
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    expect((await band.find({ key: 'count' }))?.text).toBe('☑ 1')
    // 제안이 없으면 왼쪽 구분선도 없다
    expect(await band.find({ key: 'pending' })).toBeUndefined()
    expect(await band.find({ key: 'process' })).toBeUndefined()
    expect((await band.find({ key: 'toggle' }))?.text).toContain('Open')
  })

  test(`the active step shows on the right with a blue square and its number (${surface})`, async ($, on) => {
    await start(
      $,
      on,
      noteWith([
        proc('p', 'Fix login', 'active', [
          step('a', 'Reproduce', 'done'),
          step('b', 'Narrow the cause', 'active', [step('b1', 'Read the logs', 'active'), step('b2', 'Try a fix', 'waiting')]),
        ]),
      ]),
    )
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    const shown = await band.find({ key: 'process' })
    expect(shown?.text).toBe('≡ │ ◼ 2.1 Read the logs')
    // 기호와 구분선은 회색, 네모는 파랑
    const texts = await band.findAll({ type: 'Text' })
    expect(texts.find(one => one.text === '≡ │ ')?.props['dimColor']).toBe(true)
    expect(texts.find(one => one.text === '◼')?.props['color']).toBe('suggestion')
  })
}

test('several active steps under one top step show the step that holds them', async ($, on) => {
  await start(
    $,
    on,
    noteWith([
      proc('p', 'Tasks', 'active', [
        step('a', 'Plan', 'done'),
        step('b', 'Hand out four tasks', 'active', [step('b1', 'TASK-12', 'active'), step('b2', 'TASK-13', 'active')]),
      ]),
    ]),
  )
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect((await band.find({ key: 'process' }))?.text).toBe('≡ │ ◼ 2 Hand out four tasks')
})

test('active steps scattered over top steps show the first one and how many more', async ($, on) => {
  await start(
    $,
    on,
    noteWith([
      proc('p', 'Debug', 'active', [
        step('a', 'Look', 'active', [step('a1', 'Find the cause', 'active', [step('a11', 'Logs', 'active')])]),
        step('b', 'Fix', 'active'),
      ]),
    ]),
  )
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect((await band.find({ key: 'process' }))?.text).toBe('≡ │ ◼ 1.1.1 Logs +1 more')
})

test('a waiting process or a finished one shows nothing on the process side', async ($, on) => {
  await start(
    $,
    on,
    noteWith([
      proc('w', 'Later', 'waiting', [step('a', 'Started', 'active')]),
      proc('f', 'Done', 'active', [step('b', 'All done', 'done')]),
    ]),
  )
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect(await band.find({ key: 'process' })).toBeUndefined()
})

// 한국어 띠: 고정 칸 = 할 일 3 + 제안 22 + 과정 머리 11 + 열기 6 = 42. 제안 제목 19칸, 과정 제목 12칸(띄어쓰기 포함)
const NARROW: [number, string, string][] = [
  [80, '≡ │ ◼ 2.1 원인 좁히기', '[+]  토큰 만료 처리 확인'],
  [70, '≡ │ ◼ 2.1 원인 좁…', '[+]  토큰 만료 처리 확인'],
  [55, '≡ │ ◼ 2.1', '[+]  토큰 만료 처…'],
]

for (const [columns, process, proposal] of NARROW) {
  test(
    `a ${columns}-column band cuts the step title first, then the proposal title, never the buttons`,
    { options: { language: '한국어' } },
    async ($, on) => {
      await start($, on, {
        ...noteWith([
          proc('p', '로그인 고치기', 'active', [
            step('a', '재현', 'done'),
            step('b', '좁히기', 'active', [step('b1', '원인 좁히기', 'active')]),
          ]),
        ]),
        items: [item('i0', '하나', 'open', '2026-10-16T14:00:00+09:00')],
        proposals: [{ id: 'q', kind: 'new', title: '토큰 만료 처리 확인', body: '', proposedAt: '2026-10-16T14:10:00+09:00' }],
      })
      const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...bandOf(columns) })
      expect((await band.find({ key: 'count' }))?.text).toBe('☑ 1')
      expect((await band.find({ key: 'process' }))?.text).toBe(process)
      const pending = await band.find({ key: 'pending' })
      expect(pending?.text).toBe(` │ ${proposal}[추가][무시]`)
      // 제안이 와도 열기 자리는 늘 있다
      expect((await band.find({ key: 'toggle' }))?.text).toContain('열기')
    },
  )
}
