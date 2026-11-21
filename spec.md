---
status: built
built: 2026-11-22
title: Calculator App MVP
---

# Calculator App — MVP Spec

## Objective
A basic four-function calculator web app with a black/grey/orange theme, built as a single self-contained HTML file, correct on the edge cases below.

Stack: single-file vanilla HTML/CSS/JS (`calculator.html`), no external dependencies.

## Decisions
- Evaluation: immediate execution (2 + 3 × 4 = 20)
- Theme: black / grey / orange

## EXCLUDED scope (do not build)
Backspace (⌫), ± toggle, %, history list, light/dark toggle, memory keys, scientific functions, operator precedence.

## Functional
- F1 Digits 0–9 append to current number
- F2 One decimal point per number; extra "." ignored
- F3 "." on empty entry shows "0."
- F4 No leading zeros (0 then 7 → 7)
- F5 Max 12 digits per entry (further digits ignored)
- F6 + − × ÷
- F7 Immediate execution, left to right
- F8 Chaining: 5 + 3 + shows 8
- F9 Consecutive operators: last one wins (5 + × 2 = 10)
- F10 Operator first uses 0 as first operand
- F11 = evaluates and shows result
- F12 = with nothing pending does nothing
- F13 After result: digit starts new calc; operator continues from result
- F14 Repeated = has no effect
- F15 AC resets display, pending operator, equation line
- F17 Round floating-point noise (0.1 + 0.2 → 0.3)
- F18 Very large/small results → scientific notation, never overflow the display
- F19 Divide by zero → "Error"; operators/= ignored until AC or a digit (digit starts fresh); never "Infinity"/"NaN"

## UI/UX
- U1 Two-line display: small equation line above, large current value below
- U2 4 × 5 grid: Row1 AC (spans 3), ÷ | 7 8 9 × | 4 5 6 − | 1 2 3 + | 0 (spans 2) . =
- U3 Responsive 320 px → desktop; buttons ≥ 44 px
- U4 Colours: background/display black #000000; display text white, equation line #a5a5a5; digit buttons #333333 white text; AC #a5a5a5 black text; operators and = #ff9500 white text; selected operator white bg with orange text (until next digit); "Error" in orange
- U5 Hover ~10% lighter; press scales to 0.95; round buttons, pill-shaped 0 and AC
- U6 Keyboard: digits, . + - * /, Enter (and =) equals, Esc = AC
- U7 aria-label on every button; readable contrast

## Technical
- T1 Single HTML file, no external dependencies
- T2 Calculator logic in its own object/functions separate from DOM code, testable from Node (e.g. logic exposed via `module.exports` when `module` exists, or extractable script block)
- T3 All CSS scoped under a .calc container

## Acceptance tests
- AT1  2 + 2 = → 4
- AT2  5 ÷ 0 = → Error
- AT3  0.1 + 0.2 = → 0.3
- AT4  1 . . 2 → 1.2
- AT5  2 + 3 × 4 = → 20
- AT6  5 + × 2 = → 10
- AT7  9 − 12 = → −3 (display may use "-3" or "−3")
- AT8  7 ÷ 2 = → 3.5
- AT9  99999999 × 99999999 = → scientific notation, fits display
- AT10 6 = then 3 → 3
- AT11 Error, then AC → 0
