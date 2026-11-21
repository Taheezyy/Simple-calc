'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', 'calculator.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// Extract the pure-logic block and run it in a sandbox with a `module` object.
const m = html.match(/<script id="calc-logic">([\s\S]*?)<\/script>/);
assert.ok(m, 'calc-logic script block must exist');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox, { filename: 'calc-logic' });
const { createCalculator, formatNumber } = sandbox.module.exports;

const MINUS = '−';

// Drive the calculator with a compact key string. 'C' = AC, 'E' = equals.
function run(keys) {
  const c = createCalculator();
  for (const k of keys.replace(/\s+/g, '')) {
    if (/[0-9]/.test(k)) c.inputDigit(k);
    else if (k === '.') c.inputDecimal();
    else if ('+-*/'.includes(k)) c.inputOperator(k);
    else if (k === '=' || k === 'E') c.equals();
    else if (k === 'C') c.clear();
    else throw new Error('bad key ' + k);
  }
  return c;
}
const disp = (keys) => run(keys).getState().display;

test('exports exist', () => {
  assert.strictEqual(typeof createCalculator, 'function');
  assert.strictEqual(typeof formatNumber, 'function');
});

// ---- Acceptance tests ----
test('AT1', () => assert.strictEqual(disp('2+2='), '4'));
test('AT2', () => assert.strictEqual(disp('5/0='), 'Error'));
test('AT3', () => assert.strictEqual(disp('0.1+0.2='), '0.3'));
test('AT4', () => assert.strictEqual(disp('1..2'), '1.2'));
test('AT5', () => assert.strictEqual(disp('2+3*4='), '20'));
test('AT6', () => assert.strictEqual(disp('5+*2='), '10'));
test('AT7', () => assert.ok(['-3', MINUS + '3'].includes(disp('9-12='))));
test('AT8', () => assert.strictEqual(disp('7/2='), '3.5'));
test('AT9', () => {
  const d = disp('99999999*99999999=');
  assert.match(d, /e\+?\d+$/i, 'scientific notation expected, got ' + d);
  assert.ok(d.length <= 14, 'fits display: ' + d);
});
test('AT10', () => assert.strictEqual(disp('6=3'), '3'));
test('AT11', () => {
  const c = run('5/0=');
  assert.strictEqual(c.getState().display, 'Error');
  c.clear();
  assert.strictEqual(c.getState().display, '0');
});

// ---- Functional ----
test('F2 one decimal point per number; new number allows a new point', () => {
  assert.strictEqual(disp('1.2.3'), '1.23');
  assert.strictEqual(disp('1.5+2.5.5'), '2.55');
  assert.strictEqual(disp('....'), '0.');
});
test('F3 "." on empty entry shows "0."', () => {
  assert.strictEqual(disp('.'), '0.');
  assert.strictEqual(disp('5+.'), '0.');
  assert.strictEqual(disp('.5'), '0.5');
});
test('F4 no leading zeros', () => {
  assert.strictEqual(disp('07'), '7');
  assert.strictEqual(disp('000'), '0');
  assert.strictEqual(disp('0.05'), '0.05');
});
test('F5 12-digit cap', () => {
  assert.strictEqual(disp('1234567890123456'), '123456789012');
  assert.strictEqual(disp('1.2345678901234'), '1.23456789012');
  assert.strictEqual(disp('5+1234567890123'), '123456789012');
});
test('F8 chaining shows intermediate result', () => {
  const s = run('5+3+').getState();
  assert.strictEqual(s.display, '8');
  assert.strictEqual(run('5+3+2=').getState().display, '10');
  assert.strictEqual(run('10-4*2/3=').getState().display, '4');
});
test('F9 operator replacement', () => {
  const c = run('5+*');
  const s = c.getState();
  assert.strictEqual(s.pendingOperator, '*');
  assert.strictEqual(s.display, '5');
  assert.strictEqual(disp('5+-*/2='), '2.5');
});
test('F10 operator first uses 0 as first operand', () => {
  const s = run('+').getState();
  assert.strictEqual(s.pendingOperator, '+');
  assert.strictEqual(s.display, '0');
  assert.strictEqual(disp('+5='), '5');
  assert.strictEqual(disp('-5='), MINUS + '5');
});
test('F12 equals with nothing pending does nothing', () => {
  assert.strictEqual(disp('='), '0');
  const s = run('5=').getState();
  assert.strictEqual(s.display, '5');
  assert.strictEqual(s.pendingOperator, null);
  assert.strictEqual(s.isError, false);
  assert.strictEqual(disp('1.5='), '1.5');
});
test('F14 repeated equals has no effect', () => {
  assert.strictEqual(disp('2+2=='), '4');
  assert.strictEqual(disp('2+2====='), '4');
  const a = run('2+2=').getState();
  const b = run('2+2===').getState();
  assert.deepStrictEqual(b, a);
});
test('F13 digit after result starts fresh; operator continues', () => {
  assert.strictEqual(disp('2+2=5'), '5');
  assert.strictEqual(disp('2+2=5+1='), '6');
  assert.strictEqual(disp('2+2=+3='), '7');
  assert.strictEqual(disp('2+2=*3='), '12');
  assert.strictEqual(disp('2+2=.'), '0.');
});
test('F15 AC resets display, pending operator, equation', () => {
  const s = run('5+3C').getState();
  // JSON round-trip: getState() objects come from the vm realm (different Object prototype).
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), {
    display: '0', equation: '', isError: false,
    pendingOperator: null, highlightOperator: null,
  });
  assert.strictEqual(disp('5+3C2+2='), '4');
  const s2 = run('2+2=C').getState();
  assert.strictEqual(s2.equation, '');
});
test('F17 float noise rounding', () => {
  assert.strictEqual(disp('0.1+0.2='), '0.3');
  assert.strictEqual(disp('1/3='), '0.333333333333');
  assert.strictEqual(disp('0.7+0.1='), '0.8');
  assert.strictEqual(disp('2/3='), '0.666666666667');
  assert.ok(!/0000000|9999999/.test(disp('0.3-0.1=')), disp('0.3-0.1='));
});
test('F18 large and tiny results use scientific notation and fit (<= 15 chars)', () => {
  // Contract (F18 decision): exponential shows at most 9 significant digits;
  // bound is <= 15 chars including sign for 2-digit exponents.
  const big = disp('999999999999*999999999999=');
  assert.strictEqual(big, '1e+24');
  const tiny = disp('0.000001*0.000001=');
  assert.match(tiny, /e-\d+$/i, tiny);
  const tiny2 = disp('1/999999999999=');
  const neg = disp('0-999999999999*999999999999=');
  assert.ok(neg.startsWith(MINUS) || neg.startsWith('-'), neg);
  for (const d of [big, tiny, tiny2, neg, disp('99999999*99999999=')]) {
    assert.ok(d.length <= 15, 'too long: ' + d);
    assert.ok(!/Infinity|NaN/.test(d), d);
  }
  assert.match(big, /e\+?\d+$/i, big);
});
test('F19 error state', () => {
  const c = run('5/0=');
  const before = c.getState();
  assert.strictEqual(before.isError, true);
  assert.strictEqual(before.display, 'Error');
  c.inputOperator('+'); c.inputOperator('*'); c.equals();
  assert.deepStrictEqual(c.getState(), before, 'operators/= ignored in Error');
  c.inputDigit('7');
  const s = c.getState();
  assert.strictEqual(s.display, '7');
  assert.strictEqual(s.isError, false);
  assert.strictEqual(disp('5/0=9+1='), '10');
});
test('F19 0/0 and chained divide by zero are Error, never Infinity/NaN', () => {
  for (const k of ['0/0=', '5/0=', '5/0+', '3+4/0*', '0/0/0=', '1/0.0=', '5/0.']) {
    const d = disp(k);
    assert.ok(!/Infinity|NaN/.test(d), k + ' -> ' + d);
  }
  assert.strictEqual(disp('0/0='), 'Error');
  assert.strictEqual(disp('5/0+'), 'Error');
  assert.strictEqual(disp('3+4/0*'), 'Error');
  assert.strictEqual(run('0/0=').getState().equation === undefined, false);
});

// ---- highlightOperator ----
test('highlightOperator lifecycle', () => {
  const c = createCalculator();
  assert.strictEqual(c.getState().highlightOperator, null);
  c.inputDigit('5'); assert.strictEqual(c.getState().highlightOperator, null);
  c.inputOperator('+'); assert.strictEqual(c.getState().highlightOperator, '+');
  c.inputOperator('*'); assert.strictEqual(c.getState().highlightOperator, '*', 'moves on replacement');
  c.inputDigit('2'); assert.strictEqual(c.getState().highlightOperator, null, 'cleared on digit');
  c.inputOperator('-'); assert.strictEqual(c.getState().highlightOperator, '-');
  c.equals(); assert.strictEqual(c.getState().highlightOperator, null, 'cleared on =');
  c.inputOperator('+'); assert.strictEqual(c.getState().highlightOperator, '+');
  c.clear(); assert.strictEqual(c.getState().highlightOperator, null, 'cleared on AC');
  assert.strictEqual(run('5/0=').getState().highlightOperator, null, 'cleared on Error');
  assert.strictEqual(run('5/0+').getState().highlightOperator, null, 'cleared on Error via operator');
  assert.strictEqual(run('5+.').getState().highlightOperator, null, 'cleared on decimal');
});

// ---- Precision (suspected defect) ----
test('PRECISION 123456789012 + 0 = keeps 12-digit user entry intact', () => {
  assert.strictEqual(disp('123456789012'), '123456789012');
  assert.strictEqual(disp('123456789012+0='), '123456789012');
});

// ---- Static DOM checks ----
const buttonTags = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || [];
test('static: buttons exist (17 per U2 grid)', () => assert.ok(buttonTags.length === 17, String(buttonTags.length)));
test('static: every <button> has non-empty aria-label', () => {
  for (const b of buttonTags) {
    assert.match(b.match(/<button\b[^>]*>/i)[0], /aria-label="[^"]+"/, b);
  }
});
test('static: no external src/href', () => {
  const refs = html.match(/\b(?:src|href)\s*=\s*["'][^"']*["']/gi) || [];
  for (const r of refs) assert.doesNotMatch(r, /https?:|\/\//i, r);
  assert.doesNotMatch(html, /@import\s+url\(\s*["']?https?:/i);
  assert.doesNotMatch(html, /<link\b[^>]*stylesheet/i);
});
test('static: theme colours present', () => {
  for (const c of ['#ff9500', '#333333', '#a5a5a5']) {
    assert.ok(html.toLowerCase().includes(c), c);
  }
});
test('static: excluded-feature buttons absent', () => {
  for (const b of buttonTags) {
    assert.doesNotMatch(b, /backspace|delete|⌫|±|&plusmn;|plus-?minus|toggle-?sign|negate|%|percent|&#37;|&#177;|history|memory/i, b);
  }
});

// ---- Review cycle 1 contract updates ----
test('F12 "12 . =" leaves entry unchanged; next digit starts fresh', () => {
  const c = run('12.=');
  const s = c.getState();
  assert.strictEqual(s.display, '12.');
  assert.strictEqual(s.pendingOperator, null);
  assert.strictEqual(s.isError, false);
  assert.strictEqual(disp('12.=3'), '3');
});
test('Rounding: 123456 x 654321 = 80779853376', () => {
  assert.strictEqual(disp('123456*654321='), '80779853376');
});
test('Cancellation: 1.00000000001 - 1 = 1e-11', () => {
  assert.strictEqual(disp('1.00000000001-1='), '1e-11');
});
test('Cancellation: 100000.000001 - 100000 = 0.000001', () => {
  assert.strictEqual(disp('100000.000001-100000='), '0.000001');
});
test('inputOperator("constructor") is ignored: no pending operator, no Error', () => {
  const c = createCalculator();
  c.inputDigit('5');
  c.inputOperator('constructor');
  let s = c.getState();
  assert.strictEqual(s.pendingOperator, null);
  assert.strictEqual(s.isError, false);
  assert.strictEqual(s.display, '5');
  for (const bad of ['toString', '__proto__', 'hasOwnProperty', '', undefined, null, '++']) {
    c.inputOperator(bad);
    s = c.getState();
    assert.strictEqual(s.pendingOperator, null, String(bad));
    assert.strictEqual(s.isError, false, String(bad));
  }
});
test('formatNumber: exponential thresholds (pre-rounded inputs)', () => {
  assert.match(formatNumber(1e12), /e\+?12$/);
  assert.strictEqual(formatNumber(999999999999), '999999999999');
  assert.match(formatNumber(5e-7), /e-7$/);
  assert.strictEqual(formatNumber(0.000001), '0.000001');
  assert.strictEqual(formatNumber(-0), '0');
  assert.strictEqual(formatNumber(-3), MINUS + '3');
  const third = Number((1 / 3).toPrecision(12)); // pre-rounded per contract
  assert.ok(formatNumber(third).length <= 14, formatNumber(third));
  assert.strictEqual(formatNumber(Infinity), 'Error');
});
test('static: operator buttons have aria-pressed', () => {
  const ops = buttonTags.filter((b) => /data-action="operator"/.test(b));
  assert.strictEqual(ops.length, 4);
  for (const b of ops) assert.match(b, /aria-pressed="(true|false)"/, b);
});
test('static: AC aria-label contains "AC"', () => {
  const ac = buttonTags.find((b) => /data-action="clear"/.test(b));
  assert.ok(ac, 'AC button exists');
  assert.match(ac.match(/aria-label="([^"]*)"/)[1], /AC/);
});
