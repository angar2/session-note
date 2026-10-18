// 과정 도구 — 짜기·보기·순번으로 고치기·여러 단계 상태·진행 중 과정 바꾸기, 압축·불러온 세션에 과정 전하기 (spec AGENT.md 6절)
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { PROCESS_TOOL, item, pathOf, saved, start } from './world'

type Called = { result?: unknown; deny?: string }

// 세션이 과정 도구를 부른 것처럼 부른다
async function call($: Engine, args: Record<string, unknown>): Promise<Called> {
  return (await $.tool.call({ tool: PROCESS_TOOL, tool_use_id: `t${Math.random()}`, ...args } as never)) as Called
}

const resultOf = async ($: Engine, args: Record<string, unknown>) => String((await call($, args)).result)

const steps = (...titles: string[]) => titles.map(title => ({ title }))

// 보기 결과의 단계 줄에서 순번·제목·상태만 — 숨은 번호는 실행마다 다르다
const shape = (text: string) =>
  text
    .split('\n')
    .filter(line => /^\s+\d/.test(line))
    .map(line => line.replace(/ \[[0-9a-f]{8}\]/, ''))

async function release($: Engine) {
  return call($, {
    action: 'create',
    title: 'Release 1.1.0',
    steps: [
      { title: 'Merge to main', status: 'active', memo: 'Check the dev log first' },
      ...steps('Push the tag', 'Write the notes', 'Publish'),
    ],
  })
}

test('a new process is saved, made active and shown with screen numbers and refs', async ($, on) => {
  const world = await start($, on)
  const created = String((await release($)).result)
  expect(created.split('\n')[1]).toMatch(/^\[[0-9a-f]{8}\] "Release 1\.1\.0" \(active\)$/)
  expect(shape(created)).toEqual([
    '  1 "Merge to main" (active)',
    '  2 "Push the tag" (waiting)',
    '  3 "Write the notes" (waiting)',
    '  4 "Publish" (waiting)',
  ])
  expect(saved(world).processes[0]).toMatchObject({ title: 'Release 1.1.0', status: 'active' })
  expect(saved(world).processes[0]?.steps[0]).toMatchObject({ memo: 'Check the dev log first' })
  // 보기에는 메모까지 실린다
  expect(await resultOf($, { action: 'list' })).toContain('    memo: Check the dev log first')
  expect(world.told()).toEqual([])
})

test('"remove 3" and "put this before 2" change the process and renumber it', async ($, on) => {
  await start($, on)
  await release($)
  expect(shape(await resultOf($, { action: 'remove', ids: ['3'] }))).toEqual([
    '  1 "Merge to main" (active)',
    '  2 "Push the tag" (waiting)',
    '  3 "Publish" (waiting)',
  ])
  expect(shape(await resultOf($, { action: 'add', before: '2', steps: steps('Run the tests') }))).toEqual([
    '  1 "Merge to main" (active)',
    '  2 "Run the tests" (waiting)',
    '  3 "Push the tag" (waiting)',
    '  4 "Publish" (waiting)',
  ])
  // 옮길 자리의 순번은 옮기기 전 기준이다
  expect(shape(await resultOf($, { action: 'move', id: '2', after: '3' }))).toEqual([
    '  1 "Merge to main" (active)',
    '  2 "Push the tag" (waiting)',
    '  3 "Run the tests" (waiting)',
    '  4 "Publish" (waiting)',
  ])
})

test('sub-steps under the active step take over its status, and several statuses change in one call', async ($, on) => {
  const world = await start($, on)
  await release($)
  expect(shape(await resultOf($, { action: 'add', parent: '1', steps: steps('Rebase', 'Merge') }))).toEqual([
    '  1 "Merge to main" (active)',
    '    1.1 "Rebase" (active)',
    '    1.2 "Merge" (waiting)',
    '  2 "Push the tag" (waiting)',
    '  3 "Write the notes" (waiting)',
    '  4 "Publish" (waiting)',
  ])
  expect(
    await resultOf($, {
      action: 'set',
      changes: [
        { id: '1.1', status: 'done' },
        { id: '1.2', status: 'done' },
        { id: '2', status: 'active' },
      ],
    }),
  ).toBe('Set 1.1 done, 1.2 done, 2 active.')
  const [first, second] = saved(world).processes[0]?.steps ?? []
  expect([first?.status, second?.status]).toEqual(['done', 'active'])
})

test('a new process for another goal leaves the old one waiting where it stopped, and switch brings it back', async ($, on) => {
  const world = await start($, on)
  await release($)
  await call($, { action: 'create', title: 'Fix the login bug', steps: [{ title: 'Reproduce', status: 'active' }] })
  expect(saved(world).processes.map(one => [one.title, one.status])).toEqual([
    ['Release 1.1.0', 'waiting'],
    ['Fix the login bug', 'active'],
  ])
  expect(saved(world).processes[0]?.steps[0]?.status).toBe('active')
  const listed = await resultOf($, { action: 'list' })
  expect(listed.indexOf('"Fix the login bug" (active)')).toBeLessThan(listed.indexOf('"Release 1.1.0" (waiting)'))
  // 대기 과정의 단계를 바꾸면 진행 중 과정은 그대로이고 세션에게 알려 준다
  const ref = saved(world).processes[0]?.id.slice(0, 8) ?? ''
  expect(await resultOf($, { action: 'set', process: ref, changes: [{ id: '2', status: 'active' }] })).toContain(
    'is waiting; use switch',
  )
  expect(await resultOf($, { action: 'switch', process: ref })).toBe('"Release 1.1.0" is now the active process.')
  expect(saved(world).processes.map(one => one.status)).toEqual(['active', 'waiting'])
  // 대기로 짜기
  await call($, { action: 'create', title: 'Later idea', steps: steps('Think'), active: false })
  expect(saved(world).processes.map(one => one.status)).toEqual(['active', 'waiting', 'waiting'])
})

test('edit, rename and delete work by number and ref', async ($, on) => {
  const world = await start($, on)
  await release($)
  expect(await resultOf($, { action: 'edit', id: '2', title: 'Push the v1.1.0 tag', memo: 'Signed' })).toMatch(
    /^Edited 2 \[[0-9a-f]{8}\] "Push the v1\.1\.0 tag"\.$/,
  )
  expect(saved(world).processes[0]?.steps[1]).toMatchObject({ title: 'Push the v1.1.0 tag', memo: 'Signed' })
  expect(await resultOf($, { action: 'rename', title: 'Ship 1.1.0' })).toBe('Renamed the process to "Ship 1.1.0".')
  const ref = saved(world).processes[0]?.id.slice(0, 8) ?? ''
  expect(await resultOf($, { action: 'delete', process: `[${ref}]` })).toBe('Deleted "Ship 1.1.0".')
  expect(saved(world).processes).toEqual([])
  expect(await resultOf($, { action: 'list' })).toBe('No processes in this session yet.')
})

test('only the shape of the data is refused: depth, status values, unknown steps, no process', async ($, on) => {
  await start($, on)
  expect((await call($, { action: 'set', changes: [{ id: '1', status: 'done' }] })).deny).toContain(
    'no active process',
  )
  expect((await call($, { action: 'create', title: '' })).deny).toContain('needs a title')
  const deep = [{ title: 'A', steps: [{ title: 'B', steps: [{ title: 'C', steps: [{ title: 'D' }] }] }] }]
  expect((await call($, { action: 'create', title: 'Deep', steps: deep })).deny).toContain('at most 3 levels')
  await release($)
  await call($, { action: 'add', parent: '2', steps: [{ title: 'B', steps: [{ title: 'C' }] }] })
  expect((await call($, { action: 'add', parent: '2.1.1', steps: steps('D') })).deny).toContain('at most 3 levels')
  expect((await call($, { action: 'set', changes: [{ id: '1', status: 'paused' }] })).deny).toContain(
    'Unknown status',
  )
  expect((await call($, { action: 'remove', ids: ['9'] })).deny).toContain('No step 9')
  expect((await call($, { action: 'move', id: '2', parent: '2.1' })).deny).toContain('under itself')
  // 진행 중 단계가 여럿이어도, 흩어져 있어도 막지 않는다
  expect(
    (await call($, { action: 'set', changes: [{ id: '3', status: 'active' }, { id: '4', status: 'active' }] })).deny,
  ).toBeUndefined()
})

test('after a compaction or a resume the session is told the active process and where waiting ones stopped', async ($, on) => {
  const world = await start($, on)
  await release($)
  await call($, { action: 'create', title: 'Fix the login bug', steps: [{ title: 'Reproduce', status: 'active' }] })
  const contextOf = async (source: 'compact' | 'resume', id?: string) =>
    ((await $.classic.SessionStart({ source, session_id: id })) as { additionalContext?: string[] })
      .additionalContext?.[0] ?? ''
  const whole = await contextOf('compact')
  expect(whole).toContain('Open items:\n- (none)')
  expect(whole).toContain('Your processes:\nActive process:\n[')
  expect(whole).toContain('"Fix the login bug" (active)')
  expect(whole).toMatch(/Waiting processes:\n- \[[0-9a-f]{8}\] "Release 1\.1\.0" — stopped at 1 "Merge to main"/)
  // 과정만 있는 세션을 불러와도 전한다
  world.files.set(pathOf('old'), JSON.stringify(saved(world)))
  expect(await contextOf('resume', 'old')).toContain('"Fix the login bug" (active)')
  // 끝난 과정만 있으면 비었다고 전한다
  const finished = saved(world).processes.map(one => ({
    ...one,
    steps: one.steps.map(step => ({ ...step, status: 'done', steps: [] })),
  }))
  world.files.set(pathOf('none'), JSON.stringify({ ...saved(world), processes: finished }))
  expect(await contextOf('resume', 'none')).toBe("[session-note] This session's note is empty.")
})

test('a long handover drops memos and details and points to both list actions', async ($, on) => {
  await start($, on, {
    version: 1,
    items: [{ ...item('a1b2c3d4-0000', 'Check the redirect', 'open', '2026-10-16T14:05:00+09:00'), body: 'x'.repeat(300) }],
    proposals: [],
  })
  await call($, {
    action: 'create',
    title: 'Big job',
    steps: Array.from({ length: 30 }, (_, n) => ({ title: `Step ${n}`, memo: 'm'.repeat(200) })),
  })
  const answered = (await $.classic.SessionStart({ source: 'compact' })) as { additionalContext?: string[] }
  const whole = answered.additionalContext?.[0] ?? ''
  expect(whole).not.toContain('mmm')
  expect(whole).not.toContain('xxx')
  expect(whole).toContain('"Step 29" (waiting)')
  expect(whole).toContain('use the list action of the todo and process tools')
})
