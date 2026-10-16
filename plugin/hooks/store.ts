// 세션마다 노트 파일 하나를 읽고 쓴다 — 쓸 때마다 다시 읽고 변경만 얹는다 (spec DATA.md 3절)
import type { EngineInterface } from 'claude-code'

import { dataDir } from './data-dir'
import { emptyNote, formatNote, isEmpty, parseNote, type Note } from './note'

export type Loaded = { ok: true; note: Note } | { ok: false; path: string; reason: string }

export const notePath = async ($: EngineInterface, sessionId: string) =>
  `${await dataDir($)}/sessions/${sessionId}.json`

// 파일이 없으면 빈 노트다. 읽을 수 없으면 실패를 알린다(사본 남기기는 TASK-004)
export async function loadNote($: EngineInterface, path: string): Promise<Loaded> {
  if (!(await $.fs.exists(path))) return { ok: true, note: emptyNote() }
  let text: string
  try {
    text = await $.fs.read(path)
  } catch (error) {
    return { ok: false, path, reason: String(error) }
  }
  const parsed = parseNote(text)
  return parsed.ok ? parsed : { ok: false, path, reason: parsed.reason }
}

// 최신 파일 위에 change를 얹어 저장하고 결과 노트를 돌려준다.
// 파일이 없고 결과도 비어 있으면 파일을 만들지 않는다. 읽기·쓰기 실패는 호출한 쪽으로 던진다
export async function saveNote($: EngineInterface, path: string, change: (note: Note) => Note): Promise<Note> {
  const loaded = await loadNote($, path)
  if (!loaded.ok) throw new Error(`cannot read ${path}: ${loaded.reason}`)
  const next = change(loaded.note)
  if (isEmpty(next) && !(await $.fs.exists(path))) return next
  await $.fs.write(path, formatNote(next))
  return next
}
