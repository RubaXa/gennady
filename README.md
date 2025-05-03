🤖 Gennadyᵇᵉᵗᵃ 🗯️
-----------------
**GEN**erate **N**ext-level **A**utomated **D**escription **Y**ntelligence.

```bash
# Commit message
npx gennady

# Quickly display the contents
npx gennady cat <path>
```

---

### ✨ Features

- 🤖 **AI-powered Commit Messages**: Automatically generate clear, descriptive git commit messages from your staged changes.
- 🐱 **cat Command**: Quickly display the contents of files or directories, filtered by allowed extensions.

---

## 🔖 Usage Overview

Gennady provides two main CLI commands:
- `npx gennady` — Generate commit messages from your staged git changes.
- `npx gennady cat <path>` — Display the contents of files or directories, filtered by allowed extensions.

---

## 🤖 Command: Generate Commit Messages

```sh
# Basic usage
npx gennady

# Generate oneline commit message
npx gennady --mode=oneline

# Generate detailed commit message
npx gennady --mode=detailed

# Generate detailed commit message relative to the target branch
npx gennady --branch=develop
```

### Options
| Option            | Alias(es)        | Description                                  |
|-------------------|------------------|----------------------------------------------|
| `--mode`          | `-m`             | Set the mode (`auto`, `oneline`, `detailed`) |
| `--oneline`       | `--short`, `-o`  | Generate a one-line commit message           |
| `--model`         |                  | Specify the AI model                         |
| `--branch`        | `-b`             | Target branch for diff                       |

#### What Happens?
- Gennady analyzes your staged changes.
- It generates a commit message using AI.
- If your system language isn't English, it translates the message for you.

---

## 🐱 Command: cat

Display the contents of files or directories (with filtering for allowed extensions).

```sh
npx gennady cat ./src/
```

#### Output
- Shows file contents with headers per file.
- Hints for copying output without color codes.

---

## Setup LLM

### Local

```sh
brew install ollama
ollama pull llama3:8b
ollama serve
```

---

### External

Create `~/.gennadyrc` configuration file:

```json
[
    {
        "url": "https://api.openai.com/v1/chat/completions",
        "key": "...",
        "model": "gpt-3.5-turbo-0125"
    }
]
```

---

## 🎉 Happy Coding with Gennady!

> Made with 🤖 by Konstantin Lebedev
