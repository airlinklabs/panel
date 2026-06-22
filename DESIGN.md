# Design

## Color

### Light mode

| Role | Token | Value | Usage |
|---|---|---|---|
| Page bg | `neutral-50` | `oklch(98.5% 0 0)` | Body, page background |
| Surface | `white` | `#fff` | Cards, modals, panels |
| Surface secondary | `neutral-100` | `oklch(97% 0 0)` | Secondary bg, sidebar (glass) |
| Border | `neutral-200` | `oklch(92.2% 0 0)` | Card borders, dividers |
| Border subtle | `neutral-200/30` | `oklch(92.2% 0 0) @ 30%` | Inner dividers, table rows |
| Text primary | `neutral-800` | `oklch(26.9% 0 0)` | Headings, body text |
| Text secondary | `neutral-500` | `oklch(55.6% 0 0)` | Descriptions, labels |
| Text muted | `neutral-400` | `oklch(70.8% 0 0)` | Placeholders, disabled |
| Input bg | `white` | `#fff` | Form inputs |
| Nav bg | `white/80` + `backdrop-blur-xl` | Glass | Sidebar background |
| Nav text | `neutral-600` | `oklch(43.9% 0 0)` | Nav items (inactive) |
| Nav text active | `neutral-950` | `oklch(14.5% 0 0)` | Nav items (active) |

### Dark mode

| Role | Token | Value | Usage |
|---|---|---|---|
| Page bg | `neutral-950` | `#141414` | Body, page background |
| Surface | `white/5` | `white @ 5%` | Cards, modals |
| Surface secondary | `neutral-900` | `oklch(20.5% 0 0)` | Secondary bg |
| Border | `white/5` | `white @ 5%` | Card borders, dividers |
| Text primary | `white` | `#fff` | Headings, body text |
| Text secondary | `neutral-400` | `oklch(70.8% 0 0)` | Descriptions, labels |
| Nav bg | `#141414/80` + `backdrop-blur-xl` | Glass | Sidebar background |
| Nav text | `neutral-500` | `oklch(55.6% 0 0)` | Nav items (inactive) |
| Nav text active | `white` | `#fff` | Nav items (active) |

### Accent / Brand

| Role | Token | Value | Usage |
|---|---|---|---|
| Accent | `--theme-accent` | `#6366f1` (indigo) | Primary actions, active selection |
| Accent hover | `--theme-accent-hover` | `#818cf8` | Hover state |
| Accent text | `--theme-accent-text` | `#ffffff` | Text on accent bg |

### Semantic status

| Role | Light | Dark | Usage |
|---|---|---|---|
| Success / Online | `emerald-500` / `green-500` | `emerald-400` | Server online, success toasts |
| Warning / Starting | `amber-500` | `amber-400` | Server starting, warnings |
| Danger / Error | `red-500` / `red-600` | `red-400` | Errors, danger actions, server offline |
| Info / Loading | `blue-500` / `blue-600` | `blue-400` | Info toasts, loading states |
| Stopping | `orange-400` / `orange-500` | `orange-400` | Server stopping |

### Theme variable system

Full `--theme-*` CSS custom property set (56+ variables) overrides Tailwind defaults. Built-in themes: Solarized Dark, Solarized Light. User themes in `/public/themes/user/`.

---

## Typography

### Font

**Primary:** General Sans (Fontshare CDN)
- Weights loaded: 300, 400, 500, 600, 700
- Applied on `<body>` via inline style

**Monospace:** `ui-monospace, 'Cascadia Code', 'SF Mono', monospace`

### Scale

Fixed rem scale (no fluid clamp for product UI):

| Role | Class | Size | Weight |
|---|---|---|---|
| Page title | `text-base font-medium` | 16px | 500 |
| Section heading | `text-lg font-semibold` | 18px | 600 |
| Body / description | `text-sm text-neutral-500` | 14px | 400 |
| Small label / badge | `text-xs font-medium` | 12px | 500 |
| Navigation item | `text-sm` | 14px | 400-500 |

Scale ratio: 1.125-1.2 between steps.

### Letter spacing

- Headings: `-0.025em` (tight)
- Labels: `0.025em` (wide)
- Badge/small caps: `0.05em` (wider)

---

## Spacing and Layout

### Border radius

| Token | Value | Usage |
|---|---|---|
| `rounded-xl` | `0.75rem` (12px) | **Primary** -- buttons, cards, modals, inputs, nav items |
| `rounded-2xl` | `1rem` (16px) | Large cards, modal panels |
| `rounded-lg` | `0.5rem` (8px) | Small elements |
| `rounded-full` | pill | Avatars, status dots, badges |

### Shadows

| Token | Value |
|---|---|
| `shadow-md` | `0 6px 12px -10px rgb(0 0 0 / 0.32)` |
| `shadow-lg` | `0 8px 18px -14px rgb(0 0 0 / 0.34)` |
| `shadow-2xl` | `0 18px 44px -28px rgb(0 0 0 / 0.45)` |

### Spacing

Base unit: `0.25rem` (4px). All utilities are multiples.

| Pattern | Value |
|---|---|
| Component padding | `p-4` to `p-6` (16-24px) |
| Page section padding | `px-8` (32px) |
| Item gap | `gap-2` to `gap-6` (8-24px) |
| Sidebar width | `lg:w-56` (224px) |
| Top bar height | `h-16` (64px) |

### Layout

- **Desktop:** Fixed left sidebar (`w-56`) + scrollable content (`lg:pl-56`)
- **Mobile:** Frosted top bar (`backdrop-blur-xl`) + bottom nav rail + content
- **Grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` for card grids
- **Responsive:** `repeat(auto-fit, minmax(280px, 1fr))` for fluid grids

---

## Components

### Inventory

| Component | Pattern |
|---|---|
| **Button** | Three tiers: secondary (`al-ui-button`), primary (`al-ui-button-primary`), danger (red-600). Rounded-xl. |
| **Card** | `bg-white dark:bg-white/5 rounded-xl border border-neutral-200/30 dark:border-white/5` |
| **Modal** | Fixed overlay + `backdrop-blur-sm` + centered panel, `rounded-2xl shadow-2xl`, scale-95 to scale-100 |
| **Toast** | Fixed top-right, `rounded-xl shadow-lg`, slide-in from right. Types: error/success/warning/loading/info |
| **Tab bar** | Pill-style: `bg-neutral-100 dark:bg-white/5 rounded-xl p-1 inline-flex` with sliding active indicator |
| **Table** | `thead` with `bg-neutral-50`, `divide-y` rows, `hover:bg-neutral-50/50` |
| **Input** | `rounded-xl border border-neutral-300 dark:border-white/5`, focus ring |
| **Badge / Status pill** | `rounded-full`, semantic bg/text combos (green=online, red=offline, etc.) |
| **Skeleton** | `s-skeleton` class with pulse animation |
| **Progress bar** | Track: `h-3 bg-neutral-200 rounded-full`, fill: `bg-blue-600 rounded-full` |
| **Nav item** | Sidebar: `rounded-xl px-4 py-2`, active: background + text color change |
| **Server card** | Status indicator dot + name + specs (CPU, RAM, disk), hover lift |
| **Loading overlay** | Full-screen `backdrop-blur-lg saturate(180%)`, spinner + step text + action bar |

### States

Every interactive component has: default, hover, focus, active, disabled, loading, error.

---

## Motion

### Easing curves

| Curve | Value | Usage |
|---|---|---|
| Decelerate | `cubic-bezier(0.16, 1, 0.3, 1)` | **Primary** -- modals, reveals, layout |
| Standard | `cubic-bezier(0.4, 0, 0.2, 1)` | Transitions, hover states, FLIP |
| Spring | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Checkbox overshot |

### Durations

| Type | Duration |
|---|---|
| Default transition | 150ms |
| Modal open/close | 200ms |
| Card/row stagger | 350ms, +50ms per item |
| Page transition | 350ms |
| SPA progress bar | 72% asymptote, exponential ease |

### Motion system

Android-like `data-animate` attribute system: `fade`, `fade-up`, `fade-down`, `slide-left`, `slide-right`, `scale`, `blur`.

Enter animations: 350ms, `cubic-bezier(0.16, 1, 0.3, 1)`.
Exit animations: 200ms.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Icons

**Library:** Lucide (server-side rendered via `icon()` helper)

**Defaults:** `stroke-width: 1.75`, `stroke-linecap: round`, `stroke-linejoin: round`, `fill: none`

**Sizes:** 12px (inline), 16px (default), 20px (nav), 32px (large)

---

## Layout tokens

| Token | Value |
|---|---|
| Sidebar width | `224px` (w-56) |
| Top bar height | `64px` (h-16) |
| Container max | `1280px` (7xl) |
| Blur (glass) | `24px` (backdrop-blur-xl) |
| Breakpoint sm | `640px` |
| Breakpoint md | `768px` |
| Breakpoint lg | `1024px` |
| Breakpoint xl | `1280px` |
