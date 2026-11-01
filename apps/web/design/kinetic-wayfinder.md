---
name: Kinetic Wayfinder
colors:
  surface: '#f9f9ff'
  surface-dim: '#cadaff'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e8eeff'
  surface-container-high: '#dfe8ff'
  surface-container-highest: '#d7e3ff'
  on-surface: '#091b37'
  on-surface-variant: '#3f4753'
  inverse-surface: '#20304d'
  inverse-on-surface: '#ecf0ff'
  outline: '#707884'
  outline-variant: '#bfc7d5'
  surface-tint: '#0061a5'
  primary: '#0061a5'
  on-primary: '#ffffff'
  primary-container: '#0099ff'
  on-primary-container: '#002f54'
  inverse-primary: '#9fcaff'
  secondary: '#006e2a'
  on-secondary: '#ffffff'
  secondary-container: '#5cfd80'
  on-secondary-container: '#00732c'
  tertiary: '#775a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#bb8f00'
  on-tertiary-container: '#3b2b00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4ff'
  primary-fixed-dim: '#9fcaff'
  on-primary-fixed: '#001d36'
  on-primary-fixed-variant: '#00497e'
  secondary-fixed: '#69ff87'
  secondary-fixed-dim: '#3ce36a'
  on-secondary-fixed: '#002108'
  on-secondary-fixed-variant: '#00531e'
  tertiary-fixed: '#ffdf99'
  tertiary-fixed-dim: '#f7be00'
  on-tertiary-fixed: '#251a00'
  on-tertiary-fixed-variant: '#5a4300'
  background: '#f9f9ff'
  on-background: '#091b37'
  surface-variant: '#d7e3ff'
  sky-cyan: '#33CCFF'
  surface-sky-tint: '#F0F7FF'
  surface-sky-subtle: '#E1F0FF'
  alert-coral: '#FF5722'
  ink-navy-deep: '#0E1E38'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 56px
    fontWeight: '800'
    lineHeight: 64px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Outfit
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-md:
    fontFamily: Outfit
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-lg:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: '800'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xxs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-xxl: 3rem
---

## Brand & Style

This design system translates energetic navigation utility into a polished, daytime-optimized digital experience. It pairs the high-visibility, expressive personality of modern wayfinding with the architectural discipline of Material Design 3. The aesthetic blends rounded geometric dynamism, punchy feedback accents, and tactile surfaces to produce an atmosphere that feels immediate, welcoming, and hyper-legible under harsh daylight.

The design language moves away from muted enterprise minimalism, leaning instead into tactile, friendly ergonomics: bold typography, chunky interactive targets, deep navy text contrast, and crisp atmospheric blues. It serves drivers, commuters, and real-time community contributors who need zero-latency cognitive processing combined with warm, approachable guidance.

## Colors

The palette balances day-mode luminescence with high-contrast road legibility:

- **Primary (`#0099FF` / `sky-cyan: #33CCFF`):** Powers directional beacons, primary CTA buttons, active route segments, and focused states.
- **Secondary (`#00C853`):** Designates unobstructed traffic flows, affirmative confirmations, saved places, and live updates.
- **Tertiary (`#FFC400`):** Communicates dynamic alerts, construction notices, traffic slowing, and points of interest.
- **Named Accents:**
  - `alert-coral` (`#FF5722`): Highlights hazard warnings, traffic stops, and high-priority incident banners.
  - `surface-sky-tint` (`#F0F7FF`) & `surface-sky-subtle` (`#E1F0FF`): Provide tiered background environments that reduce daylight glare while keeping surfaces distinct from pure `#FFFFFF`.
- **Neutral & Ink Navy (`#182945` / `#0E1E38`):** Form the typographic spine, ensuring all critical navigation copy meets AAA accessibility against bright surfaces.

## Typography

Typography prioritizes rapid glanceability:

- **Outfit (Headlines & Display):** Geometric, buoyant, and structural. Its wide apertures and balanced proportions offer character without sacrificing instant recognition. Used for speed readouts, exit indicators, and destination headers.
- **Manrope (Body & Labels):** Sturdy, neutral, and readable across small footprints. With a solid x-height and clear numerals, it powers distance markers, ETA details, turn-by-turn lists, and compact card metadata.

## Layout & Spacing

The layout structure uses an 8-point base grid tailored for dynamic touch interfaces and floating operational dashboards:

- **Mobile:** 4-column layout with 16px margins and gutters. Bottom sheets and glanceable route strips dominate the lower thumb-zone.
- **Tablet:** 8-column layout with 32px margins. Splits the display into persistent floating maneuver panels alongside ambient map visualizers.
- **Desktop:** 12-column layout capped at 1440px max width with 48px margins.

Interactive touch targets maintain a 48px minimum bounding box. Spacing around navigational cards avoids dense micro-gaps, relying on generous inner padding (`space-md` to `space-lg`) to ensure effortless touch accuracy on moving viewports.

## Elevation & Depth

Visual hierarchy leverages Material 3 tonal surfaces paired with tactile, ambient elevation:

- **Level 0 (Flat Ground):** Base map and atmospheric canvases rendered in `#FFFFFF` or `#F0F7FF`.
- **Level 1 (Docked Containers):** Sticky bottom app bars and docked navigation trays. Rest on a 1px solid stroke (`#E1F0FF`) with a soft drop shadow: `0px 2px 8px rgba(24, 41, 69, 0.04)`.
- **Level 2 (Resting Cards & Overlays):** Detached cards, detour prompts, and quick-filter trays. Supported by `0px 6px 16px rgba(24, 41, 69, 0.08)`.
- **Level 3 (Interactive Controls & Floating Action Buttons):** Maneuver navigation badges and report triggers. Elevated with `0px 10px 24px rgba(0, 153, 255, 0.18)` and `0px 4px 8px rgba(24, 41, 69, 0.08)`.
- **Level 4 (Modals & Hazard Sheets):** Incident confirmations and road closures. Feature an ambient blur overlay with `0px 16px 36px rgba(14, 30, 56, 0.14)`.

## Shapes

The design system incorporates roundedness level `2`:

- **Standard Components (0.5rem / 8px):** Input fields, segmented pickers, and compact menu panels.
- **Large Cards & Sheets (1rem / 16px):** Turn guidance tiles, ETA summaries, and incident reporting cards.
- **Hero Containers & Bottom Sheets (1.5rem / 24px):** Top maneuver indicators and sliding community trays.
- **Pill Badges & Buttons (Full Radius / 9999px):** Status chips, route filter buttons, FABs, and action callouts.

## Components

### Buttons
- **Primary:** Filled in `#0099FF` with `#FFFFFF` label text, 48px height, 16px radius (`rounded-lg`) or fully pill-shaped for driving modes. In Jetpack Compose styling, interactions provide a slight scale down (`0.98`) and haptic tap response.
- **Secondary:** Surface background `#F0F7FF`, bordered with a 1.5px stroke of `#0099FF`, ink navy text.
- **Tertiary / Action Badges:** Saturated yellow (`#FFC400`) or road green (`#00C853`) with solid `#182945` typography for high-visibility decisions.

### Chips & Badges
- **Pill Filters:** Pill-shaped (`rounded-full`), 36px height, 12px horizontal padding. Unselected: `#FFFFFF` background with 1px `#E1F0FF` border. Selected: `#0099FF` surface with white text and an integrated category icon.
- **Hazard & Alert Badges:** Tinted backing (e.g., `#FF5722` at 12% opacity) framed with an alert-coral icon and bold navy micro-label.

### Cards & Route Guidance Panels
- **Turn-by-Turn Card:** Resting at Level 2 elevation, `#FFFFFF` fill, 16px border radius, bounded by a 1px `#E1F0FF` outline. Features a bold directional glyph, high-contrast street name in `headline-md`, and secondary lane assistance indicators.
- **Incident Summary Card:** Uses an alert-toned side accent or full-tint header (`#FFC400` or `#FF5722`) with actionable dismiss/confirm pill buttons.

### Lists & Waypoints
- **Waypoints:** Connected by vertical dotted or solid track lines in `#0099FF`. Rows feature 12px vertical padding, 48px leading icon containers with soft sky backgrounds (`#F0F7FF`), and distinct ETA typography.

### Input Fields
- **Search & Destination Inputs:** 52px height, pill or 12px rounded boundaries, `#F0F7FF` background, and zero border at rest. On focus, surfaces switch to `#FFFFFF` with a 2px `#0099FF` outline and Level 2 elevation.

### Checkboxes, Radios, & Switches
- **Switches:** Jetpack Compose Material 3 thumb styling with high-contrast active tracks in `#0099FF` and unselected tracks in `#E1F0FF`. Thumb features a crisp resting drop-shadow.
- **Selection Controls:** Rounded checkboxes (6px radius) and concentric circular radios filled with `#0099FF` on active selection.