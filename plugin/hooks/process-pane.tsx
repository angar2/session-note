// 패널의 과정 탭 — 진행 중 과정(펼침), 대기 과정(한 줄 + 멈춘 자리), 끝난 과정 묶음, 단계 접기. 보기·펼치기만 한다 (spec UI.md 2절)
import type { ClientElements, EngineInterface, RenderChildren } from 'claude-code'

import type { Note, Process, Step } from './note'
import { activeProcess, currentOf, isFinished, numbered, processesInOrder, statusOf, stoppedAt } from './process'
import { SQUARE } from './text'
import type { Text } from './text'
import { setView, type View } from './view'

type Parts = Pick<ClientElements, 'Box' | 'Button' | 'Text'>

// 과정 탭 본문의 구획들 — 패널이 구획 사이에 한 줄 여백을 둔다. rule: 패널 끝까지 닿는 구분선
export function drawProcessTab(
  $: EngineInterface,
  parts: Parts,
  text: Text,
  note: Note,
  view: View,
  rule: RenderChildren,
): RenderChildren[] {
  const { Box, Button, Text: T } = parts
  const active = activeProcess(note)
  const others = processesInOrder(note).filter(proc => proc !== active)
  const waiting = others.filter(proc => !isFinished(proc))
  const finished = others.filter(isFinished)
  // 지금 단계(굵은 제목)는 진행 중 과정에만 있다
  const currentId = active === undefined ? null : (currentOf(active)?.at.step.id ?? null)
  // 펼침 — 사용자가 누른 값, 없으면 기본(진행 중인 단계만 펼침, 과정은 접음)
  const isUnfolded = (id: string, byDefault: boolean) => view.folds[id] ?? byDefault
  const flip = (id: string, shown: boolean) =>
    void setView($, v => ({ ...v, folds: { ...v.folds, [id]: !shown } }))
  const arrow = (shown: boolean) => (shown ? '▾' : '▸')
  const square = (status: Step['status']) => <T color={SQUARE[status].color}>{SQUARE[status].label}</T>

  // 단계 줄 `<네모> <순번> <제목>` — 깊이만큼 들여 쓰고, 아래 단계가 있으면 제목을 눌러 접고 편다
  const stepRows = (proc: Process): RenderChildren[] => {
    const rows: RenderChildren[] = []
    const numberOf = new Map(numbered(proc.steps).map(one => [one.step.id, one.number]))
    const walk = (steps: Step[], depth: number) => {
      for (const step of steps) {
        const number = numberOf.get(step.id) ?? ''
        const status = statusOf(step)
        const hasBelow = step.steps.length > 0
        const shown = hasBelow && isUnfolded(step.id, status === 'active')
        const title = (
          <T bold={step.id === currentId ? true : undefined} wrap="wrap">
            {step.title}
            {hasBelow ? <T dimColor> {arrow(shown)}</T> : ''}
          </T>
        )
        rows.push(
          <Box key={`step-${step.id}`} flexDirection="row" gap={1} paddingLeft={depth * 2} alignItems="flex-start">
            <Box flexShrink={0}>
              <T>
                {square(status)} <T dimColor>{number}</T>
              </T>
            </Box>
            <Box flexDirection="row" flexShrink={1} minWidth={0}>
              {hasBelow ? (
                <Button key={`fold-${step.id}`} plain onPress={() => flip(step.id, shown)}>
                  {title}
                </Button>
              ) : (
                title
              )}
            </Box>
          </Box>,
        )
        if (shown) walk(step.steps, depth + 1)
      }
    }
    walk(proc.steps, 1)
    return rows
  }

  // 대기·끝난 과정의 머리줄 — 누르면 단계를 펼쳐 보기만 하고 진행 중 과정은 바뀌지 않는다
  const folded = (proc: Process, status: Step['status'], aside: string) => {
    const shown = isUnfolded(proc.id, false)
    return [
      <Box key={`proc-${proc.id}`} flexDirection="row" gap={1} alignItems="flex-start">
        <Box flexShrink={0}>{square(status)}</Box>
        <Box flexDirection="row" flexShrink={1} minWidth={0}>
          <Button key={`fold-${proc.id}`} plain onPress={() => flip(proc.id, shown)}>
            <T wrap="wrap">
              <T bold>{proc.title}</T>
              <T dimColor> {arrow(shown)}</T>
              {aside === '' ? '' : <T dimColor>{`  ${aside}`}</T>}
            </T>
          </Button>
        </Box>
      </Box>,
      ...(shown ? stepRows(proc) : []),
    ]
  }

  const sections: RenderChildren[] = []
  if (active !== undefined)
    sections.push(
      <Box key="active" flexDirection="column">
        <Box key={`proc-${active.id}`} flexDirection="row" gap={1} alignItems="flex-start">
          <Box flexShrink={0}>{square('active')}</Box>
          <T bold wrap="wrap">
            {active.title}
          </T>
        </Box>
        {stepRows(active)}
      </Box>,
    )
  if (waiting.length > 0)
    sections.push(
      <Box key="waiting" flexDirection="column">
        {waiting.flatMap(proc => {
          const at = stoppedAt(proc)
          return folded(proc, 'waiting', at === undefined ? '' : text.pausedAt(at.number))
        })}
      </Box>,
    )
  if (sections.length === 0) sections.push(<T dimColor>{text.noProcesses}</T>)
  if (finished.length > 0)
    sections.push(
      <Box key="finished" flexDirection="column">
        {rule}
        <Button
          key="finished-group"
          plain
          dimColor
          label={`${text.finished(finished.length)} ${arrow(view.showFinished)}`}
          onPress={() => void setView($, v => ({ ...v, showFinished: !v.showFinished }))}
        />
        {view.showFinished
          ? finished.flatMap(proc =>
              folded(proc, proc.steps.map(statusOf).every(status => status === 'done') ? 'done' : 'stopped', ''),
            )
          : []}
      </Box>,
    )
  return sections
}
