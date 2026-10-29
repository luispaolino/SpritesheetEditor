// Parse arithmetic directly so fields never execute JavaScript.
function evaluateNumericExpression(source) {
  const text = String(source).trim();
  if (!text || text.length > 512) throw new SyntaxError('Enter a number or a basic math expression.');
  let index = 0, depth = 0;
  const space = () => { while (/\s/.test(text[index] || '') && index < text.length) index++; };
  const finite = value => {
    if (!Number.isFinite(value)) throw new RangeError('The result must be a finite number.');
    return value;
  };
  function factor() {
    space();
    let sign = 1;
    while (text[index] === '+' || text[index] === '-') {
      if (text[index++] === '-') sign *= -1;
      space();
    }
    let value;
    if (text[index] === '(') {
      if (++depth > 32) throw new SyntaxError('Too many nested parentheses.');
      index++; value = sum(); space();
      if (text[index++] !== ')') throw new SyntaxError('Close the parentheses.');
      depth--;
    } else {
      const token = text.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!token) throw new SyntaxError('Enter a number after the operator.');
      value = finite(Number(token[0])); index += token[0].length;
    }
    return finite(sign * value);
  }
  function product() {
    let value = factor(); space();
    while (text[index] === '*' || text[index] === '/') {
      const operator = text[index++], next = factor();
      value = finite(operator === '*' ? value * next : value / next); space();
    }
    return value;
  }
  function sum() {
    let value = product(); space();
    while (text[index] === '+' || text[index] === '-') {
      const operator = text[index++], next = product();
      value = finite(operator === '+' ? value + next : value - next); space();
    }
    return value;
  }
  const result = sum(); space();
  if (index !== text.length) throw new SyntaxError('Use numbers, +, -, *, /, and parentheses.');
  return result;
}

function normalizeNumericInputValue(input, value) {
  const min = input.min === '' ? -Infinity : Number(input.min);
  const max = input.max === '' ? Infinity : Number(input.max);
  const step = input.step === 'any' ? 0 : Number(input.step || 1);
  value = Math.min(max, Math.max(min, value));
  if (Number.isFinite(step) && step > 0) {
    const base = Number.isFinite(min) ? min : 0;
    const stepped = base + Math.round((value - base) / step) * step;
    if (Number.isFinite(stepped)) value = stepped;
  }
  value = Math.min(max, Math.max(min, value));
  const rounded = Number(value.toPrecision(15));
  return Number.isFinite(rounded) ? rounded : value;
}

function initNumericInputs() {
  const records = new WeakMap();
  const plainNumber = value => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) && Number.isFinite(Number(value));
  function prepare(input) {
    if (!input.matches('input[type="number"]') || records.has(input)) return;
    records.set(input, { last: input.value, pending: false, emitting: false });
    input.dataset.numericInput = '';
    input.type = 'text';
    input.inputMode = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
  }
  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('input[type="number"]')) prepare(root);
    root.querySelectorAll('input[type="number"]').forEach(prepare);
  }
  scan(document.documentElement);
  new MutationObserver(changes => changes.forEach(change => change.addedNodes.forEach(scan)))
    .observe(document.body, { childList: true, subtree: true });
  function emit(input, type) {
    const record = records.get(input);
    record.emitting = true;
    input.dataset.numericCommitting = '';
    try { input.dispatchEvent(new Event(type, { bubbles: true })); }
    finally { record.emitting = false; delete input.dataset.numericCommitting; }
  }
  function commit(input, { change = true, restoreInvalid = false } = {}) {
    const record = records.get(input);
    if (!record || input.disabled || input.readOnly) return false;
    let result;
    try { result = normalizeNumericInputValue(input, evaluateNumericExpression(input.value)); }
    catch (_) {
      if (restoreInvalid) { input.value = record.last; input.removeAttribute('aria-invalid'); record.pending = false; }
      else input.setAttribute('aria-invalid', 'true');
      return false;
    }
    const previous = record.last, pending = record.pending;
    input.value = String(result);
    input.removeAttribute('aria-invalid');
    record.pending = false;
    if (pending || input.value !== previous) emit(input, 'input');
    if (change) emit(input, 'change');
    record.last = input.value;
    return true;
  }
  document.addEventListener('focusin', event => {
    const input = event.target;
    if (input.matches?.('input[type="number"]')) prepare(input);
    const record = records.get(input);
    if (record) { record.last = input.value; record.pending = false; }
  }, true);
  document.addEventListener('input', event => {
    const input = event.target, record = records.get(input);
    if (!record || record.emitting) return;
    input.removeAttribute('aria-invalid');
    // Keep unfinished expressions away from the existing live numeric handlers.
    if (record.pending || !plainNumber(input.value)) {
      record.pending = true; event.stopImmediatePropagation();
    } else record.last = input.value;
  }, true);
  document.addEventListener('change', event => {
    const record = records.get(event.target);
    if (!record || record.emitting) return;
    if (!commit(event.target, { change: false, restoreInvalid: true })) return;
  }, true);
  document.addEventListener('blur', event => {
    const record = records.get(event.target);
    if (record?.pending) commit(event.target, { restoreInvalid: true });
  }, true);
  document.addEventListener('keydown', event => {
    const input = event.target, record = records.get(input);
    if (!record || input.disabled || input.readOnly || event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); commit(input);
    } else if (event.key === 'Escape' && record.pending) {
      event.preventDefault(); event.stopPropagation();
      input.value = record.last; input.removeAttribute('aria-invalid'); record.pending = false;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); event.stopPropagation();
      if (record.pending && !commit(input, { change: false })) return;
      const step = Number(input.step) || 1;
      input.value = String(normalizeNumericInputValue(input, (Number(input.value) || 0) + (event.key === 'ArrowUp' ? step : -step)));
      emit(input, 'input'); record.last = input.value;
    }
  }, true);
}
