// session-note 모드의 훅 모듈 진입점 — 세션의 노트를 열고 띠·패널·/note·노트 도구를 등록한다
import type { Register } from 'claude-code'

import { drawBand } from './band'
import { emptyNote } from './note'
import { drawPane } from './pane'
import { loadNote, notePath } from './store'
import { wholeNote } from './tell'
import { langOf, textOf } from './text'
import { registerTool, serveTool } from './tool'
import { PANE, openPane, paneClosed, readNote, showSession } from './view'

export const register: Register = (on, options) => {
  const text = textOf(langOf(options.language))

  // 세션 시작과 모드가 다시 켜질 때마다: /note·노트 도구 등록, 이 세션의 노트 읽기, 패널이 열려 있는지 맞추기
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'note', description: text.command })
    await registerTool($)
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

  // 대화가 압축된 직후 노트 전체를 한 번 전한다(spec AGENT.md 4절). 훅의 additionalContext로 넘겨야 압축 뒤에 놓인다
  // ($.session.append는 압축 경계보다 앞에 놓여 요약에 묻힌다 — 실제 세션에서 확인)
  on('classic.SessionStart', async ($, e, next) => {
    const answered = await next(e)
    if (e.source !== 'compact') return answered
    return { ...answered, additionalContext: [...(answered.additionalContext ?? []), wholeNote(await readNote($))] }
  })

  serveTool(on)
  drawBand(on, text)
  drawPane(on, text)
}
