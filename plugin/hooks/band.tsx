// 입력창 위 띠 — 열린 항목 수와 패널 열기·닫기 (spec UI.md 1절)
import type { On } from 'claude-code'

import type { Text } from './text'
import { isPaneOpen, openItems, readNote, togglePane } from './view'

export function drawBand(on: On, text: Text) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text: T } = $.ui.resolve(e)
    const current = await readNote($)
    const count = openItems(current).length
    const isEmpty = count === 0 && current.proposals.length === 0
    const isOpen = await isPaneOpen($)
    return (
      <Box flexDirection="row" justifyContent="space-between" width={e.props.bodyColumns}>
        <Box key="count">
          {isEmpty ? (
            <T dimColor>{text.notes} 0</T>
          ) : (
            <T>
              {text.notes} <T bold>{String(count)}</T>
            </T>
          )}
        </Box>
        <Button
          key="toggle"
          plain
          label={isOpen ? text.close : text.open}
          onPress={() => void togglePane($, text.notes)}
        />
      </Box>
    )
  })
}
