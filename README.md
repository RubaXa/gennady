🤖 Gennadyᵇᵉᵗᵃ 🗯️
-----------------
**GEN**erate **N**ext-level **A**utomated **D**escription **Y**ntelligence.

```bash
# Commit message
npx gennady

# Code review for critical issues
npx gennady review

# Quickly display the contents
npx gennady cat <path1> <path2> ...
```

---

### ✨ Features

- 🤖 [**Commit Message**](#-commit-messages): Automatically generate clear, descriptive git commit messages from your staged changes.
- 📝 [**review**](#-review): Instantly review your staged git changes for critical issues (logic, runtime, security).
- 🐱 [**cat**](#-cat): Quickly display the contents of multiple files or directories at once, filtered by allowed extensions (default: .js, .ts, .tsx).

---

## 🔖 Usage Overview

Gennady provides several main CLI commands:
- `npx gennady` — Generate commit messages from your staged git changes.
- `npx gennady cat <path1> <path2> ...` — Display the contents of one or more files or directories, filtered by allowed extensions.
- `npx gennady review` — Review your staged git changes for critical issues.

---

## 🤖 Commit Messages

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
- It generates a commit message.
- If your system language isn't English, it translates the message for you.

---


## 📝 review

Review your staged git changes for critical issues.

```sh
npx gennady review

# Review changes relative to a specific branch
npx gennady review --branch=develop
```

#### What Happens?
- Gennady analyzes your staged changes.
- It checks only the lines added or modified in your diff for critical issues (logic, runtime, and security errors).
- If no critical issues are found, it outputs `GOOD`.
- If issues are found, they are listed in a clear, structured format.

---

## 🐱 cat

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
