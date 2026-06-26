# Theme Creator Guide

This document explains how to create, install, and customize themes for AirLink Panel.

## How Theming Works

The panel uses CSS custom properties (variables) for all visual styling. A shared file called `theme-base.css` maps these variables to actual HTML elements — theme authors only need to define variable values in `:root`.

**You do NOT need to write any selectors.** Just define variables.

### Loading order

1. `styles.css` — Tailwind base styles
2. `theme-base.css` — shared selectors that wire `--theme-*` variables to elements (loaded only when a non-default theme is active)
3. Your `light.css` or `dark.css` — defines variable values on `:root`

The panel toggles between light/dark by adding/removing the `dark` class on `<html>`. Your `light.css` loads when the panel is in light mode; your `dark.css` loads when in dark mode.

## Creating a Theme

### File structure

Your theme zip must contain exactly three files:

```
my-theme/
  info.json     — theme metadata
  light.css     — variables for light mode
  dark.css      — variables for dark mode
```

### info.json

```json
{
  "name": "My Theme",
  "author": "Your Name",
  "updatedAt": "2026-06-25"
}
```

### CSS files

Each CSS file only needs a `:root` block with variables. Here's the minimal template:

```css
:root {
  --theme-bg:             #ffffff;
  --theme-bg-secondary:   #f5f5f5;
  --theme-bg-card:        #f9f9f9;
  --theme-text:           #333333;
  --theme-text-strong:    #111111;
  --theme-accent:         #6366f1;
  /* ... add whatever you want to override */
}
```

**Any variable you leave out falls back to the panel's built-in defaults.** You only need to define the variables you want to change.

### Quick start

Download the example theme from **Admin Settings > Appearance > Themes > Download example**. It contains every supported variable with comments explaining what each one does.

## Complete Variable Reference

### Page Backgrounds

| Variable | Purpose | Default (light) | Default (dark) |
|---|---|---|---|
| `--theme-bg` | Main page background | `#ffffff` | `#141414` |
| `--theme-bg-secondary` | Sidebar, mobile bars, secondary surfaces | `#f5f5f5` | `#1a1a1a` |
| `--theme-bg-tertiary` | Third-level depth, nested cards | `#ececec` | `#222222` |
| `--theme-bg-card` | Card/panel background | `#f9f9f9` | `#1a1a1a` |
| `--theme-bg-hover` | Background on hover | `#eeeeee` | `#252525` |
| `--theme-bg-input` | Input field background | `#f0f0f0` | `#141414` |
| `--theme-bg-active-nav` | Active nav item fill | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.06)` |

### Borders

| Variable | Purpose |
|---|---|
| `--theme-border` | Standard border (cards, inputs, dividers) |
| `--theme-border-subtle` | Very subtle border (inner dividers) |
| `--theme-border-input` | Input field border |
| `--theme-border-accent` | Accent border (active nav, focused elements) |

### Text

| Variable | Purpose |
|---|---|
| `--theme-text` | Default body text |
| `--theme-text-strong` | Headings, bold text (highest contrast) |
| `--theme-text-muted` | Captions, metadata, secondary labels |
| `--theme-text-nav` | Nav link text (resting) |
| `--theme-text-nav-active` | Nav link text (active/hovered) |
| `--theme-text-placeholder` | Placeholder text in inputs |
| `--theme-text-code` | Code/terminal text |
| `--theme-text-link` | Link color |

### Accent / Brand

| Variable | Purpose |
|---|---|
| `--theme-accent` | Primary accent — buttons, links, active highlights |
| `--theme-accent-hover` | Accent on hover |
| `--theme-accent-text` | Text on accent background |
| `--theme-accent-subtle` | Subtle accent tint (badge backgrounds, etc.) |

### Status Colours

| Variable | Purpose |
|---|---|
| `--theme-success` | Success / online / running |
| `--theme-success-bg` | Success badge background |
| `--theme-warning` | Warning / starting / pending |
| `--theme-warning-bg` | Warning badge background |
| `--theme-danger` | Danger / error / stopped |
| `--theme-danger-bg` | Danger badge background |
| `--theme-info` | Info / neutral status |
| `--theme-info-bg` | Info badge background |

### Nav Chrome (Sidebar + Mobile)

| Variable | Purpose |
|---|---|
| `--theme-nav-bg` | Sidebar and mobile nav bar background |
| `--theme-nav-border` | Border between nav and content |
| `--theme-nav-text` | Nav link text (resting) |
| `--theme-nav-text-active` | Nav link text (active/focused) |
| `--theme-nav-icon` | Nav icon colour (resting) |
| `--theme-nav-icon-active` | Nav icon colour (active/focused) |

### Table

| Variable | Purpose |
|---|---|
| `--theme-table-header-bg` | Table header background |
| `--theme-table-row-hover` | Table row hover background |
| `--theme-table-divide` | Table divider lines |

### Badges / Pills

| Variable | Purpose |
|---|---|
| `--theme-badge-neutral-bg` | Neutral badge background |
| `--theme-badge-neutral-text` | Neutral badge text |
| `--theme-badge-blue-bg` | Blue badge background |
| `--theme-badge-blue-text` | Blue badge text |

### Buttons

| Variable | Purpose |
|---|---|
| `--theme-btn-secondary-bg` | Secondary button background |
| `--theme-btn-secondary-border` | Secondary button border |
| `--theme-btn-secondary-text` | Secondary button text |
| `--theme-btn-secondary-hover` | Secondary button hover |

### Toggle / Switch

| Variable | Purpose |
|---|---|
| `--theme-toggle-track` | Toggle switch track |
| `--theme-toggle-dot` | Toggle switch dot |

### Search

| Variable | Purpose |
|---|---|
| `--theme-search-bg` | Search input background |
| `--theme-search-border` | Search input border |
| `--theme-search-text` | Search input text |
| `--theme-search-results` | Search results dropdown background |

### Scrollbar

| Variable | Purpose |
|---|---|
| `--theme-scrollbar-track` | Scrollbar track |
| `--theme-scrollbar-thumb` | Scrollbar thumb |

### Code / Terminal

| Variable | Purpose |
|---|---|
| `--theme-code-bg` | Code block background |
| `--theme-code-text` | Code text |
| `--theme-code-border` | Code block border |

### Logo

| Variable | Purpose |
|---|---|
| `--theme-logo-bg` | Background behind the logo image in the nav |

### Typography

| Variable | Purpose | Default |
|---|---|---|
| `--theme-font-family` | Body font family | `'General Sans', ui-sans-serif, system-ui, sans-serif` |

### Border Radius

| Variable | Purpose | Default |
|---|---|---|
| `--theme-radius` | Standard border radius (buttons, cards, inputs) | `0.75rem` |
| `--theme-radius-lg` | Large border radius (modals, large cards) | `1rem` |
| `--theme-radius-root` | Root border radius (page-level) | `0` |

### Shadows

| Variable | Purpose | Default |
|---|---|---|
| `--theme-shadow` | Standard shadow (cards, dropdowns) | `0 6px 12px -10px rgb(0 0 0 / 0.32)` |
| `--theme-shadow-lg` | Large shadow (modals) | `0 8px 18px -14px rgb(0 0 0 / 0.34)` |
| `--theme-shadow-xl` | Extra-large shadow (toast, tooltips) | `0 18px 44px -28px rgb(0 0 0 / 0.45)` |

### Transitions

| Variable | Purpose | Default |
|---|---|---|
| `--theme-transition` | Transition duration | `150ms` |
| `--theme-transition-easing` | Transition easing curve | `cubic-bezier(0.4, 0, 0.2, 1)` |

## Installing a Theme

1. Zip your `info.json`, `light.css`, and `dark.css` files
2. Go to **Admin Settings > Appearance > Themes**
3. Click **Upload custom theme** and select your zip
4. Select your theme in the Light mode and/or Dark mode sections
5. Click **Save**

## Deleting a Theme

Go to **Admin Settings > Appearance > Themes** and click the trash icon next to any custom theme. Built-in themes cannot be deleted.

If the deleted theme was active, the panel automatically reverts to the default.

## Tips

- **Start from the example.** Download it, change colors, re-upload.
- **Test both modes.** Your light.css and dark.css should both be complete.
- **Use OKLCH for new colors** if you want perceptually uniform palette generation, but hex/rgb/hsl all work fine.
- **Keep it simple.** The best themes change 10-15 variables (accent, backgrounds, text). You don't need to touch every variable.
- **Contrast matters.** Body text needs ≥4.5:1 against its background. Check with a contrast checker.
