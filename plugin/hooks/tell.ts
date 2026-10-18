// 세션(모델)에게 노트를 전하는 글 — 사용자가 바꾼 것 한 줄, 노트 전체, 과정 보기 (spec AGENT.md 4절·6-5). 세션이 읽는 글이라 영어 하나로 쓴다
import type { EngineInterface } from 'claude-code'

import { doneItems, liveProposals, openItems } from './note'
import type { Item, Note, Process, Proposal, Step } from './note'
import { activeProcess, isFinished, numbered, processesInOrder, statusOf, stoppedAt } from './process'

// 노트 전체를 한 번에 전하는 글의 상한 — 넘으면 내용을 빼고 제목만 보낸다
const LIMIT = 4000
const HEAD = '[session-note]'

// 세션에게 보이는 번호는 id의 앞 8글자다
export const refOf = (id: string) => id.slice(0, 8)

const named = (item: Item) => `[${refOf(item.id)}] "${item.title}"`

export const told = {
  added: (item: Item) => `${HEAD} The user added ${named(item)} to the note.`,
  edited: (item: Item) =>
    `${HEAD} The user edited ${named(item)}${item.body === '' ? '' : ` — details: ${item.body}`}.`,
  removed: (item: Item) => `${HEAD} The user deleted ${named(item)} from the note.`,
  completed: (item: Item) => `${HEAD} The user completed ${named(item)}.`,
  reopened: (item: Item) => `${HEAD} The user reopened ${named(item)}.`,
  accepted: (item: Item) => `${HEAD} The user accepted your proposal; it is now item ${named(item)}.`,
  dismissed: (title: string) => `${HEAD} The user dismissed your proposal "${title}".`,
  confirmed: (item: Item) => `${HEAD} The user confirmed ${named(item)} is done.`,
  notYet: (item: Item) => `${HEAD} The user said ${named(item)} is not done yet; it stays open.`,
}

const proposalLine = (note: Note, p: Proposal) => {
  if (p.kind === 'new') return `- [${refOf(p.id)}] new item: "${p.title}"`
  const item = note.items.find(one => one.id === p.itemId)
  return `- [${refOf(p.id)}] done: ${item === undefined ? `[${refOf(p.itemId)}]` : named(item)}`
}

// 노트를 글로 — 열린 항목은 제목과 내용, 완료 항목은 제목, 사용자가 아직 답하지 않은 제안
export function describe(note: Note, withBody: boolean): string {
  const open = openItems(note)
  const done = doneItems(note)
  const proposals = liveProposals(note)
  const lines = [`${HEAD} The session note now:`, 'Open items:']
  if (open.length === 0) lines.push('- (none)')
  for (const item of open) {
    lines.push(`- ${named(item)}`)
    if (withBody && item.body !== '') lines.push(`  ${item.body}`)
  }
  if (done.length > 0) lines.push('Done items:', ...done.map(item => `- ${named(item)}`))
  if (proposals.length > 0)
    lines.push('Your proposals still waiting for the user:', ...proposals.map(p => proposalLine(note, p)))
  return lines.join('\n')
}

// 단계마다 한 줄: 깊이만큼 들여 쓰고 화면 순번·숨은 번호·제목·상태. 메모는 다음 줄
const stepLines = (steps: Step[], withMemo: boolean) =>
  numbered(steps).flatMap(({ step, number, depth }) => {
    const pad = '  '.repeat(depth)
    const line = `${pad}${number} [${refOf(step.id)}] "${step.title}" (${statusOf(step)})`
    return withMemo && step.memo !== '' ? [line, `${pad}  memo: ${step.memo}`] : [line]
  })

// 과정 하나 — 머리줄과 단계 전체
export const processLines = (proc: Process, withMemo: boolean) => [
  `[${refOf(proc.id)}] "${proc.title}" (${isFinished(proc) ? 'finished' : proc.status})`,
  ...(proc.steps.length === 0 ? ['  (no steps)'] : stepLines(proc.steps, withMemo)),
]

// 과정 도구의 보기 — 끝나지 않은 과정은 단계 전체(진행 중 과정이 맨 위), 끝난 과정은 제목만
export function describeProcesses(note: Note): string {
  const shown = processesInOrder(note)
  if (shown.length === 0) return 'No processes in this session yet.'
  const finished = shown.filter(isFinished)
  const lines = shown.filter(proc => !isFinished(proc)).flatMap(proc => processLines(proc, true))
  if (finished.length > 0)
    lines.push('Finished processes:', ...finished.map(proc => `- [${refOf(proc.id)}] "${proc.title}"`))
  return lines.join('\n')
}

const hasOpenProcess = (note: Note) => note.processes.some(proc => !isFinished(proc))

// 압축·불러온 세션에 전하는 과정 — 진행 중 과정은 단계 전체, 대기 과정은 제목과 멈춘 자리
function handedProcesses(note: Note, withMemo: boolean): string[] {
  const active = activeProcess(note)
  const waiting = processesInOrder(note).filter(proc => proc !== active && !isFinished(proc))
  if (active === undefined && waiting.length === 0) return []
  const lines = ['Your processes:']
  if (active !== undefined) lines.push('Active process:', ...processLines(active, withMemo))
  if (waiting.length > 0)
    lines.push(
      'Waiting processes:',
      ...waiting.map(proc => {
        const at = stoppedAt(proc)
        const where = at === undefined ? '' : ` — stopped at ${at.number} "${at.step.title}"`
        return `- [${refOf(proc.id)}] "${proc.title}"${where}`
      }),
    )
  return lines
}

// 압축 직후에 전하는 노트 전체(할 일과 과정). 비었으면 한 줄, 상한을 넘으면 내용·메모를 빼고 제목만
export function wholeNote(note: Note): string {
  if (note.items.length === 0 && liveProposals(note).length === 0 && !hasOpenProcess(note))
    return `${HEAD} This session's note is empty.`
  const full = [describe(note, true), ...handedProcesses(note, true)].join('\n')
  if (full.length <= LIMIT) return full
  return [
    describe(note, false),
    ...handedProcesses(note, false),
    'Details were left out; use the list action of the todo and process tools to read them.',
  ].join('\n')
}

// /resume·--fork-session으로 불러온 세션에 전하는 글 — 열린 항목·답하지 않은 제안·끝나지 않은 과정이 있으면 전체, 완료만 있으면 한 줄, 비었으면 한 줄
export function arrival(note: Note): string {
  if (openItems(note).length > 0 || liveProposals(note).length > 0 || hasOpenProcess(note)) return wholeNote(note)
  const done = doneItems(note).length
  if (done > 0) return `${HEAD} No open items in this session's note (${done} done).`
  return `${HEAD} This session's note is empty.`
}

// 세션에게 한 줄을 전한다. 사용자 화면에는 보이지 않고 모델만 읽는다. 거부되면 디버그 로그에만 남긴다(6-4 ⑦)
export async function tell($: EngineInterface, text: string) {
  try {
    const stored = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
    if ('deny' in stored) $.ui.log(`not told: ${String(stored.deny)}`, { to: 'debug' })
  } catch (error) {
    $.ui.log(`not told: ${String(error)}`, { to: 'debug' })
  }
}
