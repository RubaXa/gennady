---
name: Carbon & Steel

> **Adopted for agent-inbox v2 (2026-08-06)** из `~/Developer/draft/` (варианты 0/1 — холодная палитра).
> Изменения к источнику: тёплая sepia-палитра вариантов 2/3/4 ОТКЛОНЕНА (утомление при чтении);
> Material Symbols — только inline-SVG подмножеством в бандле (не CDN, zero-runtime-deps);
> emoji в макетах — семантические плейсхолдеры, маппинг на SVG-иконки при реализации.
colors:
  surface: '#121416'
  surface-dim: '#121416'
  surface-bright: '#37393b'
  surface-container-lowest: '#0c0e10'
  surface-container-low: '#1a1c1e'
  surface-container: '#1e2022'
  surface-container-high: '#282a2c'
  surface-container-highest: '#333537'
  on-surface: '#e2e2e5'
  on-surface-variant: '#e1bfb3'
  inverse-surface: '#e2e2e5'
  inverse-on-surface: '#2f3133'
  outline: '#a88a7f'
  outline-variant: '#594138'
  surface-tint: '#ffb597'
  primary: '#ffb597'
  on-primary: '#591d00'
  primary-container: '#fc6d26'
  on-primary-container: '#5a1d00'
  inverse-primary: '#a53d00'
  secondary: '#c1c6d6'
  on-secondary: '#2b313c'
  secondary-container: '#434956'
  on-secondary-container: '#b3b8c7'
  tertiary: '#a9caeb'
  on-tertiary: '#0e334e'
  tertiary-container: '#7c9cbc'
  on-tertiary-container: '#0f334e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbcd'
  primary-fixed-dim: '#ffb597'
  on-primary-fixed: '#360f00'
  on-primary-fixed-variant: '#7e2c00'
  secondary-fixed: '#dde2f2'
  secondary-fixed-dim: '#c1c6d6'
  on-secondary-fixed: '#161c27'
  on-secondary-fixed-variant: '#414753'
  tertiary-fixed: '#cee5ff'
  tertiary-fixed-dim: '#a9caeb'
  on-tertiary-fixed: '#001d32'
  on-tertiary-fixed-variant: '#294965'
  background: '#121416'
  on-background: '#e2e2e5'
  surface-variant: '#333537'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '450'
    lineHeight: 20px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  container-max: 1440px
---

## Brand & Style

The design system is a high-performance, developer-centric interface engineered for precision and focus. It targets professional software engineers and technical reviewers who operate in high-density information environments.

The aesthetic is **Technical Minimalism** mixed with **Modern Brutalism**. It prioritizes extreme legibility and functional density. The interface should feel like a high-end IDE or a precision cockpit: dark, low-fatigue, but punctuated by high-energy accents that signal action and importance. It utilizes sharp contrast and rigid structural alignment to maintain order in complex code-review workflows.

## Colors

The palette is built on a deep "Carbon" foundation to reduce eye strain during prolonged sessions.

- **Primary (#fc6d26):** A high-energy "Safety Orange" used exclusively for primary actions, critical findings, and active state indicators.
- **Neutral/Surface (#1a1c1e):** The core background color. All secondary surfaces should be slightly lighter to create depth.
- **Secondary/UI (#2e3440):** Used for borders, inactive tabs, and sunken areas like the console or terminal backgrounds.
- **Success/Info (#81a1c1):** A muted frosted blue used for non-critical information and "Steel" accents.

All text must maintain a minimum contrast ratio of 4.5:1 against the dark background. Syntax highlighting colors should follow a modified Nord-style palette to ensure they remain distinct from the primary brand orange.

## Typography

The typography system is designed for hyper-readability in technical contexts.

- **Display & UI:** Use **Geist** for its neutral, technical clarity and excellent spacing. It provides a modern, engineered feel for headings and interface controls.
- **Code & Labels:** Use **JetBrains Mono** for all code blocks, metadata, and labels. The increased x-height and distinct character shapes are critical for distinguishing similar characters (0/O, l/1) during code reviews.
- **Scaling:** Headlines scale down by 20% on mobile devices to preserve horizontal space for code snippets.

## Layout & Spacing

This design system employs a **Fixed Grid** philosophy for primary containers with **Fluid Content** inner structures.

- **Grid:** A 12-column system for desktop, collapsing to 1 column for mobile.
- **Rhythm:** An 8px baseline grid governs all vertical rhythm.
- **Code Views:** Code comparison views should maximize horizontal real estate, often requiring a "sidebar-collapse" state where the main content area expands to fill the viewport minus a 64px utility rail.
- **Density:** Use "Compact" spacing for data-heavy views (Review Threads) and "Default" spacing for landing or configuration pages.

## Elevation & Depth

Depth is signaled through **Tonal Layering** rather than traditional shadows.

1. **Level 0 (Background):** The darkest shade (#0d0e0f). Used for the main application shell.
2. **Level 1 (Surface):** #1a1c1e. Used for the primary editor area and cards.
3. **Level 2 (Overlay):** #2e3440. Used for tooltips, menus, and floating widgets.

Instead of heavy shadows, use 1px solid borders in a slightly lighter hex than the surface color to define boundaries. For active focus, use a 1px border of the Primary color.

## Shapes

To achieve a "modern technical" feel, the design system utilizes a consistent 8px radius (**Rounded**) across all primary UI components.

- **Small Components:** Checkboxes and small tags use `rounded-sm` (4px).
- **Standard UI:** Buttons, inputs, and cards use `rounded-md` (8px).
- **Large Containers:** Modals and large review panels use `rounded-lg` (16px).
- **Status Indicators:** Avoid pill shapes; stick to softened squares to maintain the architectural, grid-based aesthetic.

## Components

### Review-Specific Widgets

- **Findings:** Use a left-border accent (Primary Orange) to indicate severity. Typography should be `code-md` for the snippet and `body-sm` for the explanation.
- **Threads:** Nested layouts using indentation and a vertical "thread-line" in `#2e3440`. Action buttons (Reply, Resolve) should be ghost-style until hovered.
- **Plan:** A checklist-style component with a progress bar at the top. Completed items should strike through and dim to 50% opacity.

### General UI

- **Buttons:** Primary buttons are solid `#fc6d26` with white text. Secondary buttons are ghost-style with a `#2e3440` border.
- **Input Fields:** Dark backgrounds (#0d0e0f) with a 1px border. Focus state triggers a primary orange border and a subtle 2px outer glow.
- **Chips/Tags:** Use `label-sm` typography. Backgrounds should be low-contrast (10% opacity of the accent color) with a solid border of the same color.
- **Cards:** No shadows. Use a 1px border (#2e3440) and a slightly elevated surface color (#1a1c1e).
