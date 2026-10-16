// 오른쪽 노트 패널 — 세션의 제안·열린 항목·새 항목·완료 묶음과 펼침·수정·삭제 (spec UI.md 2·3절)
import type { EngineInterface, On } from 'claude-code'

import type { Item } from './note'
import type { Text } from './text'
import {
  PANE,
  acceptProposal,
  addItem,
  dismissProposal,
  doneItems,
  liveProposals,
  readNote,
  openItems,
  readView,
  removeItem,
  saveEdit,
  setView,
  toggleDone,
  type Draft,
} from './view'

const SHOWN_DONE = 5

// 2026-10-16T14:05:00+09:00 → 2026-10-16 14:05 (쓴 곳의 현지 시각 그대로)
const shortTime = (iso: string) => iso.slice(0, 16).replace('T', ' ')

export function drawPane(on: On, text: Text) {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text: T } = elements
    // 입력칸이 없는 화면(모바일)에서는 보기와 체크만 한다
    const Input = 'Input' in elements ? elements.Input : null
    const current = await readNote($)
    const view = await readView($)
    const open = openItems(current)
    const done = doneItems(current)
    const rule = <T dimColor>{'─'.repeat(Math.max(1, e.props.bodyColumns))}</T>

    // 새 항목·수정의 제목·내용 칸. 친 글은 그 칸 값만 상태에 쓰고, Enter는 상태의 초안 전체로 저장한다
    const fields = (kind: 'add' | 'edit', draft: Draft) =>
      Input === null
        ? []
        : (['title', 'body'] as const).map(field => (
            <Input
              key={`${kind}-${field}`}
              placeholder={field === 'title' ? text.title : text.details}
              value={draft[field]}
              submitLabel={kind === 'add' ? text.submitAdd : text.submitSave}
              onInput={(value: string) => void setDraft($, kind, field, value)}
              onSubmit={(value: string) =>
                void setDraft($, kind, field, value).then(() =>
                  kind === 'add' ? addFromView($, text) : saveFromView($, text),
                )
              }
            />
          ))

    const row = (item: Item) => {
      const isDone = item.status === 'done'
      const isOpen = view.openId === item.id
      const editing = view.editing?.id === item.id ? view.editing : null
      const check = (
        <Button
          key={`check-${item.id}`}
          plain
          dimColor
          label={isDone ? '☑' : '☐'}
          onPress={() => void toggleDone($, text, item.id)}
        />
      )
      if (editing !== null) {
        const [title, body] = fields('edit', editing)
        return [
          <Box key={`row-${item.id}`} flexDirection="row" gap={1}>
            {check}
            {title}
          </Box>,
          <Box key={`edit-${item.id}`} flexDirection="column" paddingLeft={2}>
            {body}
            <Box flexDirection="row" gap={1}>
              <Button key="edit-ok" plain dimColor label={text.saveOk} onPress={() => void saveFromView($, text)} />
              <Button
                key="edit-cancel"
                plain
                dimColor
                label={text.cancel}
                onPress={() => void setView($, v => ({ ...v, editing: null }))}
              />
            </Box>
          </Box>,
        ]
      }
      const head = (
        <Box key={`row-${item.id}`} flexDirection="row" gap={1}>
          {check}
          <Button key={`title-${item.id}`} plain dimColor={isDone} onPress={() => void toggleOpen($, item.id)}>
            {item.title}
            {item.source === 'user' ? <T dimColor> ☺</T> : ''}
          </Button>
        </Box>
      )
      if (!isOpen) return [head]
      const actions =
        view.armedId === item.id ? (
          <Box flexDirection="row" gap={1}>
            <Button key={`delete-ok-${item.id}`} plain onPress={() => void removeItem($, text, item.id)}>
              <T color="error">{text.delOk}</T>
            </Button>
            <Button
              key="delete-cancel"
              plain
              dimColor
              label={text.cancel}
              onPress={() => void setView($, v => ({ ...v, armedId: null }))}
            />
          </Box>
        ) : (
          <Box flexDirection="row" gap={1}>
            {Input !== null && (
              <Button
                key={`edit-${item.id}`}
                plain
                dimColor
                label={text.edit}
                onPress={() =>
                  void setView($, v => ({
                    ...v,
                    adding: null,
                    armedId: null,
                    editing: { id: item.id, title: item.title, body: item.body },
                  }))
                }
              />
            )}
            <Button
              key={`delete-${item.id}`}
              plain
              dimColor
              label={text.del}
              onPress={() => void setView($, v => ({ ...v, armedId: item.id }))}
            />
          </Box>
        )
      return [
        head,
        <Box key={`detail-${item.id}`} flexDirection="column" paddingLeft={2}>
          {item.body === '' ? <T dimColor>{text.noDetails}</T> : <T dimColor>{item.body}</T>}
          <Box flexDirection="row" justifyContent="space-between">
            <T dimColor>{shortTime(item.createdAt)}</T>
            {actions}
          </Box>
        </Box>,
      ]
    }

    const adding = view.adding
    const addRows =
      Input === null
        ? []
        : adding === null
          ? [
              <Button
                key="add"
                plain
                dimColor
                label={text.newItem}
                onPress={() =>
                  void setView($, v => ({ ...v, editing: null, armedId: null, adding: { title: '', body: '' } }))
                }
              />,
            ]
          : [
              ...fields('add', adding),
              <Box flexDirection="row" gap={1}>
                <Button key="add-ok" plain dimColor label={text.addOk} onPress={() => void addFromView($, text)} />
                <Button
                  key="add-cancel"
                  plain
                  dimColor
                  label={text.cancel}
                  onPress={() => void setView($, v => ({ ...v, adding: null }))}
                />
              </Box>,
            ]

    const shownDone = view.showAll ? done : done.slice(0, SHOWN_DONE)
    const doneRows =
      done.length === 0
        ? []
        : [
            <Box marginTop={1}>
              <Button
                key="done-group"
                plain
                dimColor
                label={`${text.doneGroup(done.length)} ${view.showDone ? '▾' : '▸'}`}
                onPress={() =>
                  void setView($, v => ({ ...v, showDone: !v.showDone, showAll: v.showDone ? false : v.showAll }))
                }
              />
            </Box>,
            ...(view.showDone ? shownDone.flatMap(row) : []),
            ...(view.showDone && !view.showAll && done.length > SHOWN_DONE
              ? [
                  <Box paddingLeft={2}>
                    <Button
                      key="more"
                      plain
                      dimColor
                      label={text.more(done.length - SHOWN_DONE)}
                      onPress={() => void setView($, v => ({ ...v, showAll: true }))}
                    />
                  </Box>,
                ]
              : []),
          ]

    // 맨 위의 제안 — 띠와 같은 문구와 버튼으로 하나씩
    const proposalRows = liveProposals(current).map(p => (
      <Box key={`proposal-${p.id}`} flexDirection="row" justifyContent="space-between">
        <Box flexShrink={1}>
          <T wrap="truncate-end">
            <T dimColor>{p.kind === 'new' ? text.newLabel : text.doneLabel}</T>
            {'  '}
            {p.kind === 'new' ? p.title : (current.items.find(item => item.id === p.itemId)?.title ?? '')}
          </T>
        </Box>
        <Box flexDirection="row" gap={2} flexShrink={0}>
          <Button key={`accept-${p.id}`} plain onPress={() => void acceptProposal($, text, p.id)}>
            <T color="claude">{p.kind === 'new' ? text.accept : text.complete}</T>
          </Button>
          <Button
            key={`dismiss-${p.id}`}
            plain
            dimColor
            label={p.kind === 'new' ? text.dismiss : text.notYet}
            onPress={() => void dismissProposal($, text, p.id)}
          />
        </Box>
      </Box>
    ))

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <T bold>{text.notes}</T>
        {proposalRows.length === 0 ? null : (
          <Box marginTop={1} flexDirection="column">
            {proposalRows}
          </Box>
        )}
        <Box marginTop={1} flexDirection="column">
          {open.length === 0 ? <T dimColor>{text.none}</T> : open.flatMap(row)}
        </Box>
        {rule}
        {addRows}
        {doneRows}
      </Box>
    )
  })
}

// 제목을 누르면 펼치고, 다시 누르거나 다른 항목을 펼치면 접는다. 접을 때 그 항목의 수정 초안과 삭제 확인은 버린다
async function toggleOpen($: EngineInterface, id: string) {
  await setView($, v =>
    v.openId === id
      ? { ...v, openId: null, editing: null, armedId: null }
      : { ...v, openId: id, editing: null, armedId: null },
  )
}

// 초안의 한 칸만 바꾼다(그사이 다른 칸에 친 글을 덮지 않는다)
async function setDraft($: EngineInterface, kind: 'add' | 'edit', field: keyof Draft, value: string) {
  await setView($, v => {
    if (kind === 'add') return v.adding === null ? v : { ...v, adding: { ...v.adding, [field]: value } }
    return v.editing === null ? v : { ...v, editing: { ...v.editing, [field]: value } }
  })
}

// [추가]·[저장]·칸의 Enter는 지금까지 친 초안을 쓴다
async function addFromView($: EngineInterface, text: Text) {
  const view = await readView($)
  if (view.adding !== null) await addItem($, text, view.adding)
}

async function saveFromView($: EngineInterface, text: Text) {
  const view = await readView($)
  if (view.editing !== null) await saveEdit($, text, view.editing.id, view.editing)
}
