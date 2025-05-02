### Добавление функции (no issues и suggestions)

#### Diff
```diff
diff --git a/src/utils/logger.ts b/src/utils/logger.ts
new file mode 100644
index 00000000..f5b0a57b
--- /dev/null
+++ b/src/utils/logger.ts
@@ -0,0 +1,3 @@
+function logUserAction(userId: string, action: string): void {
+       console.info(`User ${userId} performed ${action}`);
+}
```

#### Expected
```
OK
```

----

### Suggest adding `void` return type

#### Diff
```diff
diff --git a/src/utils/logger.ts b/src/utils/logger.ts
new file mode 100644
index 00000000..f5b0a57b
--- /dev/null
+++ b/src/utils/logger.ts
@@ -0,0 +1,3 @@
+function logUserAction(userId: string, action: string) {
+       console.info(`User ${userId} performed ${action}`);
+}
```

#### Expected
```
### Issues
**src/utils/logger.ts#L1**
1. Missing explicit return type for function.
   - Hint: Add `void` as the return type.

### Suggestions
**src/utils/logger.ts#L1**
```suggestion
function logUserAction(userId: string, action: string): void {
```
```