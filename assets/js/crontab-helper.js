// Crontab Helper
// Parse, validate, and explain cron expressions
(function() {
  'use strict';

  // ============================================
  // Constants
  // ============================================

  const FIELD_NAMES = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];
  
  const FIELD_RANGES = {
    minute: { min: 0, max: 59 },
    hour: { min: 0, max: 23 },
    dayOfMonth: { min: 1, max: 31 },
    month: { min: 1, max: 12 },
    dayOfWeek: { min: 0, max: 7 } // 0 and 7 both mean Sunday
  };

  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTH_ABBR = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  const SPECIAL_STRINGS = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *'
  };

  // ============================================
  // Parsing Functions
  // ============================================

  function normalizeExpression(expr) {
    expr = expr.trim().toLowerCase();
    
    // Handle special strings
    if (SPECIAL_STRINGS[expr]) {
      return SPECIAL_STRINGS[expr];
    }
    
    // Replace month names with numbers
    MONTH_ABBR.forEach((abbr, idx) => {
      if (idx > 0) {
        expr = expr.replace(new RegExp('\\b' + abbr.toLowerCase() + '\\b', 'gi'), idx.toString());
      }
    });
    
    // Replace day names with numbers
    DAY_ABBR.forEach((abbr, idx) => {
      if (idx < 7) {
        expr = expr.replace(new RegExp('\\b' + abbr.toLowerCase() + '\\b', 'gi'), idx.toString());
      }
    });
    
    return expr;
  }

  function parseField(field, fieldName) {
    const range = FIELD_RANGES[fieldName];
    const values = new Set();
    
    // Handle wildcard
    if (field === '*') {
      for (let i = range.min; i <= range.max; i++) {
        // For dayOfWeek, don't add 7 (duplicate of 0)
        if (fieldName === 'dayOfWeek' && i === 7) continue;
        values.add(i);
      }
      return { values: Array.from(values).sort((a, b) => a - b), isWildcard: true };
    }
    
    // Split by comma for lists
    const parts = field.split(',');
    
    for (const part of parts) {
      // Handle step values (e.g., */5 or 1-10/2)
      if (part.includes('/')) {
        const [rangeStr, stepStr] = part.split('/');
        const step = parseInt(stepStr, 10);
        
        if (isNaN(step) || step <= 0) {
          throw new Error(`Invalid step value "${stepStr}" in field "${fieldName}"`);
        }
        
        let start, end;
        if (rangeStr === '*') {
          start = range.min;
          end = range.max;
        } else if (rangeStr.includes('-')) {
          [start, end] = rangeStr.split('-').map(n => parseInt(n, 10));
        } else {
          start = parseInt(rangeStr, 10);
          end = range.max;
        }
        
        for (let i = start; i <= end; i += step) {
          if (i >= range.min && i <= range.max) {
            // Normalize day of week 7 to 0
            if (fieldName === 'dayOfWeek' && i === 7) {
              values.add(0);
            } else {
              values.add(i);
            }
          }
        }
      }
      // Handle ranges (e.g., 1-5)
      else if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        
        if (isNaN(start) || isNaN(end)) {
          throw new Error(`Invalid range "${part}" in field "${fieldName}"`);
        }
        
        for (let i = start; i <= end; i++) {
          if (i >= range.min && i <= range.max) {
            if (fieldName === 'dayOfWeek' && i === 7) {
              values.add(0);
            } else {
              values.add(i);
            }
          }
        }
      }
      // Handle single values
      else {
        const val = parseInt(part, 10);
        if (isNaN(val)) {
          throw new Error(`Invalid value "${part}" in field "${fieldName}"`);
        }
        if (val < range.min || val > range.max) {
          throw new Error(`Value ${val} out of range for field "${fieldName}" (${range.min}-${range.max})`);
        }
        if (fieldName === 'dayOfWeek' && val === 7) {
          values.add(0);
        } else {
          values.add(val);
        }
      }
    }
    
    return { values: Array.from(values).sort((a, b) => a - b), isWildcard: false };
  }

  function parseCronExpression(expr) {
    const normalized = normalizeExpression(expr);
    const parts = normalized.split(/\s+/);
    
    if (parts.length !== 5) {
      throw new Error(`Expected 5 fields, got ${parts.length}. Format: minute hour day-of-month month day-of-week`);
    }
    
    const parsed = {};
    FIELD_NAMES.forEach((name, idx) => {
      parsed[name] = parseField(parts[idx], name);
    });
    
    return parsed;
  }

  // ============================================
  // Description Generation
  // ============================================

  function describeField(field, fieldName, parsed) {
    const { values, isWildcard } = field;
    
    if (isWildcard) {
      switch (fieldName) {
        case 'minute': return 'every minute';
        case 'hour': return 'every hour';
        case 'dayOfMonth': return 'every day';
        case 'month': return 'every month';
        case 'dayOfWeek': return 'every day of the week';
      }
    }
    
    if (values.length === 1) {
      switch (fieldName) {
        case 'minute': return values[0].toString().padStart(2, '0');
        case 'hour': return formatHour(values[0]);
        case 'dayOfMonth': return ordinal(values[0]);
        case 'month': return MONTH_NAMES[values[0]];
        case 'dayOfWeek': return DAY_NAMES[values[0]];
      }
    }
    
    // Check for consecutive range
    if (isConsecutive(values)) {
      switch (fieldName) {
        case 'minute': return `minutes ${values[0]}-${values[values.length - 1]}`;
        case 'hour': return `${formatHour(values[0])} through ${formatHour(values[values.length - 1])}`;
        case 'dayOfMonth': return `${ordinal(values[0])} through ${ordinal(values[values.length - 1])}`;
        case 'month': return `${MONTH_NAMES[values[0]]} through ${MONTH_NAMES[values[values.length - 1]]}`;
        case 'dayOfWeek': return `${DAY_NAMES[values[0]]} through ${DAY_NAMES[values[values.length - 1]]}`;
      }
    }
    
    // List values
    switch (fieldName) {
      case 'minute': return `minutes ${values.join(', ')}`;
      case 'hour': return values.map(formatHour).join(', ');
      case 'dayOfMonth': return values.map(ordinal).join(', ');
      case 'month': return values.map(v => MONTH_NAMES[v]).join(', ');
      case 'dayOfWeek': return values.map(v => DAY_NAMES[v]).join(', ');
    }
  }

  function generateDescription(parsed) {
    const { minute, hour, dayOfMonth, month, dayOfWeek } = parsed;
    
    let desc = 'At ';
    
    // Time part
    if (minute.isWildcard && hour.isWildcard) {
      desc = 'Every minute';
    } else if (minute.isWildcard) {
      desc = 'Every minute';
      if (!hour.isWildcard) {
        if (hour.values.length === 1) {
          desc += ` past hour ${hour.values[0]}`;
        } else if (isConsecutive(hour.values)) {
          desc += ` from ${formatHour(hour.values[0])} through ${formatHour(hour.values[hour.values.length - 1])}`;
        } else {
          desc += ` past hours ${hour.values.join(', ')}`;
        }
      }
    } else if (hour.isWildcard) {
      if (minute.values.length === 1) {
        desc = `At minute ${minute.values[0]} of every hour`;
      } else {
        desc = `At minutes ${minute.values.join(', ')} of every hour`;
      }
    } else {
      // Specific time(s)
      if (minute.values.length === 1 && hour.values.length === 1) {
        desc = `At ${formatTime(hour.values[0], minute.values[0])}`;
      } else if (minute.values.length === 1) {
        const times = hour.values.map(h => formatTime(h, minute.values[0]));
        desc = `At ${times.join(', ')}`;
      } else {
        desc = `At minute ${minute.values.join(', ')} past hour ${hour.values.join(', ')}`;
      }
    }
    
    // Day restrictions
    const hasDomRestriction = !dayOfMonth.isWildcard;
    const hasDowRestriction = !dayOfWeek.isWildcard;
    
    if (hasDomRestriction && hasDowRestriction) {
      desc += ` on ${describeField(dayOfMonth, 'dayOfMonth', parsed)} and on ${describeField(dayOfWeek, 'dayOfWeek', parsed)}`;
    } else if (hasDomRestriction) {
      desc += ` on the ${describeField(dayOfMonth, 'dayOfMonth', parsed)}`;
    } else if (hasDowRestriction) {
      if (dayOfWeek.values.length === 5 && isConsecutive(dayOfWeek.values) && 
          dayOfWeek.values[0] === 1 && dayOfWeek.values[4] === 5) {
        desc += ` on every weekday`;
      } else if (dayOfWeek.values.length === 2 && 
                 ((dayOfWeek.values.includes(0) && dayOfWeek.values.includes(6)) ||
                  (dayOfWeek.values.includes(6) && dayOfWeek.values.includes(0)))) {
        desc += ` on weekends`;
      } else if (isConsecutive(dayOfWeek.values)) {
        desc += ` on every day-of-week from ${DAY_NAMES[dayOfWeek.values[0]]} through ${DAY_NAMES[dayOfWeek.values[dayOfWeek.values.length - 1]]}`;
      } else {
        desc += ` on ${dayOfWeek.values.map(v => DAY_NAMES[v]).join(', ')}`;
      }
    }
    
    // Month restrictions
    if (!month.isWildcard) {
      if (month.values.length === 1) {
        desc += ` in ${MONTH_NAMES[month.values[0]]}`;
      } else if (isConsecutive(month.values)) {
        desc += ` from ${MONTH_NAMES[month.values[0]]} through ${MONTH_NAMES[month.values[month.values.length - 1]]}`;
      } else {
        desc += ` in ${month.values.map(v => MONTH_NAMES[v]).join(', ')}`;
      }
    }
    
    return desc + '.';
  }

  // ============================================
  // Next Run Calculation
  // ============================================

  function getNextRuns(parsed, count = 10, timezone = 'local') {
    const runs = [];
    let date = new Date();
    
    // Start from next minute
    date.setSeconds(0, 0);
    date.setMinutes(date.getMinutes() + 1);
    
    const maxIterations = 525600; // 1 year of minutes
    let iterations = 0;
    
    while (runs.length < count && iterations < maxIterations) {
      iterations++;
      
      const minute = date.getMinutes();
      const hour = date.getHours();
      const dayOfMonth = date.getDate();
      const month = date.getMonth() + 1; // JS months are 0-indexed
      const dayOfWeek = date.getDay();
      
      // Check if this time matches
      if (parsed.minute.values.includes(minute) &&
          parsed.hour.values.includes(hour) &&
          parsed.month.values.includes(month) &&
          (parsed.dayOfMonth.values.includes(dayOfMonth) || parsed.dayOfMonth.isWildcard) &&
          (parsed.dayOfWeek.values.includes(dayOfWeek) || parsed.dayOfWeek.isWildcard)) {
        
        // Handle the special case where both DOM and DOW are specified
        // In standard cron, it's OR logic (runs if either matches)
        if (!parsed.dayOfMonth.isWildcard && !parsed.dayOfWeek.isWildcard) {
          if (parsed.dayOfMonth.values.includes(dayOfMonth) || parsed.dayOfWeek.values.includes(dayOfWeek)) {
            runs.push(new Date(date));
          }
        } else {
          runs.push(new Date(date));
        }
      }
      
      // Move to next minute
      date.setMinutes(date.getMinutes() + 1);
    }
    
    return runs;
  }

  function formatNextRun(date, timezone) {
    const options = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    if (timezone && timezone !== 'local') {
      options.timeZone = timezone;
    }
    
    const formatted = date.toLocaleString('en-GB', options);
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    let relative;
    if (diffMins < 60) {
      relative = `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      relative = `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else if (diffDays < 7) {
      relative = `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else {
      relative = `in ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''}`;
    }
    
    return { formatted, relative };
  }

  // ============================================
  // Field Breakdown
  // ============================================

  function generateBreakdown(expr, parsed) {
    const normalized = normalizeExpression(expr);
    const parts = normalized.split(/\s+/);
    
    const fieldLabels = ['Minute', 'Hour', 'Day of Month', 'Month', 'Day of Week'];
    const breakdown = [];
    
    FIELD_NAMES.forEach((name, idx) => {
      const field = parsed[name];
      const originalValue = parts[idx];
      
      let explanation;
      if (field.isWildcard) {
        explanation = `Every ${fieldLabels[idx].toLowerCase()}`;
      } else {
        explanation = describeField(field, name, parsed);
        // Clean up explanation
        if (name === 'minute' || name === 'hour') {
          explanation = explanation.charAt(0).toUpperCase() + explanation.slice(1);
        }
      }
      
      breakdown.push({
        label: fieldLabels[idx],
        value: originalValue.toUpperCase(),
        range: `${FIELD_RANGES[name].min}-${FIELD_RANGES[name].max}`,
        explanation: explanation,
        expandedValues: field.isWildcard ? '*' : field.values.join(', ')
      });
    });
    
    return breakdown;
  }

  // ============================================
  // Utility Functions
  // ============================================

  function formatHour(h) {
    if (h === 0) return '12am (midnight)';
    if (h === 12) return '12pm (noon)';
    if (h < 12) return `${h}am`;
    return `${h - 12}pm`;
  }

  function formatTime(h, m) {
    const hour = h.toString().padStart(2, '0');
    const minute = m.toString().padStart(2, '0');
    return `${hour}:${minute}`;
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function isConsecutive(arr) {
    if (arr.length < 2) return false;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] !== arr[i - 1] + 1) return false;
    }
    return true;
  }

  // ============================================
  // UI Functions
  // ============================================

  let currentParsed = null;

  function showError(message) {
    const errorEl = document.getElementById('cron-error');
    const descEl = document.getElementById('cron-description');
    
    errorEl.querySelector('span').textContent = message;
    errorEl.classList.remove('hidden');
    descEl.classList.add('hidden');
    
    document.getElementById('next-runs-section').classList.add('hidden');
    document.getElementById('breakdown-section').classList.add('hidden');
  }

  function hideError() {
    document.getElementById('cron-error').classList.add('hidden');
    document.getElementById('cron-description').classList.remove('hidden');
  }

  function updateFieldBoxes(expr) {
    const normalized = normalizeExpression(expr);
    const parts = normalized.split(/\s+/);
    
    const fieldIds = ['field-minute', 'field-hour', 'field-dom', 'field-month', 'field-dow'];
    fieldIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (el && parts[idx] !== undefined) {
        el.textContent = parts[idx].toUpperCase();
      } else if (el) {
        el.textContent = '?';
      }
    });
  }

  function updateResults(expr) {
    try {
      const parsed = parseCronExpression(expr);
      currentParsed = parsed;
      
      hideError();
      
      // Update visual field boxes
      updateFieldBoxes(expr);
      
      // Update description
      const description = generateDescription(parsed);
      document.querySelector('#cron-description .description-text').textContent = description;
      
      // Update next runs
      updateNextRuns(parsed);
      
      // Update breakdown
      updateBreakdown(expr, parsed);
      
      document.getElementById('next-runs-section').classList.remove('hidden');
      document.getElementById('breakdown-section').classList.remove('hidden');
      
    } catch (e) {
      showError(e.message);
      currentParsed = null;
      // Still try to update the field boxes for visual feedback
      updateFieldBoxes(expr);
    }
  }

  function updateNextRuns(parsed) {
    const timezone = document.getElementById('timezone-select').value;
    const runs = getNextRuns(parsed, 10, timezone);
    
    const container = document.getElementById('next-runs-list');
    
    if (runs.length === 0) {
      container.innerHTML = '<div class="no-runs">No upcoming runs found in the next year.</div>';
      return;
    }
    
    const html = runs.map((run, idx) => {
      const { formatted, relative } = formatNextRun(run, timezone === 'local' ? null : timezone);
      return `
        <div class="next-run-item">
          <span class="run-number">${idx + 1}</span>
          <span class="run-datetime">${formatted}</span>
          <span class="run-relative">${relative}</span>
        </div>
      `;
    }).join('');
    
    container.innerHTML = html;
  }

  function updateBreakdown(expr, parsed) {
    const breakdown = generateBreakdown(expr, parsed);
    
    const html = breakdown.map(field => `
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-label">${field.label}</span>
          <code class="breakdown-value">${field.value}</code>
        </div>
        <div class="breakdown-details">
          <span class="breakdown-explanation">${field.explanation}</span>
          <span class="breakdown-range">Valid: ${field.range}</span>
        </div>
      </div>
    `).join('');
    
    document.getElementById('field-breakdown').innerHTML = html;
  }

  function updateFromBuilder() {
    const getValue = (id) => {
      const select = document.getElementById(id);
      const custom = document.getElementById(id + '-custom');
      return custom.value.trim() || select.value;
    };
    
    const minute = getValue('build-minute');
    const hour = getValue('build-hour');
    const dom = getValue('build-dom');
    const month = getValue('build-month');
    const dow = getValue('build-dow');
    
    const expr = `${minute} ${hour} ${dom} ${month} ${dow}`;
    document.getElementById('builder-result-code').textContent = expr;
    
    return expr;
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === tab + '-tab');
      content.classList.toggle('hidden', content.id !== tab + '-tab');
    });
    
    if (tab === 'build') {
      updateFromBuilder();
    }
  }

  // ============================================
  // Initialization
  // ============================================

  document.addEventListener('DOMContentLoaded', function() {
    const cronInput = document.getElementById('cron-input');
    
    // Initial parse
    if (cronInput.value) {
      updateResults(cronInput.value);
    }
    
    // Live parsing on input
    cronInput.addEventListener('input', function() {
      const value = this.value.trim();
      if (value) {
        updateResults(value);
      }
    });
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        switchTab(this.dataset.tab);
      });
    });
    
    // Builder inputs
    const builderInputs = document.querySelectorAll('.builder-select, .builder-custom');
    builderInputs.forEach(input => {
      input.addEventListener('change', updateFromBuilder);
      input.addEventListener('input', updateFromBuilder);
    });
    
    // Copy expression button
    document.getElementById('copy-expression').addEventListener('click', function() {
      const expr = document.getElementById('builder-result-code').textContent;
      navigator.clipboard.writeText(expr).then(() => {
        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
      });
    });
    
    // Use in parser button
    document.getElementById('use-expression').addEventListener('click', function() {
      const expr = document.getElementById('builder-result-code').textContent;
      cronInput.value = expr;
      switchTab('parse');
      updateResults(expr);
    });
    
    // Example buttons
    document.querySelectorAll('.example-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const cron = this.dataset.cron;
        cronInput.value = cron;
        switchTab('parse');
        updateResults(cron);
      });
    });
    
    // Timezone change
    document.getElementById('timezone-select').addEventListener('change', function() {
      if (currentParsed) {
        updateNextRuns(currentParsed);
      }
    });
  });
})();
