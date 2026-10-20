# session-note

**A mod plugin for Claude Code** — gives every session a note where you and the agent jot down what to do or check, and tick it off together. For multi-step work, the session lays out a process and shows which step it is on.

[한국어](README.ko.md)

![session-note demo: given a bug to fix, the session lays out a process and shows the current step on the right of the band, proposes a postponed task as a to-do that gets added, then the process tab in the pane shows the steps, and after "Remove step 4" the step is gone and the steps are renumbered](docs/demo-en.gif)

## Overview

session-note is a **mod plugin** for Claude Code. Mods let a plugin draw its own parts right inside the Claude Code screen, so the note is not a separate window: it sits just above the prompt and in a pane beside the terminal.

Work with an agent for a while and you will hear yourself say things like:

- "Let's skip that for now and come back to it."
- "I should double-check that this is right."
- "Once this is done, let's run the tests too."

In the moment you are sure you will remember. But as the conversation grows, these lines scroll away and are gone, and the agent will not bring them back up unless you do. That is how the things you put off quietly get forgotten.

session-note gives every session a small note. Put the things you postponed and the things to check in its **to-do** list, and tick them off when they are done. The note always sits right above the prompt, and the agent reads the same note and keeps track with you.

When you hand the session multi-step work, it lays out the order as a **process** in the note. A process is a roadmap the session writes itself and keeps current as the work moves along. A glance above the prompt tells you which step it is on, and when you come back from something else you can see right away how far it got.

## Features

- **Open items stay in sight.** The number of open to-dos is always shown above the prompt, so you take one more look before you close the session.
- **The agent proposes items.** When "let's do that later" comes up, the agent proposes adding it as a to-do. You just press a button.
- **The agent tells you what is finished.** When it wraps up a piece of work, the agent goes over the to-dos and proposes completing the items that look done.
- **You decide on to-dos.** The agent only proposes to-dos. It never changes them until you press a button or tell it to.
- **The current step stays in sight.** For multi-step work, the session lays out a process and shows the current step above the prompt. The pane shows the steps behind and ahead at a glance.
- **Change the process by asking.** The session writes and updates the process itself as it works. To change it, just say "Remove step 3" or "Put this before step 2", and it changes right away, renumbered.
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

### The band

The line just above the prompt (the **band**) has two areas, left and right.

```
 ☑ To do 2                                       ≡ Process ◼ 2.1 Read the logs  Open
```

- `☑ To do 2` on the left is the number of open to-dos. The agent's proposals also show up next to it.
- `≡ Process ◼ 2.1 Read the logs` on the right is the step the session is working on. It is empty when no step is in progress.
- `Open` at the right end opens the pane. It stays in place even when a proposal comes in.
- In a narrow window, the step title shortens with `…` first. Labels, numbers and buttons always stay.

### Accepting proposals

Say "let's check token expiry handling later" during the conversation, and the agent puts a proposal on the left of the band.

```
 ☑ To do 2  │  [+]  Check token expiry [Add] [Dismiss]   ≡ Process ◼ 2.1 Read the logs  Open
```

- The blue `[+]` means "add this as a new item?"
- Press `[Add]` to put it in the note, or `[Dismiss]` if you don't need it.
- The proposal stays on the band until you answer it, so you can finish what you were saying first.

### Completing items

When that work is finished, the agent checks it against the note and proposes completing it.

```
 ☑ To do 2  │  [✓]  Check token expiry [Complete] [Not yet]   ≡ Process ◼ 2.1 Read the logs  Open
```

- The green `[✓]` means "this item looks done."
- Press `[Complete]` if it is, or `[Not yet]` if something is left.
- When several proposals pile up, the band shows only the counts, like `[+] 2 new · [✓] 1 done`, and `Open` at the right end becomes `View`. Press `View` to answer them one by one in the pane.

### Following a process

Hand the session multi-step work, like "Fix the login bug" or "Ship the 1.1.0 release", and it lays out a process and tells you in one line. It does not make one for a quick question.

```
 ☑ To do 1                                            ≡ Process ◼ 1 Reproduce  Open
 ☑ To do 1                                       ≡ Process ◼ 2.1 Read the logs  Open
```

- The right of the band shows the current step with its number. It changes as soon as the session moves on to the next step.
- When steps in progress are spread over different top-level steps, the band shows the first one and the rest as a count, like `+1 more`.
- When no step is in progress, for example while the session waits for your answer, the process area is empty.

### Managing to-dos in the pane

Press `Open` at the right end of the band, or type `/note`, and the **pane** opens on the right side of the terminal. In a narrow window it opens above the prompt.

The top of the pane has two tabs, like `☑ To do 2    ≡ Process 1`. The numbers are the open to-dos and the unfinished processes. Press a tab to switch. The pane reopens on the tab you saw last.

The `To do` tab works like this:

- From the top: proposals waiting for an answer, open items, `+ New item`, and the done items.
- To add an item yourself, press `+ New item`, write a title and details, and press `[Add]`. Items you wrote are marked with `☺`.
- To complete an item, press its `☐`. Press `☑` on a done item to open it again.
- Press a title to expand it: its details, when it was added, and `[Edit]` `[Delete]`.

Everything is done with the mouse. The keyboard is only for typing titles and details.

### Viewing the process in the pane

Press the `≡ Process` tab to see the whole process.

```
◼ Fix the login bug
  ◼ 1 Reproduce
  ◼ 2 Find the cause ▾
    ◼ 2.1 Read the logs
    ◻ 2.2 Form a hypothesis
  ◻ 3 Fix it
  ◻ 4 Add a test

◻ Ship 1.1.0 ▸  paused at 3

──────────────────────
Finished 1 ▸
```

- The process at the top is the one in progress, and its current step is in bold.
- The square before a step is its status: `◻` waiting, blue `◼` in progress, green `◼` done, red `◼` stopped.
- The pane numbers the steps in order. Remove or insert a step, and the numbers update by themselves.
- A step with sub-steps has a `▸`. Press its title and it turns into `▾` and shows the sub-steps. At first only the steps in progress are expanded.
- A process put on hold for other work folds into one line with where it stopped, like `paused at 3`. Press it to look inside.
- Finished processes are not deleted. They gather under `Finished N ▸` at the bottom.
- The process tab is for viewing only. To change the process, ask the agent.

### Managing the note in conversation

Ask the agent, and it does it right away, without a proposal.

**To-dos**

| Say | The agent |
|---|---|
| "Put this in the note" | adds an item |
| "That one is done" | completes the item |
| "Rename that item" | edits the item |
| "Delete that one" | deletes the item |
| "Check the note" | goes over the open items and proposes completing the finished ones |

The agent never edits or deletes to-dos unless you tell it to.

**Processes**

| Say | The agent |
|---|---|
| "Remove step 3" | removes step 3 from the current process |
| "Put this before step 2" | inserts a step before step 2 |
| "Move step 4 after step 2" | reorders the steps |
| "Hold the release, let's look at this bug first" | lays out a new process and starts it; the one on hold remembers where it stopped |
| "Delete that process" | deletes the process |

The session updates the process itself as it works. It moves through steps and fills in sub-steps without a word, and gives a one-line reason only when it changes the main steps.

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
- After the conversation is compacted or resumed with `/resume`, the session gets the note's to-dos and process again and picks up from the step it was on.

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
