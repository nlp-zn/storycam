---
name: Culture Engine High-Energy Dark Mode
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1b'
  surface-container: '#1f1f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#303030'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#ffb1c3'
  on-secondary: '#66002c'
  secondary-container: '#ff4b89'
  on-secondary-container: '#590026'
  tertiary: '#fff3f0'
  on-tertiary: '#5a1b00'
  tertiary-container: '#ffcfbe'
  on-tertiary-container: '#a83a00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffd9e0'
  secondary-fixed-dim: '#ffb1c3'
  on-secondary-fixed: '#3f0019'
  on-secondary-fixed-variant: '#8f0041'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb59a'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#802a00'
  background: '#131313'
  on-background: '#e2e2e2'
  surface-variant: '#353535'
typography:
  display-xl:
    fontFamily: Manrope
    fontSize: 80px
    fontWeight: '800'
    lineHeight: 100%
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 110%
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 120%
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 160%
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 160%
    letterSpacing: 0em
  label-caps:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 100%
    letterSpacing: 0.1em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin: 40px
  container-max: 1440px
  pill-padding-x: 32px
  pill-padding-y: 16px
---

## Brand & Style

This design system is built for high-impact digital experiences that demand attention and evoke a cinematic, high-energy emotional response. It is a fusion of **High-Contrast / Bold** aesthetics with **Glassmorphism** overlays, optimized for a premium dark-mode-only environment. 

The brand personality is authoritative yet experimental, drawing inspiration from contemporary cultural engines and modern editorial design. It targets a demographic that values speed, aesthetic precision, and digital sophistication. The UI feels alive, using vibrant neon gradients to punctuate a deep black void, creating a sense of infinite depth and rhythmic energy.

## Colors

The palette is anchored in an absolute deep black (#000000) to maximize contrast and eliminate visual noise. The primary accent is a vibrant Cyan (#00F0FF), supported by a Secondary Neon Pink (#FF007A) and a Tertiary Intense Orange (#FF5C00). 

Color is used sparingly but aggressively. Interactive states and primary actions utilize high-energy linear gradients. Background surfaces are layered using varying opacities of white or the primary colors to create "glass" effects, ensuring that even in a dark environment, the hierarchy is crystal clear.

## Typography

Typography in this design system acts as a structural element. Headlines are set in **Manrope**, utilizing its boldest weights and forced uppercase transformation to create a "Bloco" inspired editorial feel. High tracking (letter spacing) is applied to small labels to ensure legibility against dark backgrounds, while headlines use tight tracking for a dense, cinematic impact.

Body text transitions to **Inter** to maintain maximum readability and a neutral, systematic tone that balances the aggressive headline style. Use "Display-XL" only for hero moments or section transitions to maintain visual rhythm.

## Layout & Spacing

The layout follows a **Fixed Grid** model with a 12-column structure for desktop, transitioning to a fluid single-column for mobile. Large margins (40px+) are utilized to create a "framed" cinematic look, pushing content toward the center to command focus.

The spacing rhythm is strictly based on an 8px scale. White space is treated as "negative energy"—it is not just empty, but a deliberate gap that allows the neon elements to breathe. Components should use generous internal padding (pill-padding) to reinforce the soft, rounded aesthetic within the rigid grid.

## Elevation & Depth

Depth is achieved through **Glassmorphism** and **Tonal Layers** rather than traditional shadows. Because the background is pure black, shadows are invisible unless they are "glows."

1.  **Level 0 (Base):** Pure #000000.
2.  **Level 1 (Surface):** Semi-transparent white (5%) with a 20px backdrop blur.
3.  **Level 2 (Active):** Solid dark grey (#1A1A1A) with thin 1px borders using the primary gradient.
4.  **Level 3 (Overlay):** High-opacity glass with an outer "neon glow" (a diffused shadow using the primary_color_hex at 20% opacity).

This stacking creates a sense of floating modules in a digital void.

## Shapes

The shape language is defined by the **Pill-shaped** (Level 3) roundedness. This creates a striking contrast with the sharp, uppercase typography. All interactive elements—buttons, inputs, tags, and badges—must use the maximum border-radius to achieve a full-pill effect.

Cards and larger containers use `rounded-xl` (3rem/48px) to soften the overall composition. This creates a "tactile" and friendly feel that balances the aggressive high-contrast color palette.

## Components

-   **Buttons:** Primary buttons are full-pill shapes with the "Electric Sunset" gradient and black uppercase text. Secondary buttons use a 1px gradient border with transparent backgrounds.
-   **Inputs:** Pill-shaped containers with a 5% white fill and a 1px border that glows (Cyan) when focused.
-   **Chips/Tags:** Small pill shapes with solid neon fills and black text for high-status visibility.
-   **Cards:** High-blur glass containers with `rounded-xl` corners. Borders are minimal, utilizing a top-down linear gradient stroke (white to transparent).
-   **Progress Bars:** Thin, high-energy lines using the "Cyan Surge" gradient, often accompanied by a subtle outer glow.
-   **Lists:** Items separated by low-opacity white dividers (10%), with large vertical padding to maintain the "cinematic" spaciousness.