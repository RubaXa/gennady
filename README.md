🤖 Gennadyᵇᵉᵗᵃ 🗯️
-----------------
**GEN**eral **E**xtensible **N**eural **N**etwork **A**daptive **D**ata **Y**ntelligence.

```bash
# Generate commit message
npx gennady

# Code review for staged changes
npx gennady review

# Display file contents
npx gennady cat <path1> <path2> ...
```

---

### ✨ Features

- 🤖 [**Commit Message**](#-commit-messages): Generate clear, descriptive git commit messages from staged changes
- 📝 [**Code Review**](#-code-review): Review staged changes for critical issues (logic, runtime, security)
- 🐱 [**cat**](#-cat): Display file contents with markdown/XML formatting

---

## 🔖 Usage Overview

Gennady provides three main CLI commands:
- `npx gennady` — Generate commit messages from staged git changes
- `npx gennady review` — Review staged changes for critical issues
- `npx gennady cat <path1> <path2> ...` — Display file contents

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
| `--apply`         |                  | Immediately apply the generated commit message to git |


#### What Happens?
- Gennady analyzes your staged changes.
- It generates a commit message.
- If your system language isn't English, it translates the message for you.

---


## 📝 Code Review

Review staged changes for critical issues.

```sh
npx gennady review

# Review relative to a specific branch
npx gennady review --branch=develop
```

#### Options
| Option     | Alias(es)  | Description              |
|-----------|-----------|--------------------------|
| `--branch` | `-b`      | Target branch for diff   |

#### What Happens?
- Analyzes staged changes
- Checks for critical issues in added/modified lines (logic, runtime, security)
- Outputs `GOOD` if no issues found, or structured issue list

---

## 🐱 cat

Display file contents with optional markdown or XML formatting.

```sh
npx gennady cat ./src/

# Output as markdown
npx gennady cat ./src/ --output=md

# Output as XML
npx gennady cat ./src/ --output=xml

# Copy without color codes
npx gennady cat ./src/ --plain | pbcopy
```

#### Options
| Option        | Alias(es)     | Description              |
|---------------|---------------|--------------------------|
| `--output`    | `-o`          | Format: `md` or `xml`    |
| `--plain`     |               | Output without colors    |
| `--exclude`   | `-e`          | Patterns to exclude      |
| `--ext`       |               | File extensions to include |

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
{
    "models": [
        {
            "model": "gpt-3.5-turbo-0125",
            "url": "https://api.openai.com/v1/chat/completions",
            "key": "...",
        },
        {
            "model": "llama3:8b",
            "url": "http://127.0.0.1:11434/api/generate",
        }
    ]
}
```

---

## 🔌 API

Gennady provides a JavaScript/TypeScript API for programmatic use.

### Installation

```bash
npm install gennady
```

### Exports

- `AiModel`: Core AI model interface
- `GennadyRc`: Configuration management
- `unguard`: Error handling utilities

See source code for detailed JSDoc documentation.

## 🎉 Happy Coding with Gennady!

> Made with 🤖 by Konstantin Lebedev
