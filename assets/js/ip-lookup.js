// IP Address Lookup
// Uses a lightweight backend API (RDAP + MaxMind)
(function() {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function getApiBase() {
    // Prefer explicit override for local dev
    if (window.NETTOOLS_IPLOOKUP_API_BASE) return window.NETTOOLS_IPLOOKUP_API_BASE;

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8787';
    }

    // Default production base (adjust in backend deploy)
    return 'https://api-iplookup.nettools.im';
  }

  const API_BASE = getApiBase().replace(/\/$/, '');

  function showError(msg) {
    const el = $('ip-error');
    el.querySelector('span').textContent = msg;
    el.classList.remove('hidden');
  }

  function clearError() {
    const el = $('ip-error');
    el.classList.add('hidden');
    el.querySelector('span').textContent = '';
  }

  function showLoading(show) {
    const el = $('ip-loading');
    el.classList.toggle('hidden', !show);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }

  function isIpLikely(input) {
    // Lightweight check; backend will validate properly.
    if (!input) return false;
    return /[:.]/.test(input) || /^[0-9a-fA-F]{8,}$/.test(input);
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

  function addSummaryItem(label, value, highlight = false) {
    const grid = $('ip-summary');
    const item = document.createElement('div');
    item.className = 'summary-item';
    item.innerHTML = `
      <span class="summary-label">${escapeHtml(label)}</span>
      <span class="summary-value${highlight ? ' highlight' : ''}">${escapeHtml(value)}</span>
    `;
    grid.appendChild(item);
  }

  function addDetailRow(key, value, isMono = false) {
    const tbody = $('ip-details-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space: nowrap; font-weight: 600; color: var(--text-primary);">${escapeHtml(key)}</td>
      <td style="${isMono ? 'font-family: var(--font-mono);' : ''}">${value}</td>
    `;
    tbody.appendChild(tr);
  }

  function linkify(url) {
    const safe = escapeHtml(url);
    return `<a href="${safe}" target="_blank" rel="noopener" style="color: var(--accent-color); text-decoration: none;">${safe}</a>`;
  }

  function fmtList(arr) {
    if (!arr || !arr.length) return '-';
    return escapeHtml(arr.join(', '));
  }

  function fmtMaybe(val) {
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'string') return escapeHtml(val);
    return escapeHtml(String(val));
  }

  function populate(result) {
    $('ip-summary').innerHTML = '';
    $('ip-details-body').innerHTML = '';

    // Summary
    addSummaryItem('IP', result.ip || '-', true);

    // Friendly classification for non-public IPs
    const cls = result.ipClassification;
    if (cls && cls.public === false) {
      const kindMap = {
        internal_rfc1918: 'Internal (RFC1918)',
        internal_ula: 'Internal (IPv6 ULA)',
        loopback: 'Loopback',
        link_local: 'Link-local',
        cgnat: 'CGNAT (100.64.0.0/10)',
        documentation: 'Documentation range',
        multicast: 'Multicast',
        this_network: 'This network'
      };
      addSummaryItem('Type', kindMap[cls.kind] || 'Non-public');
    }

    const asnNum = result.geo?.asn?.autonomous_system_number;
    const asnOrg = result.geo?.asn?.autonomous_system_organization;
    if (asnNum) addSummaryItem('ASN', `AS${asnNum}`);
    if (asnOrg) addSummaryItem('ASN Org', asnOrg);

    const country = result.geo?.city?.country;
    const city = result.geo?.city?.city;
    const tz = result.geo?.city?.location?.time_zone;
    if (country) addSummaryItem('Country', country);
    if (city) addSummaryItem('City', city);
    if (tz) addSummaryItem('Timezone', tz);

    $('ip-details-info').textContent = result.rdapSource ? result.rdapSource : '-';

    // Details table
    addDetailRow('RDAP Source', fmtMaybe(result.rdapSource));
    if (result.rdapFetchedAt) addDetailRow('RDAP Fetched At', fmtMaybe(new Date(result.rdapFetchedAt).toISOString()), true);

    if (result.geo?.asn) {
      addDetailRow('ASN', asnNum ? `AS${escapeHtml(String(asnNum))}` : '-', true);
      addDetailRow('ASN Org', fmtMaybe(asnOrg));
    }

    if (result.geo?.city) {
      const c = result.geo.city;
      addDetailRow('Continent', fmtMaybe(c.continent));
      addDetailRow('Country', fmtMaybe(c.country));
      addDetailRow('Country ISO', fmtMaybe(c.country_iso_code), true);
      addDetailRow('Registered Country', fmtMaybe(c.registered_country));
      addDetailRow('Region', fmtMaybe(c.region));
      addDetailRow('Region ISO', fmtMaybe(c.region_iso_code), true);
      addDetailRow('City', fmtMaybe(c.city));
      addDetailRow('Postal', fmtMaybe(c.postal));
      if (c.location?.latitude != null && c.location?.longitude != null) {
        addDetailRow('Location', `${c.location.latitude}, ${c.location.longitude}`, true);
      }
      if (c.location?.time_zone) {
        addDetailRow('Time Zone', fmtMaybe(c.location.time_zone));
      }
      if (c.location?.accuracy_radius != null) {
        addDetailRow('Accuracy Radius', `${c.location.accuracy_radius} km`);
      }
    }

    if (result.rdap) {
      // We keep RDAP largely raw, but surface a few common fields if present
      if (result.rdap.handle) addDetailRow('RDAP Handle', fmtMaybe(result.rdap.handle), true);
      if (result.rdap.name) addDetailRow('RDAP Name', fmtMaybe(result.rdap.name));
      if (result.rdap.type) addDetailRow('RDAP Type', fmtMaybe(result.rdap.type));
      if (result.rdap.startAddress) addDetailRow('Start', fmtMaybe(result.rdap.startAddress), true);
      if (result.rdap.endAddress) addDetailRow('End', fmtMaybe(result.rdap.endAddress), true);
      if (result.rdap.status?.length) addDetailRow('Status', fmtList(result.rdap.status));
    }

    if (result.maxmind) {
      addDetailRow('MaxMind City DB', fmtMaybe(result.maxmind.cityDbPath), true);
      addDetailRow('MaxMind ASN DB', fmtMaybe(result.maxmind.asnDbPath), true);
      addDetailRow('City Loaded', fmtMaybe(result.maxmind.cityLoaded));
      addDetailRow('ASN Loaded', fmtMaybe(result.maxmind.asnLoaded));
    }

    // Raw
    $('raw-json').textContent = JSON.stringify(result, null, 2);
    $('raw-info').textContent = result.ip ? result.ip : '-';

    $('ip-results').classList.remove('hidden');
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      credentials: 'omit'
    });

    let body = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await res.json();
    } else {
      body = { error: await res.text() };
    }

    if (!res.ok) {
      // Prefer human-friendly message from API over machine error codes.
      const msg = body?.message || body?.error || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return {
      data: body,
      headers: {
        limit: res.headers.get('x-ratelimit-limit'),
        remaining: res.headers.get('x-ratelimit-remaining'),
        reset: res.headers.get('x-ratelimit-reset')
      }
    };
  }

  function updateRateLimitMeter(rateLimit) {
    const card = $('rate-limit-card');
    const text = $('rate-limit-text');
    const bar = $('rate-limit-bar');

    if (!card || !text || !bar) return;

    const limit = rateLimit?.limit != null ? Number(rateLimit.limit) : null;
    const remaining = rateLimit?.remaining != null ? Number(rateLimit.remaining) : null;
    const used = rateLimit?.used != null ? Number(rateLimit.used) : null;

    // If the API didn't include rate limit info, leave the meter blank.
    if (!Number.isFinite(limit) || !Number.isFinite(remaining)) {
      text.textContent = '-';
      bar.style.width = '0%';
      return;
    }

    const used2 = Number.isFinite(used) ? Math.max(0, used) : Math.max(0, limit - remaining);
    const pct = limit > 0 ? Math.min(100, Math.round((used2 / limit) * 100)) : 0;
    text.textContent = `${used2}/${limit} used today (${remaining} remaining)`;
    bar.style.width = `${pct}%`;
  }

  async function lookup(ipInput, { updateUrl = true } = {}) {
    clearError();
    $('ip-results').classList.add('hidden');
    showLoading(true);

    try {
      const ip = (ipInput || '').trim();

      let result;
      if (!ip) {
        // Default lookup: ask backend for caller IP and lookup that.
        const me = await fetchJson(`${API_BASE}/me`);
        const myIp = me?.data?.ip;
        if (!myIp) throw new Error('Could not determine your current IP');
        $('ip-lookup-input').value = myIp;
        result = await fetchJson(`${API_BASE}/lookup?ip=${encodeURIComponent(myIp)}`);
      } else {
        if (!isIpLikely(ip)) {
          throw new Error('Please enter a valid IPv4 or IPv6 address');
        }
        result = await fetchJson(`${API_BASE}/lookup?ip=${encodeURIComponent(ip)}`);
      }

      // Prefer API-provided rate limit values; fallback to headers for backwards compat.
      updateRateLimitMeter(result.data?.rateLimit || {
        limit: result.headers?.limit,
        remaining: result.headers?.remaining
      });
      populate(result.data);
      switchTab('lookup');

      if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set('ip', $('ip-lookup-input').value.trim());
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) {
      if (e.status === 429) {
        showError('Rate limit hit (24 lookups / 24h). Please try again later.');
      } else if (e.status === 400) {
        showError(e.message || 'Please enter a valid IPv4 or IPv6 address');
      } else {
        showError(e.message || 'Lookup failed');
      }
    } finally {
      showLoading(false);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('ip-lookup-btn').addEventListener('click', () => lookup($('ip-lookup-input').value));
    $('ip-lookup-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') lookup($('ip-lookup-input').value);
    });

    // Permalink support: /tools/ip-lookup/?ip=1.1.1.1
    const params = new URLSearchParams(window.location.search);
    const prefillIp = params.get('ip');
    if (prefillIp) {
      $('ip-lookup-input').value = prefillIp;
      lookup(prefillIp, { updateUrl: false });
    } else {
      // Default lookup: user's current IP
      lookup('', { updateUrl: true });
    }

    $('ip-clear-btn').addEventListener('click', () => {
      $('ip-lookup-input').value = '';
      $('ip-results').classList.add('hidden');
      clearError();
      $('raw-json').textContent = '';
      $('raw-info').textContent = '-';
      const url = new URL(window.location.href);
      url.searchParams.delete('ip');
      window.history.replaceState({}, '', url.toString());
    });

    $('ip-link-btn').addEventListener('click', async () => {
      const ip = $('ip-lookup-input').value.trim();
      if (!ip) {
        showError('Look up an IP first to generate a link');
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set('ip', ip);
      await navigator.clipboard.writeText(url.toString());
      const btn = $('ip-link-btn');
      const orig = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = orig), 1000);
    });

    // Optional: auto lookup if user pastes
    $('ip-lookup-input').addEventListener('paste', () => {
      setTimeout(() => lookup($('ip-lookup-input').value), 50);
    });
  });
})();
