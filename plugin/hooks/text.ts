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
    command: 'Open the notes pane',
    saveFailed: "Couldn't save the note",
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
    command: '노트 패널을 열어요',
    saveFailed: '노트를 저장하지 못했어요',
  },
}

export type Text = (typeof TEXT)['en']

// userConfig language 값 → 문구. 모르는 값은 기본 English
export const langOf = (value: unknown): Lang => (value === '한국어' ? 'ko' : 'en')

export const textOf = (lang: Lang): Text => TEXT[lang]
