🤖 Gennadyᵇᵉᵗᵃ 🗯️
-----------------
**GEN**erate **N**ext-level **A**utomated **D**escription **Y**ntelligence.

```bash
npx gennady
```

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

Create `~/.gennadyrc` file:

```json
[
    {
        "url": "https://api.openai.com/v1/chat/completions",
        "key": "...",
        "model": "gpt-4o"
    }
]
```

---

### Usage

```bash
# Basic usage
npx gennady

# Generate oneline commit message
npx gennady --mode=oneline

# Generate detailed commit message
npx gennady --mode=detailed

# Generate detailed commit message relative to the target branch
npx gennady --branch=develop
```