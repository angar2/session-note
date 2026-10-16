// session-note 모드의 훅 모듈 진입점 — 세션의 노트를 열고 띠·패널·/note를 등록한다
import type { Register } from 'claude-code'

import { drawBand } from './band'
import { emptyNote } from './note'
import { drawPane } from './pane'
import { loadNote, notePath } from './store'
import { langOf, textOf } from './text'
import { PANE, openPane, paneClosed, showSession } from './view'

export const register: Register = (on, options) => {
  const text = textOf(langOf(options.language))

  // 세션 시작과 모드가 다시 켜질 때마다: /note 등록, 이 세션의 노트 읽기, 패널이 열려 있는지 맞추기
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'note', description: text.command })
    const id = await $.session.id()
    const path = await notePath($, id)
    const loaded = await loadNote($, path)
    await showSession($, { id, path }, loaded.ok ? loaded.note : emptyNote())
    return next(e)
  })

  // /note — 패널을 열고 대화창에 줄을 남기지 않는다
  on('command.run', { command: 'note' }, async $ => {
    await openPane($, text.notes)
    return {}
  })

  // 패널이 닫히면(띠의 닫기·엔진의 닫기 표시) 초안을 버린다
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await paneClosed($)
    return closed
  })

  drawBand(on, text)
  drawPane(on, text)
}
