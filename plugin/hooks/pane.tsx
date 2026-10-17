// 오른쪽 노트 패널 — 세션의 제안·열린 항목·새 항목·완료 묶음과 펼침·수정·삭제 (spec UI.md 2·3절)
import type { EngineInterface, On, RenderChildren } from 'claude-code'

import type { Item } from './note'
import { MARK, buttonLook } from './text'
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
    // 구분선 — 넉넉히 그리고 한 줄로 잘라 데스크톱에서도 패널 끝까지 닿게 한다
    const rule = (
      <Box height={1} overflow="hidden">
        <T dimColor>{'─'.repeat(Math.max(1, e.props.bodyColumns) * 4)}</T>
      </Box>
    )

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
      // 체크 칸 옆 세로 묶음 — 제목·내용·입력 칸·버튼을 제목 시작 위치에 맞춘다
      const beside = (...children: RenderChildren[]) => (
        <Box key={`row-${item.id}`} flexDirection="row" gap={1} alignItems="flex-start">
          {check}
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            {children}
          </Box>
        </Box>
      )
      if (editing !== null) {
        const [title, body] = fields('edit', editing)
        return [
          beside(
            title,
            body,
            <Box flexDirection="row" gap={1} justifyContent="flex-end">
              <Button
                key="edit-ok"
                {...buttonLook(e.surface, text.saveOk)}
                onPress={() => void saveFromView($, text)}
              />
              <Button
                key="edit-cancel"
                dimColor
                {...buttonLook(e.surface, text.cancel)}
                onPress={() => void setView($, v => ({ ...v, editing: null }))}
              />
            </Box>,
          ),
        ]
      }
      // 제목만 누르면 펼치고 접는다
      const head = (
        <Box flexDirection="row">
          <Button key={`title-${item.id}`} plain onPress={() => void toggleOpen($, item.id)}>
            <T wrap="wrap">{item.title}</T>
            {item.source === 'user' ? <T dimColor> ☺</T> : ''}
          </Button>
        </Box>
      )
      if (!isOpen) return [beside(head)]
      const actions =
        view.armedId === item.id ? (
          <Box flexDirection="row" gap={1}>
            <Button
              key={`delete-ok-${item.id}`}
              {...buttonLook(e.surface, text.delOk)}
              onPress={() => void removeItem($, text, item.id)}
            />
            <Button
              key="delete-cancel"
              dimColor
              {...buttonLook(e.surface, text.cancel)}
              onPress={() => void setView($, v => ({ ...v, armedId: null }))}
            />
          </Box>
        ) : (
          <Box flexDirection="row" gap={1}>
            {Input !== null && (
              <Button
                key={`edit-${item.id}`}
                dimColor
                {...buttonLook(e.surface, text.edit)}
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
              dimColor
              {...buttonLook(e.surface, text.del)}
              onPress={() => void setView($, v => ({ ...v, armedId: item.id }))}
            />
          </Box>
        )
      return [
        beside(
          head,
          <T dimColor wrap="wrap">
            {item.body === '' ? text.noDetails : item.body}
          </T>,
          <Box flexDirection="row" justifyContent="space-between" alignItems="flex-start">
            <T dimColor>{shortTime(item.createdAt)}</T>
            {actions}
          </Box>,
        ),
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
              <Box flexDirection="row" gap={1} justifyContent="flex-end">
                <Button
                  key="add-ok"
                  {...buttonLook(e.surface, text.addOk)}
                  onPress={() => void addFromView($, text)}
                />
                <Button
                  key="add-cancel"
                  dimColor
                  {...buttonLook(e.surface, text.cancel)}
                  onPress={() => void setView($, v => ({ ...v, adding: null }))}
                />
              </Box>,
            ]

    const shownDone = view.showAll ? done : done.slice(0, SHOWN_DONE)
    const doneRows =
      done.length === 0
        ? []
        : [
            <Button
              key="done-group"
              plain
              dimColor
              label={`${text.doneGroup(done.length)} ${view.showDone ? '▾' : '▸'}`}
              onPress={() =>
                void setView($, v => ({ ...v, showDone: !v.showDone, showAll: v.showDone ? false : v.showAll }))
              }
            />,
            ...(view.showDone ? shownDone.flatMap(row) : []),
            ...(view.showDone && !view.showAll && done.length > SHOWN_DONE
              ? [
                  <Box paddingLeft={2}>
                    <Button
                      key="more"
                      dimColor
                      {...buttonLook(e.surface, text.more(done.length - SHOWN_DONE))}
                      onPress={() => void setView($, v => ({ ...v, showAll: true }))}
                    />
                  </Box>,
                ]
              : []),
          ]

    // 맨 위의 제안 — 띠와 같은 표시와 버튼으로 하나씩. 제목을 누르면 내용(완료 제안은 그 항목의 내용)을 펼친다
    const proposalRows = liveProposals(current).flatMap(p => {
      const target = p.kind === 'done' ? current.items.find(item => item.id === p.itemId) : undefined
      const body = p.kind === 'new' ? p.body : (target?.body ?? '')
      const detail = view.openId === p.id ? (
        <T dimColor wrap="wrap">
          {body === '' ? text.noDetails : body}
        </T>
      ) : null
      return [
        <Box
          key={`proposal-${p.id}`}
          flexDirection="row"
          justifyContent="space-between"
          alignItems="flex-start"
          gap={2}
        >
          <Box flexDirection="row" gap={2} flexShrink={1} minWidth={0} alignItems="flex-start">
            <Box flexShrink={0} width={3}>
              <T color={MARK[p.kind].color}>{MARK[p.kind].label}</T>
            </Box>
            <Box flexDirection="column" flexShrink={1} minWidth={0}>
              <Box flexDirection="row">
                <Button key={`ptitle-${p.id}`} plain onPress={() => void toggleOpen($, p.id)}>
                  <T wrap="wrap">{p.kind === 'new' ? p.title : (target?.title ?? '')}</T>
                </Button>
              </Box>
              {detail}
            </Box>
          </Box>
          <Box flexDirection="row" gap={1} flexShrink={0}>
            <Button
              key={`accept-${p.id}`}
              {...buttonLook(e.surface, p.kind === 'new' ? text.accept : text.complete)}
              onPress={() => void acceptProposal($, text, p.id)}
            />
            <Button
              key={`dismiss-${p.id}`}
              dimColor
              {...buttonLook(e.surface, p.kind === 'new' ? text.dismiss : text.notYet)}
              onPress={() => void dismissProposal($, text, p.id)}
            />
          </Box>
        </Box>,
      ]
    })

    // 제목은 터미널에서만 본문에 쓴다 — 데스크톱은 머리말에 제목이 있다
    return (
      <Box flexDirection="column" width={e.props.bodyColumns} gap={1}>
        {e.surface === 'terminal' ? <T bold>{text.notes}</T> : null}
        {proposalRows.length === 0 ? null : (
          <Box flexDirection="column">
            {proposalRows}
            {rule}
          </Box>
        )}
        <Box flexDirection="column">
          {open.length === 0 ? <T dimColor>{text.none}</T> : open.flatMap(row)}
          {rule}
          {addRows}
        </Box>
        {doneRows.length === 0 ? null : <Box flexDirection="column">{doneRows}</Box>}
      </Box>
    )
  })
}

// 항목·제안의 제목을 누르면 펼치고, 다시 누르거나 다른 것을 펼치면 접는다. 접을 때 그 항목의 수정 초안과 삭제 확인은 버린다
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
