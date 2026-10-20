// 과정 데이터 규칙 — 1.0.x 파일 읽기, 위 단계 상태 계산, 이어받기, 진행 중 과정 하나, 순번·지금 단계 (spec AGENT.md 6-3, DATA.md 4절)
import { expect, test } from 'claude-code/testing'

import { emptyNote, formatNote, parseNote, type Note, type Process, type Step, type StepStatus } from '../hooks/note'
import {
  activate,
  activeProcess,
  currentOf,
  editStep,
  findStep,
  insertSteps,
  isFinished,
  moveStep,
  numbered,
  processesInOrder,
  removeSteps,
  setStatus,
  statusOf,
  stoppedAt,
} from '../hooks/process'

const step = (id: string, status: StepStatus = 'waiting', steps: Step[] = []): Step => ({
  id,
  title: `Step ${id}`,
  memo: '',
  status,
  steps,
})

const proc = (id: string, steps: Step[], status: Process['status'] = 'active', createdAt = '2026-10-19T09:00:00+09:00') => ({
  id,
  title: `Process ${id}`,
  status,
  createdAt,
  steps,
})

const statuses = (p: Process) => numbered(p.steps).map(one => `${one.number} ${statusOf(one.step)}`)

test('a 1.0.x file without processes reads as a note with no processes, and processes are saved', () => {
  const old = parseNote(JSON.stringify({ version: 1, items: [], proposals: [] }))
  expect(old).toEqual({ ok: true, note: emptyNote() })
  const note: Note = { ...emptyNote(), processes: [proc('p1', [step('a')])] }
  expect(parseNote(formatNote(note))).toEqual({ ok: true, note })
  expect(parseNote(JSON.stringify({ version: 1, items: [], proposals: [], processes: 3 })).ok).toBe(false)
})

test('a step with steps below takes its status from them, not from the file', () => {
  const parent = (...below: StepStatus[]) => statusOf(step('p', 'waiting', below.map((s, n) => step(`c${n}`, s))))
  expect(parent('done', 'done')).toBe('done')
  expect(parent('done', 'stopped')).toBe('stopped')
  expect(parent('done', 'waiting')).toBe('active')
  expect(parent('waiting', 'active')).toBe('active')
  expect(parent('waiting', 'waiting')).toBe('waiting')
  expect(statusOf(step('p', 'done', [step('c', 'waiting')]))).toBe('waiting')
})

test('steps are numbered by place, and found by ref or by number', () => {
  const p = proc('p1', [step('a1111111-x'), step('b2222222-x', 'waiting', [step('c3333333-x', 'waiting', [step('d4444444-x')])])])
  expect(numbered(p.steps).map(one => one.number)).toEqual(['1', '2', '2.1', '2.1.1'])
  expect(findStep(p, 'c3333333')?.number).toBe('2.1')
  expect(findStep(p, '2.1.1')?.step.id).toBe('d4444444-x')
  expect(findStep(p, '[c3333333]')).toBeUndefined()
  expect(findStep(p, '5')).toBeUndefined()
})

test('the first new step below an active step takes over its active status', () => {
  const p = proc('p1', [step('a', 'done'), step('b', 'active'), step('c')])
  const filled = insertSteps(p, 'b', 0, [step('b1'), step('b2')])
  expect(statuses(filled)).toEqual(['1 done', '2 active', '2.1 active', '2.2 waiting', '3 waiting'])
  // 이미 아래 단계가 있으면 넣는 단계는 제 상태 그대로
  const more = insertSteps(filled, 'b', 2, [step('b3')])
  expect(statuses(more).slice(1, 5)).toEqual(['2 active', '2.1 active', '2.2 waiting', '2.3 waiting'])
  // 대기 단계에 넣으면 이어받지 않는다
  expect(statuses(insertSteps(p, 'c', 0, [step('c1')]))).toContain('3.1 waiting')
})

test('removing, editing and moving steps renumbers by place', () => {
  const p = proc('p1', [step('a'), step('b'), step('c', 'waiting', [step('c1')]), step('d')])
  const removed = removeSteps(p, new Set(['c']))
  expect(numbered(removed.steps).map(one => `${one.number} ${one.step.id}`)).toEqual(['1 a', '2 b', '3 d'])
  const moved = moveStep(p, 'd', null, 1)
  expect(moved.steps.map(one => one.id)).toEqual(['a', 'd', 'b', 'c'])
  const deeper = moveStep(p, 'b', 'c', 0)
  expect(numbered(deeper.steps).map(one => `${one.number} ${one.step.id}`)).toEqual(['1 a', '2 c', '2.1 b', '2.2 c1', '3 d'])
  const edited = editStep(p, 'a', 'Renamed', 'For the session')
  expect(edited.steps[0]).toMatchObject({ title: 'Renamed', memo: 'For the session' })
  expect(editStep(edited, 'a', '', undefined).steps[0]).toMatchObject({ title: 'Renamed', memo: 'For the session' })
})

test('a status given to a step with steps below goes to its own last-level steps', () => {
  const p = proc('p1', [step('a', 'waiting', [step('a1', 'done'), step('a2'), step('a3')]), step('b')])
  expect(statuses(setStatus(p, 'a', 'done'))).toEqual(['1 done', '1.1 done', '1.2 done', '1.3 done', '2 waiting'])
  expect(statuses(setStatus(p, 'a', 'stopped'))).toEqual(['1 stopped', '1.1 done', '1.2 stopped', '1.3 stopped', '2 waiting'])
  const started = setStatus(p, 'a', 'active')
  expect(statuses(started)).toEqual(['1 active', '1.1 done', '1.2 active', '1.3 waiting', '2 waiting'])
  expect(statuses(setStatus(started, 'a', 'waiting'))).toContain('1.2 waiting')
  expect(statuses(setStatus(p, 'b', 'active'))).toContain('2 active')
})

test('one active process: another made active leaves the old one waiting with its steps as they were', () => {
  const note: Note = {
    ...emptyNote(),
    processes: [proc('p1', [step('a', 'active')]), proc('p2', [step('x')], 'waiting', '2026-10-19T10:00:00+09:00')],
  }
  const switched = activate(note, 'p2')
  expect(activeProcess(switched)?.id).toBe('p2')
  expect(switched.processes[0]).toMatchObject({ status: 'waiting', steps: [{ status: 'active' }] })
  expect(stoppedAt(switched.processes[0] as Process)?.number).toBe('1')
})

test('a process whose steps are all done or stopped is finished and listed last', () => {
  const done = proc('p1', [step('a', 'done'), step('b', 'stopped')])
  const waiting = proc('p2', [step('x')], 'waiting', '2026-10-19T10:00:00+09:00')
  const note: Note = { ...emptyNote(), processes: [done, waiting] }
  expect(isFinished(done)).toBe(true)
  expect(isFinished(proc('p3', []))).toBe(false)
  expect(activeProcess(note)).toBeUndefined()
  expect(processesInOrder(note).map(one => one.id)).toEqual(['p2', 'p1'])
})

test('the current step is the one active step, their nearest shared step, or the first of scattered ones', () => {
  const one = proc('p1', [step('a', 'done'), step('b', 'waiting', [step('b1', 'active'), step('b2')])])
  expect(currentOf(one)).toMatchObject({ at: { number: '2.1' }, others: 0 })
  const shared = proc('p1', [step('a', 'waiting', [step('a1', 'active'), step('a2', 'active')])])
  expect(currentOf(shared)).toMatchObject({ at: { number: '1' }, others: 0 })
  const scattered = proc('p1', [
    step('a', 'waiting', [step('a1', 'waiting', [step('a11', 'active')])]),
    step('b', 'active'),
    step('c', 'active'),
  ])
  expect(currentOf(scattered)).toMatchObject({ at: { number: '1.1.1' }, others: 2 })
  expect(currentOf(proc('p1', [step('a')]))).toBeNull()
  expect(stoppedAt(proc('p1', [step('a', 'done'), step('b')]))?.number).toBe('2')
})
