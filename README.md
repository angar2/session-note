# session-note

**A mod plugin for Claude Code** — gives every session a note where you and the agent jot down what to do or check, and tick it off together.

[한국어](README.ko.md)

![The agent proposes a postponed task for the note and proposes completing it once done; items are then added and completed in the pane](docs/demo-en.gif)

## Overview

session-note is a **mod plugin** for Claude Code. Mods let a plugin draw its own parts right inside the Claude Code screen, so the note is not a separate window: it sits just above the prompt and in a pane beside the terminal.

Work with an agent for a while and you will hear yourself say things like:

- "Let's skip that for now and come back to it."
- "I should double-check that this is right."
- "Once this is done, let's run the tests too."

In the moment you are sure you will remember. But as the conversation grows, these lines scroll away and are gone, and the agent will not bring them back up unless you do. That is how the things you put off quietly get forgotten.

session-note gives every session a small note. Put the things you postponed and the things to check in it, and tick them off when they are done. The note always sits right above the prompt, and the agent reads the same note and keeps track with you.

## Features

- **Open items stay in sight.** The number of open items is always shown above the prompt, so you take one more look before you close the session.
- **The agent proposes items.** When "let's do that later" comes up, the agent proposes adding it to the note. You just press a button.
- **The agent tells you what is finished.** When it wraps up a piece of work, the agent goes over the note and proposes completing the items that look done.
- **You always decide.** The agent only proposes. It never changes the note until you press a button or tell it to.
- **The session stays light.** The note is not sent to the agent with every reply. Only what changed is passed along, briefly, when it changes.

## Installation

Type these two lines inside Claude Code:

```
/plugin marketplace add angar2/session-note
/plugin install session-note@angar2
```

- The first line registers this repository as a place to get plugins from.
- The second line installs the plugin. Every session you open from then on gets a note.

## Usage

### Accepting proposals

Say "let's check token expiry handling later" during the conversation, and the agent puts a proposal on the line above the prompt (the **band**).

```
 Notes 2  │  [+]  Check token expiry handling                    [Add] [Dismiss]
```

- The blue `[+]` means "add this as a new item?"
- Press `[Add]` to put it in the note, or `[Dismiss]` if you don't need it.
- The proposal stays on the band until you answer it, so you can finish what you were saying first.

### Completing items

When that work is finished, the agent checks it against the note and proposes completing it.

```
 Notes 2  │  [✓]  Check token expiry handling              [Complete] [Not yet]
```

- The green `[✓]` means "this item looks done."
- Press `[Complete]` if it is, or `[Not yet]` if something is left.
- When several proposals pile up, the band shows only the counts, like `[+] 2 new · [✓] 1 done`. Press `View` to answer them one by one in the pane.

### Managing the note in the pane

Press `Open` at the right end of the band, or type `/note`, and the **pane** opens on the right side of the terminal. In a narrow window it opens above the prompt.

- From the top: proposals waiting for an answer, open items, `+ New item`, and the done items.
- To add an item yourself, press `+ New item`, write a title and details, and press `[Add]`. Items you wrote are marked with `☺`.
- To complete an item, press its `☐`. Press `☑` on a done item to open it again.
- Press a title to expand it: its details, when it was added, and `[Edit]` `[Delete]`.

Everything is done with the mouse. The keyboard is only for typing titles and details.

### Managing the note in conversation

Ask the agent, and it does it right away, without a proposal.

| Say | The agent |
|---|---|
| "Put this in the note" | adds an item |
| "That one is done" | completes the item |
| "Rename that item" | edits the item |
| "Delete that one" | deletes the item |
| "Check the note" | goes over the open items and proposes completing the finished ones |

The agent never edits or deletes items unless you tell it to.

## Configuration

Change these any time with `/plugin configure session-note@angar2`. Your notes keep their items.

| Setting | Values | Default | Description |
|---|---|---|---|
| Language | English · 한국어 | English | The language of the band and the pane |
| Band background | None · Gray · Olive · Wine | None | The background color of the band. Pick one if you want the band to stand out |

The colors follow your terminal theme.

## Sessions and storage

### Notes per session

- Each session has its own note.
- `/clear` starts a new session, so you start with an empty note. The old note stays with the old session.
- When you reopen a session with `/resume`, its note comes back with it.

### Storage location

Each session's note is one JSON file:

```
~/.claude/plugins/data/session-note-angar2/sessions/<session id>.json
```

**Uninstalling the plugin deletes the notes too.** To keep them, add `--keep-data` when you uninstall:

```sh
claude plugin uninstall session-note@angar2 --keep-data
```

## Limitations

- **Organization-managed Claude Code** does not send session-start events to plugins you install yourself. There, the note does not switch on `/clear` or `/resume`.
- **`/rewind`** rewinds the conversation but not the note. The agent can read the note again to get the latest state.
- **If you open the same session in two terminals at once**, only the one that saves last is kept.

## Requirements

- Claude Code with mods (plugin function hooks). Built and tested on Claude Code 2.1.301.
- Mods are still in early access, so behavior may change with new Claude Code versions.

## License

[MIT](LICENSE)
