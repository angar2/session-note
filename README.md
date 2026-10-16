# session-note

A note for each Claude Code session: you and the agent jot down what to do or check, and tick it off together.

[한국어](README.ko.md)

Long sessions bury things. "Let's check that later", "is this right?", a follow-up you meant to do — they scroll away and are gone. session-note keeps a small to-do note next to the prompt for every session. You can write in it, the agent can propose items for it, and both of you can mark them done.

```
 Notes 2  │  New  Check token expiry handling                          Add   Dismiss
❯ _
```

## What you see

- **The band** — one line above the prompt. `Notes 2` is the number of open items. `Open` opens the side pane.
  When the agent proposes something, the band shows it with buttons:

  | The agent proposes | The band shows |
  |---|---|
  | a new item | `New  <title>   Add  Dismiss` |
  | that an open item is done | `Done  <title>   Complete  Not yet` |
  | several things | `2 new · 1 done   View` (opens the pane) |

- **The pane** — on the right side of the terminal (above the prompt in a narrow window). From the top: waiting proposals, open items, `+ New item`, and the done group (`Done N ▸`, the five most recent, then `[Show more (N)]`).
  - Click `☐` to complete an item, `☑` to bring it back.
  - Click a title to expand it: its details, when it was added, `[Edit]` and `[Delete]` (delete asks once more).
  - Items you wrote yourself are marked with `☺`.
- **`/note`** — opens the pane without leaving a line in the conversation.

Everything is done with the mouse; the keyboard is only for typing a title and details (Enter saves).

## How the agent uses it

The agent gets one tool, `note`, and follows fixed rules written in the tool's description:

- **It proposes, it does not decide.** Only things the conversation put off for later and questions left open become proposals. Work it is doing right now, details it may decide itself and the steps of its own plan do not. It never asks "shall I add this to the note?" — the proposal just waits on the band until you add or dismiss it.
- **It checks when work is finished.** After finishing a piece of work, or when you say "check the note", it compares open items with what was done and proposes the finished ones as done. It never completes an item unless you tell it to.
- **When you tell it, it acts.** "Put this in the note" adds an item, "that one is done" completes it.
- **It always knows the latest note.** When you change something in the pane, only that change is passed to the agent (you do not see it). After the conversation is compacted, and when you come back with `/resume`, the whole note is passed once. Nothing is added to every turn, so the note does not make the session heavier.

## Install

Inside Claude Code:

```
/plugin marketplace add angar2/session-note
/plugin install session-note@angar2
```

Or from a shell:

```sh
claude plugin marketplace add angar2/session-note
claude plugin install session-note@angar2
```

The first command registers this repository as a plugin source; the second installs the plugin for your user, in every session.

The screen language is **English** (default) or **한국어**. `/plugin install` asks for it; from a shell, add `--config language=한국어` for Korean. Change it any time with `/plugin configure session-note@angar2`; the note keeps its items.

The band has no background by default. To make it stand out, set **Band background** in `/plugin configure session-note@angar2` to `Gray`, `Olive` or `Wine` (`None` turns it off). The colors follow your terminal theme.

## The note follows the session

- Every session has its own note. `/clear` starts a new session, so you get a new, empty note; the old one stays with the old session.
- `/resume` brings back that session together with its note.
- `--fork-session` continues the conversation as a new session with an empty note, and tells the agent so.

## Where the notes are stored

One JSON file per session:

```
~/.claude/plugins/data/session-note-angar2/sessions/<session id>.json
```

A file is only created once a session gets its first item or proposal. Notes of past sessions are kept.

**Uninstalling deletes the notes.** `claude plugin uninstall session-note@angar2` removes this folder too. To keep it:

```sh
claude plugin uninstall session-note@angar2 --keep-data
```

If a note file cannot be read (broken JSON, or written by a newer version), it is left alone: a copy named `<session id>.unreadable-<time>.json` is kept next to it and the session starts with an empty note.

## Limits

- **Organization-managed Claude Code**: where an organization manages Claude Code, session-start events do not reach plugins you install yourself. There the note does not switch on `/clear` or `/resume` and is not passed again after a compaction.
- **`/rewind`**: rewinding the conversation removes the changes that were passed to the agent after that point, and plugins get no signal about it. The note itself is not rewound; the agent can read it again with the `note` tool.
- **One session in two places**: opening the same session in two terminals at once is not supported; the later save wins.
- **Hover**: buttons are highlighted under the mouse only in terminals that report mouse movement.

## Requirements

- Claude Code with plugin function hooks (mods). Built and tested on Claude Code **2.1.301**. The mods API is early access and may change between releases.
- Made for the terminal; the full-screen layout shows the pane on the right. The desktop app is covered only by Claude Code's plugin tests, not by hand.
