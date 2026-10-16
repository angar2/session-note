// 세션마다 노트 파일 하나를 읽고 쓴다 — 쓸 때마다 다시 읽고 변경만 얹는다 (spec DATA.md 3절)
import type { EngineInterface } from 'claude-code'

import { dataDir } from './data-dir'
import { emptyNote, formatNote, isEmpty, parseNote, type Note } from './note'

// 읽을 수 없으면 읽은 글(있으면)을 함께 돌려준다 — 사본을 남기는 데 쓴다
export type Loaded = { ok: true; note: Note } | { ok: false; path: string; reason: string; text?: string }

export async function notePath($: EngineInterface, sessionId: string): Promise<string> {
  return `${await dataDir($)}/sessions/${sessionId}.json`
}

// 파일이 없으면 빈 노트다. 읽을 수 없으면 실패를 알린다
export async function loadNote($: EngineInterface, path: string): Promise<Loaded> {
  if (!(await $.fs.exists(path))) return { ok: true, note: emptyNote() }
  let text: string
  try {
    text = await $.fs.read(path)
  } catch (error) {
    return { ok: false, path, reason: String(error) }
  }
  const parsed = parseNote(text)
  return parsed.ok ? parsed : { ok: false, path, reason: parsed.reason, text }
}

// 읽을 수 없는 파일의 사본을 같은 폴더에 <세션ID>.unreadable-<일시>.json으로 남긴다. 남긴 경로, 실패하면 null
export async function keepCopy($: EngineInterface, path: string, text: string, at: string): Promise<string | null> {
  const copy = `${path.replace(/\.json$/, '')}.unreadable-${at.slice(0, 19).replace(/[-:]/g, '')}.json`
  try {
    await $.fs.write(copy, text)
    return copy
  } catch {
    return null
  }
}

// 최신 파일 위에 change를 얹어 저장하고 결과 노트를 돌려준다. overwrite면 읽지 않고 빈 노트 위에 얹는다(사본을 남긴 원본 자리).
// 파일이 없고 결과도 비어 있으면 파일을 만들지 않는다. 읽기·쓰기 실패는 호출한 쪽으로 던진다
export async function saveNote(
  $: EngineInterface,
  path: string,
  change: (note: Note) => Note,
  overwrite = false,
): Promise<Note> {
  const loaded = overwrite ? { ok: true as const, note: emptyNote() } : await loadNote($, path)
  if (!loaded.ok) throw new Error(`cannot read ${path}: ${loaded.reason}`)
  const next = change(loaded.note)
  if (isEmpty(next) && !(await $.fs.exists(path))) return next
  await $.fs.write(path, formatNote(next))
  return next
}
