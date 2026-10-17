// session-note의 타입 계약 — 노트·항목·제안의 형식(spec DATA.md 2절)과 띠·패널이 그리는 상태 값($.state)

export type ItemSource = 'proposal' | 'user' | 'instruction' | 'auto'

export type Item = {
  id: string
  title: string
  body: string
  source: ItemSource
  status: 'open' | 'done'
  createdAt: string
  doneAt: string | null
}

export type Proposal =
  | { id: string; kind: 'new'; title: string; body: string; proposedAt: string }
  | { id: string; kind: 'done'; itemId: string; proposedAt: string }

export type Note = { version: 1; items: Item[]; proposals: Proposal[] }

export type Draft = { title: string; body: string }

// 패널의 펼침·초안 상태. load가 지금 모듈의 것이 아니면(모드가 다시 켜짐) 초안을 버린 것으로 본다
export type View = {
  load: string
  openId: string | null
  armedId: string | null
  showDone: boolean
  showAll: boolean
  adding: Draft | null
  editing: (Draft & { id: string }) | null
  // 수정 칸 key에 붙는 값. 엔진은 칸의 Enter 뒤 칸 글자를 비우고, 같은 key에 같은 value를 다시 그리면 비운 글자를 둔다 — 수정을 저장할 때마다 바꿔 다시 연 칸을 새 칸으로 그린다
  editKey: string
}

// overwrite: 그 자리의 파일을 읽을 수 없어 사본을 남겼다 — 다음 저장은 원본 자리에 새 노트로 쓴다
export type Opened = { id: string; path: string; overwrite: boolean } | null

declare module 'claude-code' {
  interface PluginState {
    'session-note': { session: Opened; note: Note; paneOpen: boolean; view: View }
  }
}
