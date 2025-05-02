### Добавление функции (no issues и suggestions)

#### Diff
```diff
--- /dev/null
+++ b/src/utils/logger.ts
@@ -0,0 +1,3 @@
+function logUserAction(userId: string, action: string): void {
+       console.info(`User ${userId} performed ${action}`);
+}
```

#### Expected
- OK

----

### Sensitivity data (token)

#### Diff
```diff
--- a/src/utils/logger.ts
+++ b/src/utils/logger.ts
@@ -1,3 +1,3 @@
-function logUserAction(userId: string, action: string) {
-       console.info(`User ${userId} performed ${action}`);
+function logUserAction(userId: string, action: string, token: string) {
+       console.info(`User ${userId} performed ${action} (token: ${token})`);
 }
```

#### Expected
- !(console.+token)

----

### JSON.parse

#### Diff
```diff
--- /dev/null
+++ b/src/utils/parser.js
@@ -0,0 +1,3 @@
+function parseUserData(raw) {
+  return JSON.parse(raw);
+}
```

#### Expected
- try
- catch
- console

----

### Sensitivity data after JSON.parse

#### Diff
```diff
--- /dev/null
+++ b/src/parser.js
@@ -0,0 +1,9 @@
+function parseUser(raw) {
+  try {
+    const user = JSON.parse(raw);
+    console.log(`User data: id=${user.id}, token=${user.token}`);
+    return user;
+  } catch (e) {
+    // TODO: Log parsing error
+    return null;
+  }
+}
```

#### Expected
- try
- catch
- console

----