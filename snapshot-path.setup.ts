import path from 'node:path';
import { snapshot } from 'node:test';

snapshot.setResolveSnapshotPath((testFilePath) => {
  const resolvedTestFilePath = testFilePath as string;
  const testDirectory = path.dirname(resolvedTestFilePath);
  const testFileName = path.basename(resolvedTestFilePath);
  return path.join(testDirectory, 'snapshots', `${testFileName}.snapshot`);
});
