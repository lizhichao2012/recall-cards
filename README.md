# Recall Cards

An Obsidian plugin that turns your notes into active-recall questions with an LLM, then brings them back on a spaced-repetition schedule.

[中文说明](./README.zh-CN.md)

> **Note:** the plugin interface is currently in Chinese only.

## How it works

1. Open a note and click the brain icon in the top-right corner, then choose **Generate recall** (生成回忆). An LLM reads the note and writes 3–7 questions with answers. Questions focus on "why", "how" and "what's the difference", and every answer must be grounded in the note.
2. The questions open as a card in the right sidebar. Try to answer each one, reveal the answer, and rate how well you remembered:

   | Button | Meaning | What happens to the schedule |
   |---|---|---|
   | 忘了 Forgot | Couldn't recall most of it | The curve resets to stage 1 (review again in 1 day) |
   | 模糊 Fuzzy | Needed the answer or the note | Stays at the current stage |
   | 记得 Good | Answered correctly | Moves up one stage |
   | 简单 Easy | Effortless | Marked as mastered, no more reviews |

   Hovering over a button shows exactly how the schedule will change and the next review date.
3. Cards come back when they're due. The default intervals are 1, 2, 4, 7, 15, 30 and 60 days. The plugin checks for due cards every 30 minutes and shows at most 3 per day. The status bar shows how many cards are waiting.
4. If you edit a note after generating questions, the icon changes color. You can then regenerate the questions and keep your progress, regenerate and restart the curve, or ignore the change.

## Installation

The plugin isn't in the Community Plugins directory yet. To install it manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/recall-cards/`.
3. Reload Obsidian and enable **Recall Cards** under **Settings → Community plugins**.

You can also install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using this repository's URL.

Desktop only.

## Setup

Open **Settings → Recall Cards** and configure an LLM provider:

| Provider | Works with | Base URL |
|---|---|---|
| OpenAI-compatible | OpenAI, DeepSeek, Qwen, Ollama, and other `/chat/completions` APIs | e.g. `https://api.openai.com/v1` |
| Claude format | The Anthropic API, or proxies that speak the Claude Messages API | `https://api.anthropic.com`, or your proxy's URL |

Then fill in the model name and API key. With the Claude format, an empty model field defaults to `claude-opus-5-5`.

Other settings: the review intervals, daily push limit, number of questions per note, maximum note length, and the folder where review data is stored.

## Privacy and data

- **Note content is sent to the LLM provider you configure**, and only when you generate or regenerate questions. The plugin makes no other network requests: no telemetry, no analytics.
- **Your API key is stored in plain text** in `.obsidian/plugins/recall-cards/data.json`. If you sync your vault with git or a cloud service, the key is synced too.
- **The plugin writes to your vault:**
  - A `review-id` field is added to the frontmatter of each note you generate questions for. It keeps the note linked to its questions after you rename or move it.
  - Questions and review history are stored as JSON files in a `recall-cards/` folder. You can change the folder in settings.

## Development

```bash
npm install
npm test          # unit tests
npm run build     # type check + bundle into main.js
npm run dev       # rebuild on change
npm run deploy    # build and copy into a vault's plugin folder
```

`npm run deploy` reads the vault path from the `RECALL_CARDS_VAULT` environment variable or from a `.vault-path` file in the project root. `.vault-path` is git-ignored.

To release, run `npm version patch` (or `minor` / `major`). This updates `manifest.json` and `versions.json`. Then push the tag: `git push --follow-tags`. GitHub Actions builds the plugin and creates a draft release.

The module layout and design notes are in the [Chinese README](./README.zh-CN.md#开发) and the [design document](./笔记复习插件设计方案.md), both in Chinese.

## License

[MIT](./LICENSE)
