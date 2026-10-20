// 띠·패널의 글자와 버튼 동작을 terminal·desktop 두 화면에서 확인한다 (spec UI.md 1~5절) — 화면마다 새 세션으로 돈다
import { expect, test } from 'claude-code/testing'

import { BAND, PANE, PATH, fieldKey, item, keyOf, saved, start } from './world'

const SURFACES = ['terminal', 'desktop'] as const

for (const surface of SURFACES) {
  test(`an empty note shows a dim count and opens and closes the pane from the band (${surface})`, async ($, on) => {
    const world = await start($, on)
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    expect((await band.find({ key: 'count' }))?.text).toBe('☑ To do 0')
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
    // 추가·취소 버튼은 그 줄 오른쪽 끝에 있다
    const buttons = (await pane.findAll({ type: 'Box' })).find(box => box.props['justifyContent'] === 'flex-end')
    expect(buttons?.text).toBe(surface === 'terminal' ? '[Add][Cancel]' : 'AddCancel')
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
    expect((await band.find({ key: 'count' }))?.text).toBe('☑ To do 2')
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
    // 수정에 들어가면 패널이 키보드를 달라고 다시 열린다(커서를 제목 칸으로 옮기려고)
    expect(world.focusOpened).toEqual(['session-note'])
    // 저장·취소 버튼은 그 줄 오른쪽 끝에 있다
    const editButtons = (await pane.findAll({ type: 'Box' })).find(
      box => box.props['justifyContent'] === 'flex-end' && box.text.includes('Save'),
    )
    expect(editButtons?.text).toBe(surface === 'terminal' ? '[Save][Cancel]' : 'SaveCancel')
    const bodyKey = await fieldKey(pane, 'edit-body')
    await pane.input({ key: await fieldKey(pane, 'edit-title'), text: '', kind: 'change' })
    await pane.input({ key: bodyKey, text: 'Fixed with URL origin check' })
    expect(saved(world).items[0]).toMatchObject({ title: 'Check the redirect', body: 'Fixed with URL origin check' })
    expect(await pane.find({ type: 'Input' })).toBeUndefined()
    // Enter로 저장한 뒤 다시 연 수정 칸은 새 칸이다 — 엔진이 비운 글자를 두지 않고 저장된 값을 그린다
    await pane.press({ key: 'edit-a' })
    const reopened = await pane.find({ key: await fieldKey(pane, 'edit-body') })
    expect([reopened?.key === bodyKey, reopened?.props['value']]).toEqual([false, 'Fixed with URL origin check'])
    await pane.press({ key: 'edit-cancel' })

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
    expect((await band.find({ key: 'count' }))?.text).toBe('☑ To do 0')
    expect((await pane.find({ key: 'done-group' }))?.text).toContain('Done 1 ▸')

    await pane.press({ key: 'done-group' })
    expect((await pane.find({ key: 'check-a' }))?.text).toContain('☑')
    // 완료 항목 제목도 열린 항목과 같은 기본 글자색
    expect((await pane.find({ key: 'title-a' }))?.props['dimColor']).toBeUndefined()
    await pane.press({ key: 'check-a' })
    expect(saved(world).items[0]).toMatchObject({ status: 'open', doneAt: null })
    expect((await band.find({ key: 'count' }))?.text).toBe('☑ To do 1')
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

  test(`the pane title is drawn in the body only on the terminal, where the engine draws none (${surface})`, async ($, on) => {
    await start($, on)
    const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
    const title = (await pane.findAll({ type: 'Text' })).find(one => one.text === 'Notes')
    if (surface === 'terminal') expect(title?.props['bold']).toBe(true)
    else expect(title).toBeUndefined()
    expect(await pane.find({ type: 'Text', text: 'No open items' })).toBeDefined()
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
      expect((await band.find({ key: 'count' }))?.text).toBe('☑ 할 일 1')
      expect((await band.find({ key: 'toggle' }))?.text).toContain('열기')
      const pane = await $.ui.mount({ plugin: 'session-note', surface, ...PANE })
      expect((await pane.find({ key: 'add' }))?.text).toContain('+ 새 항목')
      await pane.press({ key: 'title-a' })
      expect((await pane.find({ key: 'edit-a' }))?.text).toBe(surface === 'terminal' ? '[수정]' : '수정')
      expect(await pane.find({ type: 'Text', text: '(내용 없음)' })).toBeDefined()
    },
  )
}

// 띠 배경 설정 값 → 띠 줄 전체를 칠하는 테마 키 (spec UI.md 1절)
const BACKGROUNDS = [
  [undefined, undefined],
  ['None', undefined],
  ['Gray', 'subtle'],
  ['Olive', 'diffAddedDimmed'],
  ['Wine', 'diffRemovedDimmed'],
  ['Purple', undefined],
] as const

for (const [setting, key] of BACKGROUNDS) {
  test(
    `the band background setting ${setting ?? '(unset)'} paints the terminal band ${key ?? 'with nothing'} and never the desktop band`,
    { options: setting === undefined ? {} : { bandBackground: setting } },
    async ($, on) => {
      await start($, on)
      const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
      const [whole] = await band.findAll({ type: 'Box' })
      expect(whole?.props['backgroundColor']).toBe(key)
      expect(whole?.text).toContain('☑ To do 0')
      // 데스크톱은 어떤 설정이든 칠하지 않는다
      const desktop = await $.ui.mount({ plugin: 'session-note', surface: 'desktop', ...BAND })
      const [plain] = await desktop.findAll({ type: 'Box' })
      expect(plain?.props['backgroundColor']).toBeUndefined()
      expect(plain?.text).toContain('☑ To do 0')
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
