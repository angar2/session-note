// 입력창 위 띠 — 열린 항목 수, 세션의 제안(하나면 그 제안과 버튼, 여럿이면 개수와 보기), 패널 열기·닫기 (spec UI.md 1절)
import type { On } from 'claude-code'

import { MARK, buttonLook } from './text'
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
    const toggle = (label: string) => (
      <Button
        key="toggle"
        plain
        label={isOpen ? text.close : label}
        onPress={() => void togglePane($, text.notes, isOpen)}
      />
    )

    // 제안이 하나면 그 제목과 받기·무시 버튼, 여럿이면 개수와 보기. 받기·무시 뒤에는 그 자리에 남는 열기 버튼으로 커서를 옮긴다
    const only = proposals.length === 1 ? proposals[0] : undefined
    const titleOf = (itemId: string) => current.items.find(item => item.id === itemId)?.title ?? ''
    const mark = (kind: 'new' | 'done') => <T color={MARK[kind].color}>{MARK[kind].label}</T>
    const fresh = proposals.filter(p => p.kind === 'new').length
    const finished = proposals.length - fresh
    const pending =
      proposals.length === 0 ? null : only === undefined ? (
        <T wrap="truncate-end">
          {fresh > 0 ? mark('new') : ''}
          {fresh > 0 ? <T dimColor> {text.pendingNew(fresh)}</T> : ''}
          {fresh > 0 && finished > 0 ? <T dimColor>{' · '}</T> : ''}
          {finished > 0 ? mark('done') : ''}
          {finished > 0 ? <T dimColor> {text.pendingDone(finished)}</T> : ''}
        </T>
      ) : (
        <T wrap="truncate-end">
          {mark(only.kind)}
          {'  '}
          {only.kind === 'new' ? only.title : titleOf(only.itemId)}
        </T>
      )
    const actions =
      only === undefined ? (
        toggle(proposals.length === 0 ? text.open : text.view)
      ) : (
        <Box flexDirection="row" gap={1} flexShrink={0}>
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
              <T dimColor>{text.notes} 0</T>
            ) : (
              <T>
                {text.notes} <T bold>{String(count)}</T>
              </T>
            )}
          </Box>
          {pending === null ? null : (
            <Box key="pending" flexShrink={1} minWidth={0}>
              <T dimColor>{'  │  '}</T>
              {pending}
            </Box>
          )}
        </Box>
        {actions}
      </Box>
    )
  })
}
