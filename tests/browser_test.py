"""Real-browser UI tests for calculator.html (clicks, keyboard, layout)."""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = (HERE.parent / "calculator.html").as_uri()
# Screenshots go to tests/screenshots/ (ignored by git).
SHOTS = HERE / "screenshots"
SHOTS.mkdir(exist_ok=True)
# Optional: set CHROME_PATH to use an installed Chrome instead of Playwright's Chromium.
CHROME_PATH = os.environ.get("CHROME_PATH")

LABEL = {"+": "plus", "-": "minus", "*": "multiply", "/": "divide",
         "=": "equals", ".": "decimal point", "AC": "AC, all clear"}

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def display(page):
    return page.locator('[role="status"]').inner_text().strip()


def press_buttons(page, keys):
    page.locator(f'button[aria-label="{LABEL["AC"]}"]').click()
    for k in keys:
        if k in LABEL:
            page.locator(f'button[aria-label="{LABEL[k]}"]').click()
        else:
            page.locator(f'button:text-is("{k}")').click()


def norm(s):
    return s.replace("−", "-")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME_PATH) if CHROME_PATH else p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)

    # --- Acceptance tests by clicking ---
    ats = [
        ("AT1", ["2", "+", "2", "="], "4"),
        ("AT2", ["5", "/", "0", "="], "Error"),
        ("AT3", ["0", ".", "1", "+", "0", ".", "2", "="], "0.3"),
        ("AT4", ["1", ".", ".", "2"], "1.2"),
        ("AT5", ["2", "+", "3", "*", "4", "="], "20"),
        ("AT6", ["5", "+", "*", "2", "="], "10"),
        ("AT7", ["9", "-", "1", "2", "="], "-3"),
        ("AT8", ["7", "/", "2", "="], "3.5"),
        ("AT9", list("99999999") + ["*"] + list("99999999") + ["="], "9.9999998e+15"),
        ("AT10", ["6", "=", "3"], "3"),
        ("AT11", ["5", "/", "0", "=", "AC"], "0"),
    ]
    for name, keys, want in ats:
        press_buttons(page, keys)
        got = norm(display(page))
        record(f"{name} click {' '.join(keys)}", got == want, f"got {got!r}")

    # --- Keyboard ---
    def kb(seq, want, name):
        page.keyboard.press("Escape")
        for k in seq:
            page.keyboard.press(k)
        got = norm(display(page))
        record(name, got == want, f"got {got!r}")

    kb(["1", "2", "+", "7", "Enter"], "19", "Keyboard 12+7 Enter")
    kb(["8", "*", "3", "="], "24", "Keyboard 8*3 =")
    kb(["9", "/", "4", "Enter"], "2.25", "Keyboard 9/4 Enter (slash not hijacked)")
    kb(["5", "-", "8", "Enter"], "-3", "Keyboard 5-8")
    kb(["4", "Escape"], "0", "Keyboard Esc clears")

    # Enter after a mouse click on a digit must evaluate, not repeat the digit
    press_buttons(page, ["3", "+"])
    page.locator('button:text-is("7")').click()
    page.keyboard.press("Enter")
    got = norm(display(page))
    record("Enter after clicking a digit evaluates once", got == "10", f"got {got!r}")

    # Selected operator highlight + aria-pressed
    press_buttons(page, ["5", "+"])
    plus = page.locator('button[aria-label="plus"]')
    record("Operator aria-pressed while pending", plus.get_attribute("aria-pressed") == "true")
    bg = plus.evaluate("e => getComputedStyle(e).backgroundColor")
    record("Selected operator is white", bg == "rgb(255, 255, 255)", bg)
    page.locator('button:text-is("2")').click()
    record("Highlight cleared after digit", plus.get_attribute("aria-pressed") == "false")

    # Error state colour and dimmed operators
    press_buttons(page, ["5", "/", "0", "="])
    col = page.locator('[role="status"]').evaluate("e => getComputedStyle(e).color")
    record("Error shown in orange", col == "rgb(255, 149, 0)", col)
    record("Operators aria-disabled in Error",
           page.locator('button[aria-label="plus"]').get_attribute("aria-disabled") == "true")

    # Colours per U4
    def bgc(sel):
        return page.locator(sel).first.evaluate("e => getComputedStyle(e).backgroundColor")
    press_buttons(page, [])
    record("Digit button #333333", bgc('button:text-is("7")') == "rgb(51, 51, 51)", bgc('button:text-is("7")'))
    record("AC button #a5a5a5", bgc(f'button[aria-label="{LABEL["AC"]}"]') == "rgb(165, 165, 165)")
    record("Equals button #ff9500", bgc('button[aria-label="equals"]') == "rgb(255, 149, 0)")

    page.screenshot(path=f"{SHOTS}/desktop.png")

    # Focus ring visible via keyboard
    page.keyboard.press("Tab")
    outline = page.evaluate("() => { const e=document.activeElement; const s=getComputedStyle(e); return e.tagName + ' ' + s.outlineStyle + ' ' + s.outlineWidth; }")
    record("Keyboard focus ring visible", "BUTTON" in outline and "none" not in outline, outline)

    # --- Mobile layout at 320px ---
    for w, h in [(320, 568), (375, 812)]:
        page.set_viewport_size({"width": w, "height": h})
        page.goto(URL)
        sizes = page.eval_on_selector_all(".calc button", "bs => bs.map(b => {const r=b.getBoundingClientRect(); return [r.width, r.height, r.right]})")
        minw = min(s[0] for s in sizes)
        minh = min(s[1] for s in sizes)
        maxr = max(s[2] for s in sizes)
        record(f"{w}px: buttons >= 44px", minw >= 44 and minh >= 44, f"min {minw:.0f}x{minh:.0f}")
        record(f"{w}px: no horizontal overflow", maxr <= w and page.evaluate("document.documentElement.scrollWidth") <= w,
               f"right edge {maxr:.0f}")
        # long value fits
        press_buttons(page, list("999999999999"))
        fits = page.locator('[role="status"]').evaluate("e => e.scrollWidth <= e.clientWidth")
        record(f"{w}px: 12-digit entry fits display", fits)
        press_buttons(page, list("999999999999") + ["*"] + list("999999999999") + ["="])
        record(f"{w}px: huge result fits", page.locator('[role="status"]').evaluate("e => e.scrollWidth <= e.clientWidth"),
               norm(display(page)))
        press_buttons(page, ["1", "2", "+", "7"])
        page.screenshot(path=f"{SHOTS}/mobile_{w}.png")

    record("No console errors", not errors, "; ".join(errors))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
