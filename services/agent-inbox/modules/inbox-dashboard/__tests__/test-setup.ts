// @file: Test setup helper for inbox-dashboard component tests — jsdom + ReactDOM.
// @consumers: inbox-dashboard __tests__
// @tasks: TSK-107

import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { type ReactElement } from 'react';

/**
 * @purpose Create a DOM container for React component testing.
 * @returns The DOM container element.
 */
export function createTestContainer(): HTMLElement {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-root"></div></body></html>', {
    url: 'http://localhost',
  });

  // Polyfill globals needed by React
  (globalThis as Record<string, unknown>).window = dom.window;
  (globalThis as Record<string, unknown>).document = dom.window.document;
  (globalThis as Record<string, unknown>).navigator = dom.window.navigator;
  (globalThis as Record<string, unknown>).HTMLElement = dom.window.HTMLElement;
  (globalThis as Record<string, unknown>).HTMLDivElement = dom.window.HTMLDivElement;
  (globalThis as Record<string, unknown>).HTMLButtonElement = dom.window.HTMLButtonElement;
  (globalThis as Record<string, unknown>).HTMLSpanElement = dom.window.HTMLSpanElement;
  (globalThis as Record<string, unknown>).Event = dom.window.Event;
  (globalThis as Record<string, unknown>).CustomEvent = dom.window.CustomEvent;
  (globalThis as Record<string, unknown>).MouseEvent = dom.window.MouseEvent;
  (globalThis as Record<string, unknown>).requestAnimationFrame = dom.window.requestAnimationFrame;

  // Suppress React act() warnings in test environment
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

  return dom.window.document.getElementById('test-root')!;
}

/** @purpose Track active roots for cleanup. */
const activeRoots: Root[] = [];

/**
 * @purpose Render a React element into the test container and return the root.
 * @param element React element to render.
 * @param container DOM container.
 * @returns The rendered root for cleanup.
 */
export function render(element: ReactElement, container: HTMLElement): Root {
  const root = createRoot(container);
  root.render(element);
  activeRoots.push(root);
  return root;
}

/**
 * @purpose Clean up all active roots after each test.
 */
export function cleanup(): void {
  for (const root of activeRoots.splice(0)) {
    root.unmount();
  }
}
