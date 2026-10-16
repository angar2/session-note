// session-note 모드의 훅 모듈 진입점 — 세션의 노트를 열고 띠·패널·/note·노트 도구를 등록한다
import type { EngineInterface, Register } from 'claude-code'

import { drawBand } from './band'
import { drawPane } from './pane'
import { arrival, wholeNote } from './tell'
import { langOf, textOf, type Text } from './text'
import { registerTool, serveTool } from './tool'
import { PANE, openPane, openSession, paneClosed, readNote } from './view'

export const register: Register = (on, options) => {
  const text = textOf(langOf(options.language))

  // 세션 시작과 모드가 다시 켜질 때마다: /note·노트 도구 등록, 이 세션의 노트 읽기, 패널이 열려 있는지 맞추기
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'note', description: text.command })
    await registerTool($)
    await openSession($, text, await $.session.id())
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

  // 세션이 바뀌면(/clear·/resume·--fork-session) 그 세션의 노트로 갈아끼우고, 불러온 세션과 압축 직후에는 노트를 전한다(spec AGENT.md 4·5절).
  // 훅의 additionalContext로 넘겨야 압축·불러온 대화 뒤에 놓인다($.session.append는 압축 경계보다 앞에 놓인다 — 실제 세션에서 확인)
  on('classic.SessionStart', async ($, e, next) => {
    const answered = await next(e)
    const told = await switchTo($, text, e.source, e.session_id)
    if (told === null) return answered
    return { ...answered, additionalContext: [...(answered.additionalContext ?? []), told] }
  })

  serveTool(on)
  drawBand(on, text)
  drawPane(on, text)
}

// 세션 전환·압축 때 세션에 전할 글, 없으면 null
async function switchTo($: EngineInterface, text: Text, source: string, id: string): Promise<string | null> {
  if (source === 'compact') return wholeNote(await readNote($))
  if (source !== 'clear' && source !== 'resume' && source !== 'fork') return null
  const shown = await openSession($, text, id)
  return source === 'clear' ? null : arrival(shown)
}
