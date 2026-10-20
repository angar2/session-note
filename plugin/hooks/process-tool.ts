// 세션(모델)이 직접 짜고 고치는 과정 도구(process) — 보기·짜기·단계 넣기·고치기·빼기·옮기기·상태 바꾸기·진행 중 과정 바꾸기·제목 고치기·지우기 (spec AGENT.md 6절)
// 도구는 세션의 호출을 행동 이유로 거절하지 않는다. 거절은 데이터 모양(깊이·상태 값·없는 번호)에만 한다
import type { EngineInterface, On } from 'claude-code'

import { isoAt, newId } from './note'
import type { Note, Process, Step, StepStatus } from './note'
import {
  MAX_DEPTH,
  STEP_STATUSES,
  activate,
  activeProcess,
  editStep,
  findProcess,
  findStep,
  heightOf,
  insertSteps,
  leavesOf,
  moveStep,
  removeSteps,
  setStatus,
  settle,
  statusOf,
  withProcess,
} from './process'
import { describeProcesses, processLines, refOf } from './tell'
import { readNote, saveChange } from './view'

const NAME = 'process'
const CALLED = 'mcp__session-note__process'

// 행동은 권고로만 준다(내장 작업 목록처럼) — 할 일 도구 설명보다 확실히 짧게(spec AGENT.md 6-4)
const DESCRIPTION = `Your process: a roadmap you write and keep current for multi-step work with the user. The user sees the current step above the prompt and the whole process in the side pane, and changes it only by asking you. Steps and processes have an 8-character ref like [a1b2c3d4]; a step can also be named by its on-screen number ("3", "2.1"), in the active process unless you give one.

When: use it proactively, without being asked, for work that will span several turns or steps the user may later ask about ("where are we?"); skip one-reply tasks. Make one if the user asks; not if they say no. Plan the top level at the start; fill sub-steps as you enter a step. Two levels by default, a third only when needed.

Status: set a step active before you start it and done right after. stopped = not finished or dropped. Postponed for another process is not stopped. If the user says remove a step, remove it.

Say one line when you create a process, or change its top level on your own (with why). Don't mention starting, finishing or filling steps, or changes the user asked for.

Interruptions: a quick side task stays out (todo); a prerequisite goes in as a sub-step where you are; a big task with another goal is a new process (the old one waits); a changed goal: show the new plan, get an OK, create it, stop the old unfinished steps. Say any change in a very short line.

Titles: short noun phrases (~15 chars), not repeating the parent, not one-word tags. If the built-in task list is on, plan here only.`

const STEP_INPUT = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    memo: { type: 'string', description: 'Notes for you; not shown to the user.' },
    status: { type: 'string', enum: STEP_STATUSES },
    steps: { type: 'array', items: { type: 'object' }, description: 'Sub-steps, same shape.' },
  },
  required: ['title'],
} as const

const SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'create', 'add', 'edit', 'remove', 'move', 'set', 'switch', 'rename', 'delete'],
      description:
        'list; create (title, steps, active=false to keep it waiting); add (steps at parent/before/after); edit (id, title, memo); remove (ids); move (id to parent/before/after); set (changes); switch (make process active); rename (process, title); delete (process).',
    },
    process: { type: 'string', description: 'Process ref; default the active process.' },
    title: { type: 'string' },
    memo: { type: 'string' },
    steps: { type: 'array', items: STEP_INPUT },
    id: { type: 'string', description: 'Step ref or number.' },
    ids: { type: 'array', items: { type: 'string' } },
    parent: { type: 'string', description: 'Put under this step; omit for the top level.' },
    before: { type: 'string' },
    after: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, status: { type: 'string', enum: STEP_STATUSES } },
        required: ['id', 'status'],
      },
    },
    active: { type: 'boolean' },
  },
  required: ['action'],
} as const

type Answer = { result: string } | { deny: string }

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// [a1b2c3d4]·a1b2c3d4·id 전체·순번 모두 받는다
const refIn = (value: unknown) => textOf(value).replace(/^\[|\]$/g, '')

const unsaved: Answer = { deny: "Couldn't save the note (or it is not open yet). Try again later." }

const named = (step: Step) => `[${refOf(step.id)}] "${step.title}"`

export function registerProcessTool($: EngineInterface) {
  return $.tool.register({ name: NAME, description: DESCRIPTION, inputSchema: SCHEMA, isDeferred: false })
}

export function serveProcessTool(on: On) {
  on('tool.call', { tool: CALLED }, async ($, e) => answer($, e as unknown as Record<string, unknown>)).catch(() => ({
    deny: 'The process tool failed. Try again later.',
  }))
}

async function answer($: EngineInterface, args: Record<string, unknown>): Promise<Answer> {
  const action = textOf(args['action'])
  const note = await readNote($)
  if (action === 'list') return { result: describeProcesses(note) }
  if (action === 'create') return create($, args)
  const procRef = refIn(args['process'])
  const proc = procRef === '' ? activeProcess(note) : findProcess(note, procRef)
  if (proc === undefined)
    return {
      deny:
        procRef === ''
          ? 'There is no active process. Give a process ref, or create one.'
          : `No process [${procRef}]. Use list to see the refs.`,
    }
  if (action === 'switch') return save($, activate, proc, `"${proc.title}" is now the active process.`)
  if (action === 'rename') {
    const title = textOf(args['title'])
    if (title === '') return { deny: 'Give the new process title.' }
    return change($, proc, one => ({ ...one, title }), `Renamed the process to "${title}".`)
  }
  if (action === 'delete') {
    const drop = (n: Note, id: string) => ({ ...n, processes: n.processes.filter(one => one.id !== id) })
    return save($, drop, proc, `Deleted "${proc.title}".`)
  }
  if (action === 'add') return add($, proc, args)
  if (action === 'edit') return edit($, proc, args)
  if (action === 'remove') return remove($, proc, args)
  if (action === 'move') return move($, proc, args)
  if (action === 'set') return set($, proc, args)
  return {
    deny: `Unknown action "${action}". Use list, create, add, edit, remove, move, set, switch, rename or delete.`,
  }
}

// 노트를 바꿔 저장하고 한 줄로 답한다
async function save($: EngineInterface, edit: (n: Note, id: string) => Note, proc: Process, line: string) {
  const saved = await saveChange($, n => edit(n, proc.id))
  return saved === null ? unsaved : { result: line }
}

// 과정 하나를 바꿔 저장한다. 답은 한 줄, full이면 바뀐 과정 전체를 붙인다
async function change(
  $: EngineInterface,
  proc: Process,
  edit: (proc: Process) => Process,
  line: string,
  full = false,
): Promise<Answer> {
  const saved = await saveChange($, n => withProcess(n, proc.id, edit))
  if (saved === null) return unsaved
  const now = saved.processes.find(one => one.id === proc.id)
  if (!full || now === undefined) return { result: line }
  return { result: [line, ...processLines(now, false)].join('\n') }
}

// 입력 단계 → 새 단계(새 숨은 번호). 제목이 없거나 상태 값이 틀리면 이유를 돌려준다
function stepsIn(value: unknown): Step[] | string {
  if (value === undefined) return []
  if (!Array.isArray(value)) return 'steps must be a list.'
  const steps: Step[] = []
  for (const raw of value) {
    const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const title = textOf(input['title'])
    if (title === '') return 'Every step needs a title.'
    const status = input['status'] === undefined ? 'waiting' : textOf(input['status'])
    if (!STEP_STATUSES.includes(status as StepStatus))
      return `Unknown status "${status}". Use waiting, active, done or stopped.`
    const below = stepsIn(input['steps'])
    if (typeof below === 'string') return below
    steps.push({ id: newId(), title, memo: textOf(input['memo']), status: status as StepStatus, steps: below })
  }
  return steps
}

const tooDeep = `Steps go at most ${MAX_DEPTH} levels deep.`

async function create($: EngineInterface, args: Record<string, unknown>): Promise<Answer> {
  const title = textOf(args['title'])
  if (title === '') return { deny: 'A process needs a title.' }
  const steps = stepsIn(args['steps'])
  if (typeof steps === 'string') return { deny: steps }
  if (steps.some(step => heightOf(step) > MAX_DEPTH)) return { deny: tooDeep }
  const isActive = args['active'] !== false
  const proc: Process = {
    id: newId(),
    title,
    status: 'waiting',
    createdAt: isoAt(await $.clock.now()),
    steps: settle(steps),
  }
  const saved = await saveChange($, n => {
    const added = { ...n, processes: [...n.processes, proc] }
    return isActive ? activate(added, proc.id) : added
  })
  if (saved === null) return unsaved
  const made = saved.processes.find(one => one.id === proc.id) ?? proc
  return { result: ['Created:', ...processLines(made, false)].join('\n') }
}

// 넣을 자리 — before·after면 그 단계의 형제 자리, parent면 그 아래 끝, 아무것도 없으면 1단 끝
type Place = { parentId: string | null; index: number; depth: number }

function placeIn(proc: Process, args: Record<string, unknown>): Place | string {
  for (const side of ['before', 'after'] as const) {
    const ref = refIn(args[side])
    if (ref === '') continue
    const near = findStep(proc, ref)
    if (near === undefined) return `No step ${ref}. Use list to see the steps.`
    const siblings = near.parentId === null ? proc.steps : (findStep(proc, near.parentId)?.step.steps ?? [])
    const at = siblings.findIndex(one => one.id === near.step.id)
    return { parentId: near.parentId, index: side === 'before' ? at : at + 1, depth: near.depth }
  }
  const ref = refIn(args['parent'])
  if (ref === '') return { parentId: null, index: proc.steps.length, depth: 1 }
  const parent = findStep(proc, ref)
  if (parent === undefined) return `No step ${ref}. Use list to see the steps.`
  return { parentId: parent.step.id, index: parent.step.steps.length, depth: parent.depth + 1 }
}

async function add($: EngineInterface, proc: Process, args: Record<string, unknown>): Promise<Answer> {
  const steps = stepsIn(args['steps'])
  if (typeof steps === 'string') return { deny: steps }
  if (steps.length === 0) return { deny: 'Give the steps to add.' }
  const place = placeIn(proc, args)
  if (typeof place === 'string') return { deny: place }
  if (steps.some(step => place.depth + heightOf(step) - 1 > MAX_DEPTH)) return { deny: tooDeep }
  return change(
    $,
    proc,
    one => insertSteps(one, place.parentId, place.index, steps),
    `Added ${steps.map(named).join(', ')}. Now:`,
    true,
  )
}

async function edit($: EngineInterface, proc: Process, args: Record<string, unknown>): Promise<Answer> {
  const ref = refIn(args['id'])
  const found = findStep(proc, ref)
  if (found === undefined) return { deny: `No step ${ref}. Use list to see the steps.` }
  const title = textOf(args['title'])
  const memo = typeof args['memo'] === 'string' ? args['memo'].trim() : undefined
  if (title === '' && memo === undefined) return { deny: 'Give a new title or memo to edit.' }
  const line = `Edited ${found.number} ${named({ ...found.step, title: title || found.step.title })}.`
  return change($, proc, one => editStep(one, found.step.id, title, memo), line)
}

async function remove($: EngineInterface, proc: Process, args: Record<string, unknown>): Promise<Answer> {
  const refs = [...(Array.isArray(args['ids']) ? args['ids'] : []), args['id']].map(refIn).filter(ref => ref !== '')
  if (refs.length === 0) return { deny: 'Give the ids of the steps to remove.' }
  const found = refs.map(ref => findStep(proc, ref))
  const missing = refs.filter((_, n) => found[n] === undefined)
  if (missing.length > 0) return { deny: `No step ${missing.join(', ')}. Use list to see the steps.` }
  const steps = found.flatMap(one => (one === undefined ? [] : [one.step]))
  return change(
    $,
    proc,
    one => removeSteps(one, new Set(steps.map(step => step.id))),
    `Removed ${steps.map(named).join(', ')}. Now:`,
    true,
  )
}

async function move($: EngineInterface, proc: Process, args: Record<string, unknown>): Promise<Answer> {
  const ref = refIn(args['id'])
  const found = findStep(proc, ref)
  if (found === undefined) return { deny: `No step ${ref}. Use list to see the steps.` }
  // 자리 순번은 옮기기 전 기준으로 숨은 번호로 바꾼 뒤, 옮길 단계를 뺀 과정에서 자리를 찾는다
  const near: Record<string, string> = {}
  for (const side of ['parent', 'before', 'after'] as const) {
    const sideRef = refIn(args[side])
    if (sideRef === '') continue
    const target = findStep(proc, sideRef)
    if (target === undefined) return { deny: `No step ${sideRef}. Use list to see the steps.` }
    if (target.path.slice(0, found.depth).join('.') === found.number)
      return { deny: 'A step cannot move next to or under itself.' }
    near[side] = target.step.id
  }
  const place = placeIn(removeSteps(proc, new Set([found.step.id])), near)
  if (typeof place === 'string') return { deny: place }
  if (place.depth + heightOf(found.step) - 1 > MAX_DEPTH) return { deny: tooDeep }
  return change(
    $,
    proc,
    one => moveStep(one, found.step.id, place.parentId, place.index),
    `Moved ${named(found.step)}. Now:`,
    true,
  )
}

// 답은 저장된 과정에서 만든다 — 세부 단계가 있는 단계는 세부 단계를 따르므로 요청한 상태가 되지 않을 수 있다
async function set($: EngineInterface, proc: Process, args: Record<string, unknown>): Promise<Answer> {
  const changes = Array.isArray(args['changes']) ? args['changes'] : []
  if (changes.length === 0) return { deny: 'Give changes: a list of { id, status }.' }
  const resolved: { id: string; status: StepStatus; before: Step }[] = []
  // 한 호출 안의 순번은 모두 호출 전 기준으로 찾는다
  for (const raw of changes) {
    const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const ref = refIn(input['id'])
    const status = textOf(input['status'])
    const found = findStep(proc, ref)
    if (found === undefined) return { deny: `No step ${ref}. Use list to see the steps.` }
    if (!STEP_STATUSES.includes(status as StepStatus))
      return { deny: `Unknown status "${status}". Use waiting, active, done or stopped.` }
    resolved.push({ id: found.step.id, status: status as StepStatus, before: found.step })
  }
  const saved = await saveChange($, n =>
    withProcess(n, proc.id, one => resolved.reduce((acc, next) => setStatus(acc, next.id, next.status), one)),
  )
  if (saved === null) return unsaved
  const now = saved.processes.find(one => one.id === proc.id) ?? proc
  const leafStatuses = (step: Step) => leavesOf(step).map(leaf => leaf.status).join()
  const done: string[] = []
  const missed: string[] = []
  for (const { id, status, before } of resolved) {
    const after = findStep(now, id)
    if (after === undefined) continue
    const actual = statusOf(after.step)
    if (actual === status) {
      done.push(`${after.number} ${actual}`)
      continue
    }
    const below = after.step.steps.map((child, n) => `${after.number}.${n + 1} ${statusOf(child)}`).join(', ')
    const why = below === '' ? '' : ` (a step with sub-steps follows them: ${below})`
    missed.push(
      leafStatuses(before) === leafStatuses(after.step)
        ? `${after.number} unchanged: still ${actual}, not ${status}${why}.`
        : `${after.number} is ${actual}, not ${status}${why}.`,
    )
  }
  const waiting = proc.status === 'waiting' ? `"${proc.title}" is waiting; use switch to make it active.` : ''
  const head = done.length === 0 ? [] : [`Set ${done.join(', ')}.`]
  return { result: [...head, ...missed, waiting].filter(line => line !== '').join(' ') }
}
