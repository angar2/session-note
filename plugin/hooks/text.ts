// 띠·패널의 화면 문구 표 — 설치 때 고른 화면 언어(English·한국어)로 고른다 (spec UI.md 5절)

export type Lang = 'en' | 'ko'

const TEXT = {
  en: {
    notes: 'Notes',
    open: 'Open',
    close: 'Close',
    newItem: '+ New item',
    title: 'Title',
    details: 'Details',
    addOk: '[Add]',
    saveOk: '[Save]',
    cancel: '[Cancel]',
    edit: '[Edit]',
    del: '[Delete]',
    delOk: '[Confirm delete]',
    none: 'No open items',
    noDetails: 'No details',
    doneGroup: (n: number) => `Done ${n}`,
    more: (n: number) => `[Show more (${n})]`,
    submitAdd: 'Add',
    submitSave: 'Save',
    accept: '[Add]',
    dismiss: '[Dismiss]',
    complete: '[Complete]',
    notYet: '[Not yet]',
    view: 'View',
    pendingNew: (n: number) => `${n} new`,
    pendingDone: (n: number) => `${n} done`,
    command: 'Open the notes pane',
    saveFailed: "Couldn't save the note",
    unreadable: "Couldn't read the saved note; kept a copy",
  },
  ko: {
    notes: '노트',
    open: '열기',
    close: '닫기',
    newItem: '+ 새 항목',
    title: '제목',
    details: '내용',
    addOk: '[추가]',
    saveOk: '[저장]',
    cancel: '[취소]',
    edit: '[수정]',
    del: '[삭제]',
    delOk: '[삭제 확인]',
    none: '남은 항목이 없어요',
    noDetails: '내용 없음',
    doneGroup: (n: number) => `완료 ${n}`,
    more: (n: number) => `[더 보기 (${n})]`,
    submitAdd: '추가',
    submitSave: '저장',
    accept: '[추가]',
    dismiss: '[무시]',
    complete: '[완료]',
    notYet: '[아직]',
    view: '보기',
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

// userConfig language 값 → 문구. 모르는 값은 기본 English
export const langOf = (value: unknown): Lang => (value === '한국어' ? 'ko' : 'en')

export const textOf = (lang: Lang): Text => TEXT[lang]
