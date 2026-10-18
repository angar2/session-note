// 입력창 위 띠 — 왼쪽은 할 일(열린 항목 수, 세션의 제안), 오른쪽은 과정(지금 단계), 맨 오른쪽은 늘 있는 열기·닫기·보기 (spec UI.md 1절)
import type { On } from 'claude-code'

import { activeProcess, currentOf } from './process'
import { LABEL, MARK, SQUARE, buttonLook, cellsOf, cut } from './text'
import type { Text } from './text'
import {
  acceptProposal,
  dismissProposal,
  focusAfter,
  isPaneOpen,
  liveProposals,
  openItems,
  readNote,
  togglePane,
} from './view'

// 과정 단계 제목에 남길 최소 칸(앞 띄어쓰기 포함) — 이보다 좁으면 제목을 빼고 번호만 남긴다
const MIN_STEP_TITLE = 6

// background: 설정에서 고른 띠 배경 테마 키(없으면 배경 없음). 터미널에서만 칠한다
export function drawBand(on: On, text: Text, background?: string) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text: T } = $.ui.resolve(e)
    const current = await readNote($)
    const count = openItems(current).length
    const proposals = liveProposals(current)
    const isEmpty = count === 0 && proposals.length === 0
    const isOpen = await isPaneOpen($)

    // 제안이 하나면 그 제목과 받기·무시 버튼, 여럿이면 개수 요약과 보기(할 일 탭으로 연다)
    const only = proposals.length === 1 ? proposals[0] : undefined
    const many = proposals.length > 1
    const toggleLabel = isOpen ? text.close : many ? text.view : text.open
    const titleOf = (itemId: string) => current.items.find(item => item.id === itemId)?.title ?? ''
    const fresh = proposals.filter(p => p.kind === 'new').length
    const finished = proposals.length - fresh
    const summary = [
      fresh > 0 ? `${MARK.new.label} ${text.pendingNew(fresh)}` : '',
      finished > 0 ? `${MARK.done.label} ${text.pendingDone(finished)}` : '',
    ]
      .filter(part => part !== '')
      .join(' · ')
    const proposalTitle = only === undefined ? '' : only.kind === 'new' ? only.title : titleOf(only.itemId)
    const accept = only === undefined ? '' : buttonLook(e.surface, only.kind === 'new' ? text.accept : text.complete).label
    const dismiss = only === undefined ? '' : buttonLook(e.surface, only.kind === 'new' ? text.dismiss : text.notYet).label

    // 진행 중 과정의 지금 단계 — 없으면 과정 구역을 비운다
    const proc = activeProcess(current)
    const now = proc === undefined ? null : currentOf(proc)
    const stepHead = now === null ? '' : `${LABEL.process} ${text.process} ${SQUARE.active.label} ${now.at.number}`
    const others = now === null || now.others === 0 ? '' : text.others(now.others)

    // 좁은 띠: 글자 폭을 세어 과정 단계 제목부터 줄이고, 다음으로 제안 제목을 줄인다. 이름표·개수·번호·버튼은 자르지 않는다
    const fixed =
      cellsOf(`${LABEL.todo} ${text.todo} ${count}`) +
      (only !== undefined ? 5 + cellsOf(MARK[only.kind].label) + 2 + 1 + cellsOf(accept) + 1 + cellsOf(dismiss) : 0) +
      (many ? 5 + cellsOf(summary) : 0) +
      (now === null ? 0 : 2 + cellsOf(stepHead) + (others === '' ? 0 : 1 + cellsOf(others))) +
      2 +
      cellsOf(toggleLabel)
    const room = e.props.bodyColumns - fixed
    const wantProposal = cellsOf(proposalTitle)
    const wantStep = now === null ? 0 : 1 + cellsOf(now.at.step.title)
    let proposalCells = wantProposal
    let stepCells = wantStep
    if (wantProposal + wantStep > room) {
      stepCells = room - wantProposal
      if (stepCells < MIN_STEP_TITLE) {
        stepCells = 0
        proposalCells = Math.max(1, room)
      }
    }
    const stepTitle = now === null || stepCells === 0 ? '' : ` ${cut(now.at.step.title, stepCells - 1)}`

    const mark = (kind: 'new' | 'done') => <T color={MARK[kind].color}>{MARK[kind].label}</T>
    const pending =
      only !== undefined ? (
        <Box key="pending" flexDirection="row" flexShrink={1} minWidth={0}>
          <T dimColor>{'  │  '}</T>
          <T wrap="truncate-end">
            {mark(only.kind)}
            {'  '}
            {cut(proposalTitle, proposalCells)}
          </T>
          <Box flexDirection="row" gap={1} flexShrink={0} marginLeft={1}>
            <Button
              key={`accept-${only.id}`}
              {...buttonLook(e.surface, only.kind === 'new' ? text.accept : text.complete)}
              onPress={() => void focusAfter($, e.requestId, 'toggle', acceptProposal($, text, only.id))}
            />
            <Button
              key={`dismiss-${only.id}`}
              dimColor
              {...buttonLook(e.surface, only.kind === 'new' ? text.dismiss : text.notYet)}
              onPress={() => void focusAfter($, e.requestId, 'toggle', dismissProposal($, text, only.id))}
            />
          </Box>
        </Box>
      ) : many ? (
        <Box key="pending" flexDirection="row" flexShrink={1} minWidth={0}>
          <T dimColor>{'  │  '}</T>
          <T wrap="truncate-end">
            {fresh > 0 ? mark('new') : ''}
            {fresh > 0 ? <T dimColor> {text.pendingNew(fresh)}</T> : ''}
            {fresh > 0 && finished > 0 ? <T dimColor>{' · '}</T> : ''}
            {finished > 0 ? mark('done') : ''}
            {finished > 0 ? <T dimColor> {text.pendingDone(finished)}</T> : ''}
          </T>
        </Box>
      ) : null

    // 과정 구역 — 보기만 하는 표시(버튼 없음)
    const step =
      now === null ? null : (
        <Box key="process" flexShrink={0}>
          <T wrap="truncate-end">
            <T dimColor>
              {LABEL.process} {text.process}
            </T>{' '}
            <T color={SQUARE.active.color}>{SQUARE.active.label}</T> {now.at.number}
            {stepTitle}
            {others === '' ? '' : <T dimColor> {others}</T>}
          </T>
        </Box>
      )

    return (
      <Box
        flexDirection="row"
        justifyContent="space-between"
        width={e.props.bodyColumns}
        backgroundColor={e.surface === 'terminal' ? background : undefined}
      >
        <Box flexDirection="row" flexShrink={1} minWidth={0}>
          <Box key="count" flexShrink={0}>
            {isEmpty ? (
              <T dimColor>
                {LABEL.todo} {text.todo} 0
              </T>
            ) : (
              <T>
                <T dimColor>
                  {LABEL.todo} {text.todo}
                </T>{' '}
                <T bold>{String(count)}</T>
              </T>
            )}
          </Box>
          {pending}
        </Box>
        <Box flexDirection="row" gap={2} flexShrink={0} marginLeft={2}>
          {step}
          <Button
            key="toggle"
            plain
            label={toggleLabel}
            onPress={() => void togglePane($, text.notes, isOpen, many ? 'todo' : undefined)}
          />
        </Box>
      </Box>
    )
  })
}
