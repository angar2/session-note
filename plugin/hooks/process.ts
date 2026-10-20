// 과정의 데이터 규칙 — 깊이 3단, 위 단계 상태 계산, 진행 중 과정 하나, 아래 단계의 진행 중 이어받기, 화면 순번과 지금 단계 (spec AGENT.md 6-3, DATA.md 4절)
// 코드는 데이터 모양만 지킨다. 진행 중 단계의 개수·위치는 막지 않는다.
// 이름에 process를 쓰지 않는다(Node 전역 process를 가린다) — 과정 하나는 proc으로 부른다

import type { Note, Process, Step, StepStatus } from '../types'

// 과정 단계의 깊이는 최대 3단이다
export const MAX_DEPTH = 3

export const STEP_STATUSES: readonly StepStatus[] = ['waiting', 'active', 'done', 'stopped']

const isOver = (status: StepStatus) => status === 'done' || status === 'stopped'

// 아래 단계가 있는 단계의 상태는 아래 단계로 정해진다: 모두 완료 → 완료, 모두 완료·중단이고 중단이 있으면 → 중단,
// 하나라도 시작했으면 → 진행 중, 아니면 → 대기. 파일에 적힌 위 단계 값에 기대지 않는다
export function statusOf(step: Step): StepStatus {
  if (step.steps.length === 0) return step.status
  const below = step.steps.map(statusOf)
  if (below.every(status => status === 'done')) return 'done'
  if (below.every(isOver)) return 'stopped'
  if (below.some(status => status !== 'waiting')) return 'active'
  return 'waiting'
}

// 위 단계에 계산한 상태를 적어 둔다 — 파일을 읽는 사람이 헷갈리지 않게
export const settle = (steps: Step[]): Step[] =>
  steps.map(step => {
    if (step.steps.length === 0) return step
    const below = settle(step.steps)
    return { ...step, steps: below, status: statusOf({ ...step, steps: below }) }
  })

// 단계가 있고 모두 완료·중단인 과정은 끝난 과정이다(지우지 않고 화면에서 숨긴다)
export const isFinished = (proc: Process) => proc.steps.length > 0 && proc.steps.map(statusOf).every(isOver)

// 끝나지 않은 진행 중 과정 — 많아야 하나
export const activeProcess = (note: Note) => note.processes.find(proc => proc.status === 'active' && !isFinished(proc))

// 진행 중 과정, 대기 과정(만든 순), 끝난 과정(만든 순) 순서
export function processesInOrder(note: Note): Process[] {
  const active = activeProcess(note)
  const byAge = [...note.processes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const waiting = byAge.filter(proc => proc !== active && !isFinished(proc))
  const finished = byAge.filter(isFinished)
  return [...(active === undefined ? [] : [active]), ...waiting, ...finished]
}

// 다른 과정을 진행 중으로 바꾸면 하던 과정은 대기가 된다. 단계 상태는 그대로 둔다(돌아올 자리)
export const activate = (note: Note, id: string): Note => ({
  ...note,
  processes: note.processes.map(proc => ({ ...proc, status: proc.id === id ? 'active' : 'waiting' })),
})

export const withProcess = (note: Note, id: string, change: (proc: Process) => Process): Note => ({
  ...note,
  processes: note.processes.map(proc => (proc.id === id ? change(proc) : proc)),
})

// 화면과 같은 순번(1, 2, 2.1, 2.1.1)을 단 단계 목록 — 자리 순서대로 매기고 저장하지 않는다
export type Numbered = { step: Step; number: string; depth: number; parentId: string | null; path: number[] }

export function numbered(steps: Step[], parentId: string | null = null, path: number[] = []): Numbered[] {
  return steps.flatMap((step, index) => {
    const here = [...path, index + 1]
    return [
      { step, number: here.join('.'), depth: here.length, parentId, path: here },
      ...numbered(step.steps, step.id, here),
    ]
  })
}

const sameRef = (id: string, ref: string) => ref !== '' && (id === ref || id.slice(0, 8) === ref)

// 숨은 번호(8글자·전체 id) 또는 화면 순번("3", "2.1")으로 단계를 찾는다
export function findStep(proc: Process, ref: string): Numbered | undefined {
  const all = numbered(proc.steps)
  return all.find(one => sameRef(one.step.id, ref)) ?? all.find(one => one.number === ref)
}

export const findProcess = (note: Note, ref: string) => note.processes.find(proc => sameRef(proc.id, ref))

// 단계 아래로 몇 단이 있는지(아래 단계가 없으면 1)
export const heightOf = (step: Step): number => 1 + Math.max(0, ...step.steps.map(heightOf))

export const leavesOf = (step: Step): Step[] => (step.steps.length === 0 ? [step] : step.steps.flatMap(leavesOf))

// 지금 단계 — 진행 중인 끝 단계가 하나면 그 단계, 여럿이고 같은 1단 안이면 그들을 묶는 가장 가까운 위 단계,
// 서로 다른 1단에 흩어져 있으면 앞쪽 하나와 나머지 개수(띠의 "외 N"). 진행 중 단계가 없으면 null (spec UI.md 6절)
export function currentOf(proc: Process): { at: Numbered; others: number } | null {
  const all = numbered(proc.steps)
  const active = all.filter(one => one.step.steps.length === 0 && one.step.status === 'active')
  if (active.length === 0) return null
  const groups = new Map<number, Numbered[]>()
  for (const one of active) groups.set(one.path[0] ?? 0, [...(groups.get(one.path[0] ?? 0) ?? []), one])
  const [first = []] = groups.values()
  const at = all.find(one => one.number === commonPath(first.map(one => one.path)).join('.'))
  return at === undefined ? null : { at, others: groups.size - 1 }
}

// 여러 순번이 함께 시작하는 가장 긴 앞부분 — 하나면 그 순번 그대로
function commonPath(paths: number[][]): number[] {
  const [head = [], ...rest] = paths
  let n = 0
  while (n < head.length && rest.every(path => path[n] === head[n])) n++
  return head.slice(0, n)
}

// 대기 과정이 멈춘 자리 — 지금 단계, 없으면 끝나지 않은 첫 끝 단계
export function stoppedAt(proc: Process): Numbered | undefined {
  const current = currentOf(proc)
  if (current !== null) return current.at
  return numbered(proc.steps).find(one => one.step.steps.length === 0 && !isOver(one.step.status))
}

// 단계 목록 안에서 id인 단계를 고친다(어느 깊이든)
const mapStep = (steps: Step[], id: string, change: (step: Step) => Step): Step[] =>
  steps.map(step => (step.id === id ? change(step) : { ...step, steps: mapStep(step.steps, id, change) }))

const dropSteps = (steps: Step[], ids: ReadonlySet<string>): Step[] =>
  steps.filter(step => !ids.has(step.id)).map(step => ({ ...step, steps: dropSteps(step.steps, ids) }))

// 첫 끝 단계를 진행 중으로 — 이어받기에 쓴다
const startFirst = (step: Step): Step =>
  step.steps.length === 0
    ? { ...step, status: 'active' }
    : { ...step, steps: step.steps.map((one, index) => (index === 0 ? startFirst(one) : one)) }

// parentId(없으면 1단) 아래 index 자리에 단계를 넣는다. 진행 중인 끝 단계에 처음 아래 단계를 넣고 넣는 단계가 모두
// 대기면 첫 단계가 진행 중을 이어받는다 — 위 단계가 대기로 뒤집혀 지금 단계가 사라지지 않게
export function insertSteps(proc: Process, parentId: string | null, index: number, added: Step[]): Process {
  const place = (siblings: Step[]) => [...siblings.slice(0, index), ...added, ...siblings.slice(index)]
  if (parentId === null) return { ...proc, steps: settle(place(proc.steps)) }
  const steps = mapStep(proc.steps, parentId, parent => {
    const inherits =
      parent.steps.length === 0 && parent.status === 'active' && added.every(step => statusOf(step) === 'waiting')
    const below = inherits ? added.map((step, n) => (n === 0 ? startFirst(step) : step)) : added
    return { ...parent, steps: [...parent.steps.slice(0, index), ...below, ...parent.steps.slice(index)] }
  })
  return { ...proc, steps: settle(steps) }
}

// 단계를 빼면 그 아래 단계도 함께 빠진다. 아래 단계가 모두 빠진 위 단계는 마지막 계산 상태를 제 상태로 남긴다
export const removeSteps = (proc: Process, ids: ReadonlySet<string>): Process => ({
  ...proc,
  steps: settle(dropSteps(proc.steps, ids)),
})

export function editStep(proc: Process, id: string, title: string, memo?: string): Process {
  return {
    ...proc,
    steps: mapStep(proc.steps, id, step => ({ ...step, title: title === '' ? step.title : title, memo: memo ?? step.memo })),
  }
}

// 단계 하나를 다른 자리로 옮긴다(아래 단계와 함께). index는 단계를 뺀 뒤의 자리다
export function moveStep(proc: Process, id: string, parentId: string | null, index: number): Process {
  const moving = findStep(proc, id)?.step
  if (moving === undefined) return proc
  return insertSteps(removeSteps(proc, new Set([id])), parentId, index, [moving])
}

// 끝 단계는 그 상태로. 아래 단계가 있는 단계는 거절하지 않고 그 아래 끝 단계들에 적용한다 — 완료·중단 = 끝나지 않은
// 끝 단계 모두, 진행 중 = 끝나지 않은 첫 끝 단계(이미 진행 중인 것이 있으면 그대로), 대기 = 진행 중인 끝 단계들
export function setStatus(proc: Process, id: string, status: StepStatus): Process {
  const steps = mapStep(proc.steps, id, step => {
    if (step.steps.length === 0) return { ...step, status }
    const leaves = leavesOf(step)
    const open = leaves.filter(leaf => !isOver(leaf.status))
    const targets =
      status === 'active'
        ? open.some(leaf => leaf.status === 'active')
          ? []
          : open.slice(0, 1)
        : status === 'waiting'
          ? leaves.filter(leaf => leaf.status === 'active')
          : open
    const ids = new Set(targets.map(leaf => leaf.id))
    const apply = (one: Step): Step =>
      ids.has(one.id) ? { ...one, status } : { ...one, steps: one.steps.map(apply) }
    return apply(step)
  })
  return { ...proc, steps: settle(steps) }
}
