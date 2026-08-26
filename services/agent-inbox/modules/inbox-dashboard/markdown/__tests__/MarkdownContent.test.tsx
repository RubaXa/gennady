// @file: MarkdownContent artifact-link contract tests.
// @consumers: ReviewArtifactViewer

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent } from '../MarkdownContent.tsx';

describe('MarkdownContent artifact links', () => {
  it('keeps safe report-relative links as viewer navigation targets', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent source="[UI track](tasks/track_ui.md)" onOpenArtifact={() => undefined} />
    );

    assert.match(html, /data-artifact-path="tasks\/track_ui\.md"/);
    assert.match(html, />UI track<\/a>/);
  });

  it('does not expose traversal links as artifact navigation', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent source="[unsafe](../secret.md)" onOpenArtifact={() => undefined} />
    );

    assert.doesNotMatch(html, /data-artifact-path/);
    assert.match(html, /unsafe/);
  });
});
