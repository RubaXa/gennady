# Gennady API: Using AiModel.generate

This guide demonstrates best practices for calling `AiModel.generate` and handling its results, particularly when using TypeScript.

## 1. Basic Usage of `AiModel.generate`

The `AiModel.generate` method returns a Promise that resolves to a tuple: `[result, error]`. You need to handle both potential outcomes.

### ✅ GOOD: Handling the Result Tuple

This example assumes `aiModel` is an initialized instance of `AiModel`.

```typescript
import { AiModel } from 'gennady/src/ai/ai-model';

async function generateTextWithTupleHandling(aiModel: AiModel, prompt: string) {
    const [response, error] = await aiModel.generate(prompt, {
        temperature: 0.7,
        timeout: 10000, // Optional: timeout in milliseconds
    });
    if (error) {
        throw new Error(`[GENERATE_TEXT_WITH_TUPLE_ERROR] [${aiModel.name}] Generate failed`, {cause: error})
    }

    return response;
}
```
**Reasoning:** This approach explicitly checks for an error before attempting to use the response. This is the fundamental way to interact with functions designed with this tuple-based error handling pattern.

## 2. Using `AiModel.generate` with `unguardOrThrow` for Cleaner Code

For scenarios where you want to simplify error handling and prefer exceptions for the error path, especially in a sequence of operations, `unguardOrThrow` is recommended.

### ❌ BAD: Multiple Manual Error Checks in Sequential Operations

```typescript
// ... imports and aiModel initialization ...
async function sequentialGenerationBad(aiModel: AiModel) {
    const [response1, error1] = await aiModel.generate("First prompt");
    if (error1) {
        throw new Error(`[SEQUENTIAL_GENERATION_BAD_ERROR_1] [${aiModel.name}] Generate failed`, {cause: error1})
    }
    console.log("First response:", response1);

    const [response2, error2] = await aiModel.generate("Second prompt using: " + response1.substring(0, 20));
    if (error2) {
        throw new Error(`[SEQUENTIAL_GENERATION_BAD_ERROR_2] [${aiModel.name}] Generate failed`, {cause: error2})
    }
    console.log("Second response:", response2);
    // ... and so on
}
```
**Reasoning:** This becomes verbose and repetitive. Each step requires its own error check and handling logic, making the main flow harder to read.

### ✅ GOOD: Using `unguardOrThrow` for Concise Sequential Operations

```typescript
import { AiModel } from 'gennady/src/ai/ai-model';
import { unguardOrThrow } from 'gennady/src/utils/unguard';

async function sequentialGenerationGood(aiModel: AiModel) {
    try {
        console.log("Attempting first generation...");
        const response1 = await unguardOrThrow(aiModel.generate("Write a short poem about coding."));
        console.log("First response:\n", response1);

        console.log("\nAttempting second generation based on the first...");
        const response2 = await unguardOrThrow(aiModel.generate(`Write a haiku based on this line: "${response1.split('\n')[0]}"`));
        console.log("Second response (haiku):\n", response2);

        // You can continue the chain of operations here
        // const response3 = await unguardOrThrow(aiModel.generate(...));

    } catch (error) {
        throw new Error(`[SEQUENTIAL_GENERATION_GOOD_ERROR] [${aiModel.name}] Generate failed`, {cause: error})
    }
}
```
**Reasoning:** `unguardOrThrow` unwraps the success value or throws the error if present. This allows you to write cleaner, more linear code for the success path and handle all errors in a single `catch` block. This is particularly useful for chained asynchronous operations where an error at any point should halt the entire chain.

---
Remember to always initialize `AiModel` with valid configuration, typically loaded via `GennadyRc`. The examples above focus on the `generate` call itself, assuming `aiModel` is ready.
