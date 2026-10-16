// 노트 파일 읽기·쓰기 규칙(없는 파일·첫 내용 때 생성·다시 읽고 얹기·깨진 파일·쓰기 실패)을 확인한다
import { expect, test } from 'claude-code/testing'

import { emptyNote, formatNote, isoAt, parseNote, type Item, type Note } from '../hooks/note'
import { loadNote, saveNote } from '../hooks/store'
import { fakeEngine } from './fake-engine'

const PATH = '/data/sessions/s1.json'

const item = (id: string, title: string): Item => ({
  id,
  title,
  body: '',
  source: 'user',
  status: 'open',
  createdAt: '2026-10-16T09:00:00+09:00',
  doneAt: null,
})

const withItems = (...items: Item[]): Note => ({ ...emptyNote(), items })

test('a missing file is an empty note', async () => {
  const { $ } = fakeEngine({})
  expect(await loadNote($, PATH)).toEqual({ ok: true, note: emptyNote() })
})

test('nothing is written while the note stays empty', async () => {
  const { $, writes } = fakeEngine({})
  await saveNote($, PATH, note => note)
  expect(writes).toEqual([])
})

test('the first item creates the file', async () => {
  const { $, files } = fakeEngine({})
  await saveNote($, PATH, note => ({ ...note, items: [item('a', 'Check token expiry')] }))
  expect(parseNote(files.get(PATH) ?? '')).toEqual({ ok: true, note: withItems(item('a', 'Check token expiry')) })
})

test('a save lays its change over what the file holds now', async () => {
  const { $, files } = fakeEngine({ files: { [PATH]: formatNote(withItems(item('a', 'First'))) } })
  files.set(PATH, formatNote(withItems(item('a', 'First'), item('b', 'Written elsewhere'))))
  await saveNote($, PATH, note => ({ ...note, items: [...note.items, item('c', 'Mine')] }))
  const saved = parseNote(files.get(PATH) ?? '')
  expect(saved.ok && saved.note.items.map(one => one.id)).toEqual(['a', 'b', 'c'])
})

test('an emptied note that has a file is still written', async () => {
  const { $, files } = fakeEngine({ files: { [PATH]: formatNote(withItems(item('a', 'Only'))) } })
  await saveNote($, PATH, note => ({ ...note, items: [] }))
  expect(parseNote(files.get(PATH) ?? '')).toEqual({ ok: true, note: emptyNote() })
})

test('a broken file or an unknown version is reported, not overwritten', async () => {
  const broken = fakeEngine({ files: { [PATH]: '{ not json' } })
  expect((await loadNote(broken.$, PATH)).ok).toBe(false)
  await expect(saveNote(broken.$, PATH, note => note)).rejects.toThrow()
  expect(broken.files.get(PATH)).toBe('{ not json')
  const future = fakeEngine({ files: { [PATH]: JSON.stringify({ version: 2, items: [], proposals: [] }) } })
  expect(await loadNote(future.$, PATH)).toEqual({ ok: false, path: PATH, reason: 'unknown version 2' })
})

test('a failed write reaches the caller', async () => {
  const { $ } = fakeEngine({ failWrite: true })
  await expect(saveNote($, PATH, () => withItems(item('a', 'x')))).rejects.toThrow()
})

test('times carry the local offset', () => {
  expect(isoAt(Date.UTC(2026, 9, 16, 0, 0, 0))).toMatch(/^2026-10-1[56]T\d\d:\d\d:\d\d[+-]\d\d:\d\d$/)
})
