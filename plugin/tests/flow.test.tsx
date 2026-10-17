// 세션 쪽 흐름 — 노트 도구, 띠·패널의 제안 받기·무시, 사용자가 바꾼 것의 세션 알림, 압축 뒤 노트 전체 전달 (spec AGENT.md)
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { BAND, PANE, TOOL, item, keyOf, saved, start } from './world'

const SURFACES = ['terminal', 'desktop'] as const

type Called = { result?: unknown; deny?: string }

// 세션이 노트 도구를 부른 것처럼 부른다
async function call($: Engine, args: Record<string, string>): Promise<Called> {
  return (await $.tool.call({ tool: TOOL, tool_use_id: `t${Math.random()}`, ...args } as never)) as Called
}

const resultOf = (called: Called) => String(called.result)

const refIn = (text: string) => /\[([0-9a-f]{8})\]/.exec(text)?.[1] ?? ''

test('the note tool is registered with its schema in the prompt', async ($, on) => {
  const world = await start($, on)
  expect(world.tools).toEqual(['note'])
})

test('an item the user asks for is added at once, with no mark and no notice', async ($, on) => {
  const world = await start($, on)
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  const added = await call($, { action: 'add', title: 'Check token expiry', body: 'A 500 right after expiry' })
  expect(resultOf(added)).toMatch(/^Added \[[0-9a-f]{8}\] "Check token expiry"\.$/)
  expect(saved(world).items.map(one => [one.title, one.body, one.source])).toEqual([
    ['Check token expiry', 'A 500 right after expiry', 'instruction'],
  ])
  expect((await band.find({ key: 'count' }))?.text).toBe('Notes 1')
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  expect((await pane.find({ key: await keyOf(pane, 'title-', 'Check token expiry') }))?.text).not.toContain('☺')
  expect(world.told()).toEqual([])
})

for (const surface of SURFACES) {
  test(`a proposal waits on the band and adding it makes an item and tells the session (${surface})`, async ($, on) => {
    const world = await start($, on)
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    const proposed = await call($, { action: 'propose', title: 'Check the redirect', body: 'Query strings' })
    expect(resultOf(proposed)).toContain('waits on the user')
    expect((await band.find({ key: 'pending' }))?.text).toContain('[+]')
    expect((await band.find({ key: 'pending' }))?.text).toContain('Check the redirect')
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
    // 같은 제목은 두 번 올리지 않는다
    expect(resultOf(await call($, { action: 'propose', title: 'check the redirect' }))).toContain('already proposed')

    await band.press({ key: await keyOf(band, 'accept-', 'Add') })
    expect(saved(world).proposals).toEqual([])
    expect(saved(world).items.map(one => [one.title, one.body, one.source, one.createdAt])).toEqual([
      ['Check the redirect', 'Query strings', 'proposal', saved(world).items[0]?.createdAt],
    ])
    expect((await band.find({ key: 'count' }))?.text).toBe('Notes 1')
    expect((await band.find({ key: 'toggle' }))?.text).toContain('Open')
    expect(world.told()).toEqual([
      `[session-note] The user accepted your proposal; it is now item [${saved(world).items[0]?.id.slice(0, 8)}] "Check the redirect".`,
    ])
  })

  test(`a done proposal shows Complete and Not yet; not yet keeps the item open (${surface})`, async ($, on) => {
    const world = await start($, on, {
      version: 1,
      items: [item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00')],
      proposals: [],
    })
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    expect(resultOf(await call($, { action: 'propose_done', id: '[a1b2c3d4]' }))).toContain('as done')
    expect((await band.find({ key: 'pending' }))?.text).toContain('[✓]')
    await band.press({ key: await keyOf(band, 'dismiss-', 'Not yet') })
    expect(saved(world).items[0]).toMatchObject({ status: 'open' })
    expect(saved(world).proposals).toEqual([])
    expect(world.told()).toEqual([
      '[session-note] The user said [a1b2c3d4] "Check the redirect" is not done yet; it stays open.',
    ])

    await call($, { action: 'propose_done', id: 'a1b2c3d4' })
    await band.press({ key: await keyOf(band, 'accept-', 'Complete') })
    expect(saved(world).items[0]).toMatchObject({ status: 'done' })
    expect((await band.find({ key: 'count' }))?.text).toBe('Notes 0')
    expect(world.told()[1]).toBe('[session-note] The user confirmed [a1b2c3d4] "Check the redirect" is done.')
  })
}

test('several proposals show as counts with View on the band and one by one in the pane', async ($, on) => {
  const world = await start($, on, {
    version: 1,
    items: [item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00')],
    proposals: [],
  })
  await call($, { action: 'propose', title: 'Translate the login error' })
  await call($, { action: 'propose', title: 'Look at the retry limit' })
  await call($, { action: 'propose_done', id: 'a1b2c3d4' })
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect((await band.find({ key: 'pending' }))?.text).toContain('[+] 2 new · [✓] 1 done')
  expect((await band.find({ key: 'toggle' }))?.text).toContain('View')
  await band.press({ key: 'toggle' })
  expect(world.panes.has('session-note')).toBe(true)

  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  const rows = (await pane.findAll({ type: 'Button' })).filter(one => one.key?.startsWith('accept-'))
  expect(rows).toHaveLength(3)
  await pane.press({ key: await keyOf(pane, 'dismiss-', 'Dismiss') })
  expect(saved(world).proposals).toHaveLength(2)
  expect(world.told()).toEqual(['[session-note] The user dismissed your proposal "Translate the login error".'])
})

test('proposals are marked in color in a fixed-width box with bracketed terminal buttons, ruled off, and unfold their details', async ($, on) => {
  await start($, on, {
    version: 1,
    items: [
      { ...item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00'), body: 'Query strings' },
    ],
    proposals: [],
  })
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  const rules = async () => (await pane.findAll({ type: 'Text' })).filter(one => one.text.startsWith('─')).length
  expect(await rules()).toBe(1)

  const proposed = refIn(
    resultOf(await call($, { action: 'propose', title: 'Translate the login error', body: 'Says 500' })),
  )
  await call($, { action: 'propose_done', id: 'a1b2c3d4' })
  const colorOf = async (label: string) =>
    (await pane.findAll({ type: 'Text' })).find(one => one.text === label)?.props['color']
  expect(await colorOf('[+]')).toBe('suggestion')
  expect(await colorOf('[✓]')).toBe('success')
  // 표시는 고정 폭 상자에 들어가 뒤따르는 제목의 시작 위치가 같다
  const markBoxes = (await pane.findAll({ type: 'Box' })).filter(one => one.text === '[+]' || one.text === '[✓]')
  expect(markBoxes.map(one => one.props['width'])).toEqual([3, 3])
  const proposalButtons = (await pane.findAll({ type: 'Button' })).filter(
    one => one.key?.startsWith('accept-') || one.key?.startsWith('dismiss-'),
  )
  // 터미널은 여백 없는 [이름] 글자 버튼이고, 주 버튼(추가·완료)만 흐리지 않다
  expect(proposalButtons.map(one => [one.text, one.props['plain'], one.props['dimColor']])).toEqual([
    ['[Add]', true, undefined],
    ['[Dismiss]', true, true],
    ['[Complete]', true, undefined],
    ['[Not yet]', true, true],
  ])
  expect(await rules()).toBe(2)

  const shows = async (body: string) => (await pane.findAll({ type: 'Text' })).some(one => one.text === body)
  const newTitle = await keyOf(pane, 'ptitle-', 'Translate the login error')
  expect(newTitle.startsWith(`ptitle-${proposed}`)).toBe(true)
  await pane.press({ key: newTitle })
  expect(await shows('Says 500')).toBe(true)
  await pane.press({ key: newTitle })
  expect(await shows('Says 500')).toBe(false)
  // 완료 제안은 그 항목의 내용을 펼친다
  await pane.press({ key: await keyOf(pane, 'ptitle-', 'Check the redirect') })
  expect(await shows('Query strings')).toBe(true)

  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect((await band.find({ key: 'pending' }))?.text).toContain('[+] 1 new · [✓] 1 done')
})

for (const surface of SURFACES) {
  test(`one proposal on the band has a colored mark and plain buttons bracketed only on the terminal (${surface})`, async ($, on) => {
    await start($, on)
    await call($, { action: 'propose', title: 'Check the redirect' })
    const band = await $.ui.mount({ plugin: 'session-note', surface, ...BAND })
    expect((await band.findAll({ type: 'Text' })).find(one => one.text === '[+]')?.props['color']).toBe('suggestion')
    const accept = await band.find({ key: await keyOf(band, 'accept-', 'Add') })
    expect([accept?.text, accept?.props['plain']]).toEqual([surface === 'terminal' ? '[Add]' : 'Add', true])
  })
}

test('a done proposal whose item was deleted or completed is not shown', async ($, on) => {
  await start($, on, {
    version: 1,
    items: [item('a1b2c3d4-0000', 'Already done', 'done', '2026-10-16T14:05:00+09:00')],
    proposals: [
      { id: 'p1', kind: 'done', itemId: 'gone', proposedAt: '2026-10-16T14:06:00+09:00' },
      { id: 'p2', kind: 'done', itemId: 'a1b2c3d4-0000', proposedAt: '2026-10-16T14:07:00+09:00' },
    ],
  })
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect(await band.find({ key: 'pending' })).toBeUndefined()
  expect((await band.find({ key: 'count' }))?.text).toBe('Notes 0')
})

test('what the user changes in the pane is told to the session, one line each', async ($, on) => {
  const world = await start($, on)
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  await pane.press({ key: 'add' })
  await pane.input({ key: 'add-title', text: 'Check token expiry' })
  const id = saved(world).items[0]?.id ?? ''
  const ref = id.slice(0, 8)
  await pane.press({ key: `title-${id}` })
  await pane.press({ key: `edit-${id}` })
  await pane.input({ key: 'edit-body', text: 'A 500 right after expiry' })
  await pane.press({ key: `check-${id}` })
  await pane.press({ key: 'done-group' })
  await pane.press({ key: `check-${id}` })
  await pane.press({ key: `title-${id}` })
  await pane.press({ key: `delete-${id}` })
  await pane.press({ key: `delete-ok-${id}` })
  expect(world.told()).toEqual([
    `[session-note] The user added [${ref}] "Check token expiry" to the note.`,
    `[session-note] The user edited [${ref}] "Check token expiry" — details: A 500 right after expiry.`,
    `[session-note] The user completed [${ref}] "Check token expiry".`,
    `[session-note] The user reopened [${ref}] "Check token expiry".`,
    `[session-note] The user deleted [${ref}] "Check token expiry" from the note.`,
  ])
})

test('list, complete and accept work by ref; an unknown ref is refused', async ($, on) => {
  const world = await start($, on, {
    version: 1,
    items: [
      { ...item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00'), body: 'Query strings' },
      item('e5f6a7b8-0000', 'Old work', 'done', '2026-10-16T13:00:00+09:00'),
    ],
    proposals: [],
  })
  const proposed = resultOf(await call($, { action: 'propose', title: 'Translate the login error' }))
  expect(resultOf(await call($, { action: 'list' }))).toBe(
    [
      '[session-note] The session note now:',
      'Open items:',
      '- [a1b2c3d4] "Check the redirect"',
      '  Query strings',
      'Done items:',
      '- [e5f6a7b8] "Old work"',
      'Your proposals still waiting for the user:',
      `- [${refIn(proposed)}] new item: "Translate the login error"`,
    ].join('\n'),
  )
  expect(resultOf(await call($, { action: 'accept', id: refIn(proposed) }))).toContain('Added')
  expect(resultOf(await call($, { action: 'complete', id: 'a1b2c3d4' }))).toBe(
    'Completed [a1b2c3d4] "Check the redirect".',
  )
  expect(saved(world).items.find(one => one.id === 'a1b2c3d4-0000')).toMatchObject({ status: 'done' })
  expect((await call($, { action: 'complete', id: 'zzzzzzzz' })).deny).toContain('No open item')
  expect((await call($, { action: 'shout' })).deny).toContain('Unknown action')
  expect(world.told()).toEqual([])
})

test('edit, delete and reopen work by ref on the band and pane, with no notice', async ($, on) => {
  const world = await start($, on, {
    version: 1,
    items: [
      { ...item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00'), body: 'Query strings' },
      item('e5f6a7b8-0000', 'Old work', 'done', '2026-10-16T13:00:00+09:00'),
      item('c9d0e1f2-0000', 'Drop me', 'open', '2026-10-16T14:10:00+09:00'),
    ],
    proposals: [
      { id: 'p0000000-0000', kind: 'done', itemId: 'c9d0e1f2-0000', proposedAt: '2026-10-16T14:20:00+09:00' },
    ],
  })
  const pane = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...PANE })
  expect(resultOf(await call($, { action: 'edit', id: 'a1b2c3d4', title: 'Check the login redirect' }))).toBe(
    'Edited [a1b2c3d4] "Check the login redirect".',
  )
  expect(resultOf(await call($, { action: 'edit', id: '[e5f6a7b8]', body: 'Was in v1' }))).toBe(
    'Edited [e5f6a7b8] "Old work".',
  )
  // 내용만 비우면 제목은 그대로
  await call($, { action: 'edit', id: 'a1b2c3d4', title: '', body: '' })
  expect(resultOf(await call($, { action: 'reopen', id: 'e5f6a7b8' }))).toBe('Reopened [e5f6a7b8] "Old work".')
  expect(resultOf(await call($, { action: 'delete', id: 'c9d0e1f2' }))).toBe('Deleted [c9d0e1f2] "Drop me".')
  expect(saved(world).items.map(one => [one.title, one.body, one.status, one.doneAt])).toEqual([
    ['Check the login redirect', '', 'open', null],
    ['Old work', 'Was in v1', 'open', null],
  ])
  expect(saved(world).proposals).toEqual([])
  expect(await keyOf(pane, 'title-', 'Check the login redirect')).toMatch(/^title-/)
  expect(await keyOf(pane, 'title-', 'Old work')).toMatch(/^title-/)
  expect((await pane.findAll({ type: 'Button' })).some(one => one.text.includes('Drop me'))).toBe(false)
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect((await band.find({ key: 'count' }))?.text).toBe('Notes 2')
  expect(world.told()).toEqual([])
})

test('edit, delete and reopen refuse an unknown ref, an empty edit and a failed save', async ($, on) => {
  const world = await start($, on, {
    version: 1,
    items: [item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00')],
    proposals: [],
  })
  expect((await call($, { action: 'edit', id: 'zzzzzzzz', title: 'X' })).deny).toContain('No item')
  expect((await call($, { action: 'delete', id: 'zzzzzzzz' })).deny).toContain('No item')
  expect((await call($, { action: 'reopen', id: 'zzzzzzzz' })).deny).toContain('No item')
  expect((await call($, { action: 'edit', id: 'a1b2c3d4' })).deny).toContain('Give a new title or body')
  expect(resultOf(await call($, { action: 'reopen', id: 'a1b2c3d4' }))).toBe(
    '[a1b2c3d4] "Check the redirect" is already open.',
  )
  world.failWrite = true
  expect((await call($, { action: 'delete', id: 'a1b2c3d4' })).deny).toContain("Couldn't save")
  expect((await call($, { action: 'edit', id: 'a1b2c3d4', title: 'X' })).deny).toContain("Couldn't save")
  world.failWrite = false
  expect(saved(world).items.map(one => one.title)).toEqual(['Check the redirect'])
  expect(world.toasts).toEqual([])
})

test('after a compaction the whole note is handed over once; an empty note is one line', async ($, on) => {
  const world = await start($, on)
  const contextOf = async (source: 'compact' | 'startup') =>
    ((await $.classic.SessionStart({ source })) as { additionalContext?: string[] }).additionalContext ?? []
  expect(await contextOf('compact')).toEqual(["[session-note] This session's note is empty."])
  await call($, { action: 'add', title: 'Check token expiry', body: 'A 500 right after expiry' })
  const [whole] = await contextOf('compact')
  expect(whole).toContain('Open items:\n- [')
  expect(whole).toContain('  A 500 right after expiry')
  // 세션 시작(startup)에는 전하지 않는다
  expect(await contextOf('startup')).toEqual([])
  expect(world.told()).toEqual([])
})

test('a long note is handed over with titles only and a pointer to list', async ($, on) => {
  await start($, on, {
    version: 1,
    items: Array.from({ length: 20 }, (_, n) => ({
      ...item(
        `${String(n).padStart(8, '0')}-x`,
        `Item ${n}`,
        'open',
        `2026-10-16T14:${String(n).padStart(2, '0')}:00+09:00`,
      ),
      body: 'x'.repeat(300),
    })),
    proposals: [],
  })
  const answered = (await $.classic.SessionStart({ source: 'compact' })) as { additionalContext?: string[] }
  const whole = answered.additionalContext?.[0] ?? ''
  expect(whole).not.toContain('xxx')
  expect(whole).toContain('- [00000019] "Item 19"')
  expect(whole).toContain("use the note tool's list action")
})

test('Korean labels the proposal on the band', { options: { language: '한국어' } }, async ($, on) => {
  await start($, on)
  await call($, { action: 'propose', title: '리다이렉트 확인' })
  const band = await $.ui.mount({ plugin: 'session-note', surface: 'terminal', ...BAND })
  expect((await band.find({ key: 'pending' }))?.text).toContain('[+]  리다이렉트 확인')
  expect(await keyOf(band, 'accept-', '추가')).toMatch(/^accept-/)
  expect(await keyOf(band, 'dismiss-', '무시')).toMatch(/^dismiss-/)
})
