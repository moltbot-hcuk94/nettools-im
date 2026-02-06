// Chmod Helper
// Convert between octal, symbolic, and rwx strings (incl. setuid/setgid/sticky)
(function() {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const CHECKS = [
    'u-r','u-w','u-x','u-s',
    'g-r','g-w','g-x','g-s',
    'o-r','o-w','o-x','o-t'
  ];

  function showError(msg) {
    const el = $('chmod-error');
    el.querySelector('span').textContent = msg;
    el.classList.remove('hidden');
  }

  function clearError() {
    $('chmod-error').classList.add('hidden');
    $('chmod-error').querySelector('span').textContent = '';
  }

  function clampDigit(n) {
    if (!Number.isInteger(n) || n < 0 || n > 7) throw new Error('Digits must be 0-7');
    return n;
  }

  function readChecks() {
    const v = {};
    CHECKS.forEach(id => v[id] = $(id).checked);
    return v;
  }

  function writeChecks(state) {
    CHECKS.forEach(id => {
      if (typeof state[id] === 'boolean') $(id).checked = state[id];
    });
  }

  function tripletToDigit(r, w, x) {
    return (r ? 4 : 0) + (w ? 2 : 0) + (x ? 1 : 0);
  }

  function digitToTriplet(d) {
    d = clampDigit(d);
    return {
      r: !!(d & 4),
      w: !!(d & 2),
      x: !!(d & 1)
    };
  }

  function computeOctalFromChecks(c) {
    const special = (c['u-s'] ? 4 : 0) + (c['g-s'] ? 2 : 0) + (c['o-t'] ? 1 : 0);
    const u = tripletToDigit(c['u-r'], c['u-w'], c['u-x']);
    const g = tripletToDigit(c['g-r'], c['g-w'], c['g-x']);
    const o = tripletToDigit(c['o-r'], c['o-w'], c['o-x']);

    const base = `${u}${g}${o}`;
    return special ? `${special}${base}` : base;
  }

  function parseOctal(octalRaw) {
    const s = (octalRaw || '').trim();
    if (!s) throw new Error('Enter an octal permission like 755, 0644 or 4755');

    const cleaned = s.replace(/^0+/, '0'); // keep one 0 if all zeros
    const digits = cleaned.replace(/^0/, '').length ? cleaned.replace(/^0/, '') : cleaned; // allow 000 => 0

    const m = digits.match(/^[0-7]{3,4}$/);
    if (!m) throw new Error('Octal must be 3 or 4 digits (0-7 only)');

    const arr = digits.split('').map(d => parseInt(d, 10));
    let special = 0, u, g, o;

    if (arr.length === 4) {
      [special, u, g, o] = arr;
    } else {
      [u, g, o] = arr;
    }

    special = special || 0;
    clampDigit(special); clampDigit(u); clampDigit(g); clampDigit(o);

    const sBits = {
      setuid: !!(special & 4),
      setgid: !!(special & 2),
      sticky: !!(special & 1)
    };

    const uu = digitToTriplet(u);
    const gg = digitToTriplet(g);
    const oo = digitToTriplet(o);

    return {
      specialDigit: special,
      u, g, o,
      bits: {
        'u-r': uu.r,
        'u-w': uu.w,
        'u-x': uu.x,
        'u-s': sBits.setuid,
        'g-r': gg.r,
        'g-w': gg.w,
        'g-x': gg.x,
        'g-s': sBits.setgid,
        'o-r': oo.r,
        'o-w': oo.w,
        'o-x': oo.x,
        'o-t': sBits.sticky
      }
    };
  }

  function buildRwxString(c, filetype) {
    // setuid/setgid/sticky affect the execute positions
    const uX = c['u-x'];
    const gX = c['g-x'];
    const oX = c['o-x'];

    const uExecChar = c['u-s'] ? (uX ? 's' : 'S') : (uX ? 'x' : '-');
    const gExecChar = c['g-s'] ? (gX ? 's' : 'S') : (gX ? 'x' : '-');
    const oExecChar = c['o-t'] ? (oX ? 't' : 'T') : (oX ? 'x' : '-');

    const prefix = filetype === 'dir' ? 'd' : '-';

    return prefix +
      (c['u-r'] ? 'r' : '-') +
      (c['u-w'] ? 'w' : '-') +
      uExecChar +
      (c['g-r'] ? 'r' : '-') +
      (c['g-w'] ? 'w' : '-') +
      gExecChar +
      (c['o-r'] ? 'r' : '-') +
      (c['o-w'] ? 'w' : '-') +
      oExecChar;
  }

  function buildSymbolicAbsolute(c) {
    const u = ['r','w','x'].filter(ch => c[`u-${ch}`]).join('');
    const g = ['r','w','x'].filter(ch => c[`g-${ch}`]).join('');
    const o = ['r','w','x'].filter(ch => c[`o-${ch}`]).join('');

    // Special bits are often expressed by chmod with u+s/g+s/o+t
    // but chmod-calculator style also shows setuid/setgid/sticky separately.
    // We'll include them in the u= / g= / o= fields using 's' and 't' where relevant.

    const uPart = `u=${u}${c['u-s'] ? 's' : ''}`;
    const gPart = `g=${g}${c['g-s'] ? 's' : ''}`;
    const oPart = `o=${o}${c['o-t'] ? 't' : ''}`;

    return `${uPart},${gPart},${oPart}`;
  }

  function parseSymbolicAbsolute(raw) {
    const s = (raw || '').trim();
    if (!s) throw new Error('Enter a symbolic permission like u=rwx,g=rx,o=rx');

    // Accept commas and/or whitespace separators
    const parts = s.split(/[\s,]+/).filter(Boolean);

    const state = {
      'u-r': false, 'u-w': false, 'u-x': false, 'u-s': false,
      'g-r': false, 'g-w': false, 'g-x': false, 'g-s': false,
      'o-r': false, 'o-w': false, 'o-x': false, 'o-t': false
    };

    const seen = new Set();

    for (const p of parts) {
      const m = p.match(/^([ugo])=([rwxst-]*)$/i);
      if (!m) throw new Error('Symbolic must be in the form u=..., g=..., o=... (e.g. u=rwx,g=rx,o=rx)');
      const who = m[1].toLowerCase();
      const perms = m[2].toLowerCase();

      seen.add(who);

      // reset
      ['r','w','x'].forEach(ch => state[`${who}-${ch}`] = false);

      for (const ch of perms) {
        if (ch === '-') continue;
        if (ch === 'r' || ch === 'w' || ch === 'x') {
          state[`${who}-${ch}`] = true;
          continue;
        }
        if (ch === 's') {
          if (who === 'u') state['u-s'] = true;
          else if (who === 'g') state['g-s'] = true;
          else throw new Error('Only u or g can have setuid/setgid (s)');
          continue;
        }
        if (ch === 't') {
          if (who === 'o') state['o-t'] = true;
          else throw new Error('Sticky bit (t) is represented on other (o)');
          continue;
        }
        throw new Error(`Unsupported symbolic character: ${ch}`);
      }
    }

    // Require at least one of u/g/o to avoid accidental clears
    if (seen.size === 0) throw new Error('Provide at least one of u=, g=, o=');

    return state;
  }

  // Parse rwx string like "-rwxr-xr-x" or "drwxr-x---"
  function parseRwxString(raw) {
    const s = (raw || '').trim();
    if (!s) throw new Error('Enter a permission string like -rwxr-xr-x');

    // Accept 9 or 10 characters. If 10, first char is file type (ignored for perms).
    // Also allow variations: s/S for setuid/setgid in execute positions, t/T for sticky
    let perms = s;
    let filetype = 'file';

    if (s.length === 10) {
      const firstChar = s[0];
      if (firstChar === 'd') filetype = 'dir';
      perms = s.slice(1);
    } else if (s.length !== 9) {
      throw new Error('Permission string must be 9 or 10 characters (e.g. -rwxr-xr-x or rwxr-xr-x)');
    }

    // Validate format: each triplet is [r-][w-][xsStT-]
    const pattern = /^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/;
    if (!pattern.test(perms)) {
      throw new Error('Invalid permission string format. Expected pattern like rwxr-xr-x');
    }

    const state = {
      'u-r': perms[0] === 'r',
      'u-w': perms[1] === 'w',
      'u-x': perms[2] === 'x' || perms[2] === 's',
      'u-s': perms[2] === 's' || perms[2] === 'S',
      'g-r': perms[3] === 'r',
      'g-w': perms[4] === 'w',
      'g-x': perms[5] === 'x' || perms[5] === 's',
      'g-s': perms[5] === 's' || perms[5] === 'S',
      'o-r': perms[6] === 'r',
      'o-w': perms[7] === 'w',
      'o-x': perms[8] === 'x' || perms[8] === 't',
      'o-t': perms[8] === 't' || perms[8] === 'T'
    };

    return { state, filetype };
  }

  function specialSummary(c) {
    const bits = [];
    if (c['u-s']) bits.push('setuid');
    if (c['g-s']) bits.push('setgid');
    if (c['o-t']) bits.push('sticky');
    return bits.length ? bits.join(', ') : 'none';
  }

  function updateUIFromChecks() {
    const c = readChecks();
    clearError();

    const octal = computeOctalFromChecks(c);
    const filetype = $('chmod-filetype').value;

    $('chmod-summary-octal').textContent = octal;
    $('chmod-octal').value = octal;

    const symbolic = buildSymbolicAbsolute(c);
    $('chmod-summary-symbolic').textContent = symbolic;
    $('chmod-symbolic').value = symbolic;

    $('chmod-summary-special').textContent = specialSummary(c);

    const rwxString = buildRwxString(c, filetype);
    $('chmod-rwx').textContent = rwxString;
    $('chmod-rwxinput').value = rwxString;

    $('chmod-cmd-octal').textContent = `chmod ${octal} <path>`;
    $('chmod-cmd-symbolic').textContent = `chmod ${symbolic} <path>`;
  }

  let ignoreInputEvents = false;

  function applyOctalInput() {
    if (ignoreInputEvents) return;
    try {
      const parsed = parseOctal($('chmod-octal').value);
      ignoreInputEvents = true;
      writeChecks(parsed.bits);
      ignoreInputEvents = false;
      updateUIFromChecks();
    } catch (e) {
      showError(e.message);
    }
  }

  function applySymbolicInput() {
    if (ignoreInputEvents) return;
    try {
      const state = parseSymbolicAbsolute($('chmod-symbolic').value);
      ignoreInputEvents = true;
      writeChecks(state);
      ignoreInputEvents = false;
      updateUIFromChecks();
    } catch (e) {
      showError(e.message);
    }
  }

  function applyRwxInput() {
    if (ignoreInputEvents) return;
    try {
      const { state, filetype } = parseRwxString($('chmod-rwxinput').value);
      ignoreInputEvents = true;
      writeChecks(state);
      $('chmod-filetype').value = filetype;
      ignoreInputEvents = false;
      updateUIFromChecks();
    } catch (e) {
      showError(e.message);
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      const isActive = content.id === `${tab}-tab`;
      content.classList.toggle('active', isActive);
      content.classList.toggle('hidden', !isActive);
    });
  }

  function copyFromElementId(id) {
    const el = $(id);
    if (!el) return;
    const text = el.textContent;
    navigator.clipboard.writeText(text);
  }

  document.addEventListener('DOMContentLoaded', function() {
    // initial sync from default octal
    applyOctalInput();

    // tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // checkbox changes
    CHECKS.forEach(id => {
      $(id).addEventListener('change', () => {
        if (ignoreInputEvents) return;
        updateUIFromChecks();
      });
    });

    // octal changes
    $('chmod-octal').addEventListener('input', () => {
      clearError();
      applyOctalInput();
    });

    // symbolic changes
    $('chmod-symbolic').addEventListener('input', () => {
      clearError();
      applySymbolicInput();
    });

    // rwx string changes
    $('chmod-rwxinput').addEventListener('input', () => {
      clearError();
      applyRwxInput();
    });

    // filetype changes only affect rwx string output
    $('chmod-filetype').addEventListener('change', updateUIFromChecks);

    // copy buttons
    document.querySelectorAll('.chmod-copy').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.dataset.copy;
        copyFromElementId(id);
        const original = this.textContent;
        this.textContent = 'Copied';
        setTimeout(() => this.textContent = original, 900);
      });
    });
  });
})();
