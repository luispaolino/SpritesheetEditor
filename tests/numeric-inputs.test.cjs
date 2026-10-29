const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const arithmetic = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'numeric-inputs.js'), 'utf8'), arithmetic);

test('fields support the four basic operations and standard precedence', () => {
  for (const [expression, expected] of [['150+20',170], ['150-25',125], ['64*2',128], ['300/2',150], ['10+4*3-8/2',18], ['20/2/2',5]]) {
    assert.equal(arithmetic.evaluateNumericExpression(expression), expected);
  }
});

test('expressions support decimals, negative values, whitespace, and parentheses', () => {
  for (const [expression, expected] of [[' (150 + 20) / 2 ',85], ['-4*-3',12], ['150+-20',130], ['.5 + 1.25',1.75], ['2e2/4',50]]) {
    assert.equal(arithmetic.evaluateNumericExpression(expression), expected);
  }
});

test('invalid, nonfinite, and executable expressions are rejected', () => {
  for (const expression of ['', '150+', '2(3)', '1/0', '0/0', '1e309', '10**2', '(1+2', 'Math.random()', 'alert(1)', '1;2', '0x10']) {
    assert.throws(() => arithmetic.evaluateNumericExpression(expression), undefined, expression);
  }
});

test('excessive nesting and input length are rejected', () => {
  assert.throws(() => arithmetic.evaluateNumericExpression('('.repeat(33) + '1' + ')'.repeat(33)));
  assert.throws(() => arithmetic.evaluateNumericExpression('1+'.repeat(300) + '1'));
});

test('results honor integer, decimal, and bounded field constraints', () => {
  const normalize = arithmetic.normalizeNumericInputValue;
  assert.equal(normalize({ min: '', max: '', step: '1' }, 37.5), 38);
  assert.equal(normalize({ min: '0.01', max: '', step: '0.01' }, 1/3), 0.33);
  assert.equal(normalize({ min: '0', max: '255', step: '1' }, 300), 255);
  assert.equal(normalize({ min: '1', max: '100', step: '1' }, -30), 1);
  assert.equal(normalize({ min: '', max: '', step: 'any' }, -1.25), -1.25);
});

test('rounding removes floating point noise without producing infinity', () => {
  const normalize = arithmetic.normalizeNumericInputValue;
  assert.equal(normalize({ min: '', max: '', step: '.1' }, 0.1+0.2), 0.3);
  assert.ok(Number.isFinite(normalize({ min: '', max: '', step: '.01' }, Number.MAX_VALUE)));
});
