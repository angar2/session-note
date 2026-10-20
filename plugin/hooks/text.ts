// 띠·패널의 화면 문구 표 — 설치 때 고른 화면 언어(English·한국어)로 고른다 (spec UI.md 5절)

export type Lang = 'en' | 'ko'

const TEXT = {
  en: {
    notes: 'Notes',
    todo: 'To do',
    process: 'Process',
    others: (n: number) => `+${n} more`,
    pausedAt: (number: string) => `paused at ${number}`,
    finished: (n: number) => `Finished ${n}`,
    noProcesses: 'No open processes',
    open: 'Open',
    close: 'Close',
    newItem: '+ New item',
    title: 'Title',
    details: 'Details',
    addOk: 'Add',
    saveOk: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    del: 'Delete',
    delOk: 'Confirm delete',
    none: 'No open items',
    noDetails: '(No details)',
    doneGroup: (n: number) => `Done ${n}`,
    more: (n: number) => `Show more (${n})`,
    submitAdd: 'Add',
    submitSave: 'Save',
    accept: 'Add',
    dismiss: 'Dismiss',
    complete: 'Complete',
    notYet: 'Not yet',
    pendingNew: (n: number) => `${n} new`,
    pendingDone: (n: number) => `${n} done`,
    command: 'Open the notes pane',
    saveFailed: "Couldn't save the note",
    unreadable: "Couldn't read the saved note; kept a copy",
  },
  ko: {
    notes: '노트',
    todo: '할 일',
    process: '과정',
    others: (n: number) => `외 ${n}`,
    pausedAt: (number: string) => `${number}에서 멈춤`,
    finished: (n: number) => `끝난 과정 ${n}`,
    noProcesses: '남은 과정이 없어요',
    open: '열기',
    close: '닫기',
    newItem: '+ 새 항목',
    title: '제목',
    details: '내용',
    addOk: '추가',
    saveOk: '저장',
    cancel: '취소',
    edit: '수정',
    del: '삭제',
    delOk: '삭제 확인',
    none: '남은 항목이 없어요',
    noDetails: '(내용 없음)',
    doneGroup: (n: number) => `완료 ${n}`,
    more: (n: number) => `더 보기 (${n})`,
    submitAdd: '추가',
    submitSave: '저장',
    accept: '추가',
    dismiss: '무시',
    complete: '완료',
    notYet: '아직',
    pendingNew: (n: number) => `새 항목 ${n}`,
    pendingDone: (n: number) => `끝난 항목 ${n}`,
    command: '노트 패널을 열어요',
    saveFailed: '노트를 저장하지 못했어요',
    unreadable: '저장된 노트를 읽지 못해 사본을 남겼어요',
  },
}

export type Text = (typeof TEXT)['en']

// 제안 종류 표시 — 언어와 상관없이 새 항목 제안은 파란 [+], 완료 제안은 초록 [✓] (테마 키)
export const MARK = {
  new: { label: '[+]', color: 'suggestion' },
  done: { label: '[✓]', color: 'success' },
} as const

// 띠·탭의 이름표 기호 — 할 일 ☑, 과정 ≡ (이름표와 같은 회색)
export const LABEL = { todo: '☑', process: '≡' } as const

// 띠의 흐린 구분선 — 할 일 개수와 제안 사이, 과정 기호와 지금 단계 사이
export const DIVIDER = ' │ '

// 단계·과정의 상태 네모 — 대기 ◻, 진행 중·완료·중단 ◼에 파랑·초록·빨강 (테마 키)
export const SQUARE = {
  waiting: { label: '◻', color: undefined },
  active: { label: '◼', color: 'suggestion' },
  done: { label: '◼', color: 'success' },
  stopped: { label: '◼', color: 'error' },
} as const

// 글자의 터미널 칸 수 — 한글·한자·전각·그림 글자는 두 칸, 그 밖은 한 칸
const isWide = (code: number) =>
  (code >= 0x1100 && code <= 0x115f) ||
  (code >= 0x2e80 && code <= 0xa4cf) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xfe30 && code <= 0xfe4f) ||
  (code >= 0xff00 && code <= 0xff60) ||
  (code >= 0xffe0 && code <= 0xffe6) ||
  (code >= 0x1f300 && code <= 0x1faff) ||
  (code >= 0x20000 && code <= 0x3fffd)

export const cellsOf = (line: string) => [...line].reduce((n, ch) => n + (isWide(ch.codePointAt(0) ?? 0) ? 2 : 1), 0)

// cells 칸 안에 들어가게 끝을 …로 줄인다
export function cut(line: string, cells: number): string {
  if (cellsOf(line) <= cells) return line
  let kept = ''
  for (const ch of line) {
    if (cellsOf(kept + ch) > cells - 1) break
    kept += ch
  }
  return `${kept.trimEnd()}…`
}

// 동작 버튼 — 두 화면 모두 글자 버튼이고, 터미널만 [이름]으로 감싼다
export function buttonLook(surface: string, label: string) {
  return { plain: true as const, label: surface === 'terminal' ? `[${label}]` : label }
}

// userConfig language 값 → 문구. 모르는 값은 기본 English
export const langOf = (value: unknown): Lang => (value === '한국어' ? 'ko' : 'en')

export const textOf = (lang: Lang): Text => TEXT[lang]

// userConfig bandBackground 값 → 띠 배경 테마 키. None·모르는 값은 배경 없음 (spec UI.md 1절)
const BACKGROUND = { Gray: 'subtle', Olive: 'diffAddedDimmed', Wine: 'diffRemovedDimmed' } as const

export const backgroundOf = (value: unknown) =>
  typeof value === 'string' && Object.hasOwn(BACKGROUND, value)
    ? BACKGROUND[value as keyof typeof BACKGROUND]
    : undefined
