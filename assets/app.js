/* Seat-Sync prototype: shared state, availability engine, API simulation, page shell.
   Plain script (no modules, no fetch) so every page works over file://.
   The engine functions are pure and take state explicitly; they carry over to a backend. */
(function (global) {
  'use strict';

  var KEY = 'seatsync_demo_v1';
  var HOLD_MS = 15 * 60 * 1000;
  var memState = null; // used when localStorage is blocked

  /* ---------------------------------------------------------------- dates
     Dates are plain 'YYYY-MM-DD' strings in the center's local day.
     They are built from local Date parts, never parsed as UTC. */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDate(toDate(s)) === s; }
  function today() { return fmtDate(new Date()); }
  function addDays(s, n) { var d = toDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
  function weekday(s) { return toDate(s).getDay(); }
  function eachDate(from, to) {
    var out = [], c = from, guard = 0;
    while (c <= to && guard++ < 800) { out.push(c); c = addDays(c, 1); }
    return out;
  }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function prettyDate(s) { var d = toDate(s); return DAYS[d.getDay()] + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear(); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------------- storage */
  function storageGet() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function storageSet(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* blocked: stay in memory */ } }
  function storageClear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  function freshSeed() {
    return global.SeatSyncSeed.make({ today: today(), addDays: addDays, now: Date.now() });
  }

  function load() {
    if (memState) { return memState; }
    var s = null, raw = storageGet();
    if (raw) { try { s = JSON.parse(raw); } catch (e) { s = null; } }
    if (!s || s.version !== 1) { s = freshSeed(); storageSet(JSON.stringify(s)); }
    memState = s;
    expireHolds(s);
    return s;
  }
  function save() { if (memState) { storageSet(JSON.stringify(memState)); } }
  function reset() { memState = null; storageClear(); memState = freshSeed(); save(); return memState; }

  /* Holds expire lazily: any held reservation past expiresAt becomes 'expired'. */
  function expireHolds(s) {
    var now = Date.now(), changed = false;
    s.reservations.forEach(function (r) {
      if (r.status === 'held' && r.expiresAt && r.expiresAt <= now) { r.status = 'expired'; changed = true; }
    });
    if (changed) { save(); }
  }

  /* ---------------------------------------------------------------- lookups */
  function catalogItem(code) {
    var c = global.SeatSyncSeed.CATALOG;
    for (var i = 0; i < c.length; i++) { if (c[i].code === code) { return c[i]; } }
    return { code: code, name: code, category: 'Other', kind: 'resource' };
  }
  function provider(id) {
    var p = global.SeatSyncSeed.PROVIDERS;
    for (var i = 0; i < p.length; i++) { if (p[i].id === id) { return p[i]; } }
    return null;
  }
  function centerById(s, id) { return s.centers.filter(function (c) { return c.id === id; })[0] || null; }
  function centerAccById(s, id) { return s.centerAccs.filter(function (c) { return c.id === id; })[0] || null; }
  function centerAccsFor(s, centerId) { return s.centerAccs.filter(function (c) { return c.centerId === centerId; }); }
  function isApproved(s, centerId, providerId) {
    return s.approvals.some(function (a) { return a.centerId === centerId && a.providerId === providerId; });
  }
  function currentCenter() { var s = load(); return s.session ? centerById(s, s.session.centerId) : null; }

  /* ---------------------------------------------------------------- availability engine */

  /* Capacity per date for one center accommodation.
     Precedence: single-date exception, then range/weekday exception (later rule wins), then default. */
  function buildCapacity(ca, rules, fromDate, toDate) {
    var out = {}, mine = rules.filter(function (r) { return r.centerAccId === ca.id; });
    eachDate(fromDate, toDate).forEach(function (date) {
      if (!ca.active) { out[date] = 0; return; }
      var cap = ca.qty;
      mine.forEach(function (r) {
        if ((r.type === 'range' || r.type === 'weekday') && date >= r.start && date <= r.end) {
          if (r.type === 'range' || r.days.indexOf(weekday(date)) >= 0) { cap = r.qty; }
        }
      });
      mine.forEach(function (r) { if (r.type === 'date' && r.start === date) { cap = r.qty; } });
      out[date] = cap;
    });
    return out;
  }

  /* A reservation counts if it is confirmed, or held and not yet expired. */
  function isActiveReservation(r, nowMs) {
    return r.status === 'confirmed' || (r.status === 'held' && r.expiresAt > nowMs);
  }

  /* Sum of quantities reserved on one date for one center accommodation. */
  function reservedFor(reservations, centerAccId, date, nowMs) {
    return reservations.reduce(function (sum, r) {
      if (r.centerAccId === centerAccId && isActiveReservation(r, nowMs) && r.start <= date && date <= r.end) { return sum + r.qty; }
      return sum;
    }, 0);
  }

  /* Capacity minus reserved for a single date. Computed, never stored. */
  function availableFor(s, ca, date, nowMs) {
    var cap = buildCapacity(ca, s.rules, date, date)[date];
    return cap - reservedFor(s.reservations, ca.id, date, nowMs);
  }

  /* True only if the minimum availability across the whole window is at least qty. */
  function canFit(s, centerAccId, startDate, endDate, qty, nowMs) {
    var ca = centerAccById(s, centerAccId);
    if (!ca || qty < 1) { return false; }
    var cap = buildCapacity(ca, s.rules, startDate, endDate);
    return eachDate(startDate, endDate).every(function (d) {
      return cap[d] - reservedFor(s.reservations, ca.id, d, nowMs) >= qty;
    });
  }

  /* Centers that approved this provider and satisfy every need for the whole window.
     needs: [{code, qty}]. location: optional postal-code prefix. */
  function searchCenters(s, providerId, needs, startDate, endDate, location, nowMs) {
    var out = [];
    s.centers.forEach(function (c) {
      if (!isApproved(s, c.id, providerId)) { return; }
      if (location && String(c.postal).indexOf(location) !== 0) { return; }
      var ok = needs.every(function (n) {
        var ca = centerAccsFor(s, c.id).filter(function (x) { return x.code === n.code; })[0];
        return ca && canFit(s, ca.id, startDate, endDate, n.qty, nowMs);
      });
      if (ok) { out.push(c); }
    });
    return out;
  }

  /* Dates where a proposed capacity change would drop below what is already reserved.
     proposedCa / proposedRules replace the current ones for that accommodation. */
  function capacityConflicts(s, centerAccId, proposedCa, proposedRules, nowMs) {
    var live = s.reservations.filter(function (r) { return r.centerAccId === centerAccId && isActiveReservation(r, nowMs); });
    var seen = {}, out = [];
    live.forEach(function (r) {
      eachDate(r.start, r.end).forEach(function (d) {
        if (seen[d]) { return; }
        seen[d] = true;
        var cap = buildCapacity(proposedCa, proposedRules, d, d)[d];
        var reserved = reservedFor(s.reservations, centerAccId, d, nowMs);
        if (cap < reserved) { out.push({ date: d, capacity: cap, reserved: reserved }); }
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  /* ---------------------------------------------------------------- reservation actions */
  function newId(s) { s.nextId += 1; return 'R-' + s.nextId; }
  function newRef() { return 'ext_' + Math.random().toString(16).slice(2, 8); }

  /* All-or-nothing: either every requested accommodation is held, or none. */
  function placeHold(providerId, centerId, needs, startDate, endDate) {
    var s = load(), now = Date.now();
    if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
      return { status: 400, body: { error: { code: 'invalid_request', message: 'Dates must be YYYY-MM-DD and end must not be before start.' } } };
    }
    if (!needs.length) {
      return { status: 400, body: { error: { code: 'invalid_request', message: 'At least one accommodation is required.' } } };
    }
    var center = centerById(s, centerId);
    if (!center || !isApproved(s, centerId, providerId)) { return notFound('center'); }
    var picked = [];
    for (var i = 0; i < needs.length; i++) {
      var ca = centerAccsFor(s, centerId).filter(function (x) { return x.code === needs[i].code; })[0];
      if (!ca || !ca.active) {
        return { status: 409, body: { error: { code: 'accommodation_unavailable', message: 'Center does not offer ' + needs[i].code + '.' } } };
      }
      if (!canFit(s, ca.id, startDate, endDate, needs[i].qty, now)) {
        return { status: 409, body: { error: { code: 'insufficient_availability', message: 'Not enough ' + needs[i].code + ' for the whole window.' } } };
      }
      picked.push({ ca: ca, qty: needs[i].qty });
    }
    var made = picked.map(function (p) {
      var r = { id: newId(s), centerId: centerId, centerAccId: p.ca.id, providerId: providerId, qty: p.qty,
        start: startDate, end: endDate, status: 'held', ref: newRef(), createdAt: now, expiresAt: now + HOLD_MS, cancelReason: '' };
      s.reservations.push(r);
      return r;
    });
    save();
    return { status: 201, body: { data: made.map(publicReservation) } };
  }

  function confirmHold(providerId, reservationId) {
    var s = load(); expireHolds(s);
    var r = s.reservations.filter(function (x) { return x.id === reservationId && x.providerId === providerId; })[0];
    if (!r) { return notFound('reservation'); }
    if (r.status === 'expired') { return { status: 409, body: { error: { code: 'hold_expired', message: 'This hold expired. Place a new hold.' } } }; }
    if (r.status !== 'held') { return { status: 409, body: { error: { code: 'invalid_state', message: 'Only held reservations can be confirmed (status is ' + r.status + ').' } } }; }
    r.status = 'confirmed'; r.expiresAt = null;
    save();
    return { status: 200, body: { data: publicReservation(r) } };
  }

  function cancelReservation(reservationId, reason, providerId) {
    var s = load();
    var r = s.reservations.filter(function (x) { return x.id === reservationId && (!providerId || x.providerId === providerId); })[0];
    if (!r) { return notFound('reservation'); }
    if (r.status !== 'held' && r.status !== 'confirmed') {
      return { status: 409, body: { error: { code: 'invalid_state', message: 'Reservation is already ' + r.status + '.' } } };
    }
    r.status = 'cancelled'; r.cancelReason = reason || ''; r.expiresAt = null;
    save();
    return { status: 200, body: { data: publicReservation(r) } };
  }

  /* Provider-facing shape: no candidate data, only an opaque external reference. */
  function publicReservation(r) {
    var s = load(), ca = centerAccById(s, r.centerAccId);
    return {
      id: r.id, center_id: r.centerId, accommodation: ca ? ca.code : null, quantity: r.qty,
      start_date: r.start, end_date: r.end, status: r.status,
      expires_at: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      external_reference: r.ref
    };
  }
  function notFound(what) {
    return { status: 404, body: { error: { code: 'not_found', message: 'No such ' + what + '.' } } };
  }

  /* ---------------------------------------------------------------- API simulation
     One entry point shared by the API explorer, shaped like the planned REST API.
     req: { method, path, query:{}, body:{} }  ->  { status, body } */
  function api(providerId, req) {
    var s = load(), now = Date.now(), q = req.query || {}, b = req.body || {};
    expireHolds(s);
    if (!provider(providerId)) { return { status: 401, body: { error: { code: 'unauthorized', message: 'Missing or invalid API key.' } } }; }
    var m;

    if (req.method === 'GET' && req.path === '/v1/centers') {
      return { status: 200, body: { data: s.centers.filter(function (c) { return isApproved(s, c.id, providerId); }).map(publicCenter) } };
    }

    if (req.method === 'GET' && (m = req.path.match(/^\/v1\/centers\/([^/]+)\/availability$/))) {
      var c = centerById(s, m[1]);
      if (!c || !isApproved(s, c.id, providerId)) { return notFound('center'); }
      if (!isDate(q.from) || !isDate(q.to) || q.to < q.from) {
        return { status: 400, body: { error: { code: 'invalid_request', message: 'from and to must be YYYY-MM-DD, to not before from.' } } };
      }
      var wanted = q.accommodations || [];
      var accs = centerAccsFor(s, c.id).filter(function (ca) {
        return ca.active && (!wanted.length || wanted.some(function (w) { return w.code === ca.code; }));
      });
      return { status: 200, body: { data: {
        center_id: c.id, from: q.from, to: q.to,
        accommodations: accs.map(function (ca) {
          var cap = buildCapacity(ca, s.rules, q.from, q.to);
          var days = eachDate(q.from, q.to).map(function (d) {
            return { date: d, available: cap[d] - reservedFor(s.reservations, ca.id, d, now) };
          });
          var w = wanted.filter(function (x) { return x.code === ca.code; })[0];
          var item = { code: ca.code, name: catalogItem(ca.code).name, days: days };
          if (w) { item.requested_quantity = w.qty; item.fits_window = canFit(s, ca.id, q.from, q.to, w.qty, now); }
          return item;
        })
      } } };
    }

    if (req.method === 'GET' && req.path === '/v1/availability/search') {
      if (!isDate(q.start) || !isDate(q.end) || q.end < q.start || !(q.needs || []).length) {
        return { status: 400, body: { error: { code: 'invalid_request', message: 'start, end and at least one need are required.' } } };
      }
      var hits = searchCenters(s, providerId, q.needs, q.start, q.end, q.postal || '', now);
      return { status: 200, body: { data: hits.map(publicCenter) } };
    }

    if (req.method === 'POST' && req.path === '/v1/holds') {
      return placeHold(providerId, b.center_id, b.accommodations || [], b.start_date, b.end_date);
    }
    if (req.method === 'POST' && (m = req.path.match(/^\/v1\/holds\/([^/]+)\/confirm$/))) {
      return confirmHold(providerId, m[1]);
    }
    if (req.method === 'DELETE' && (m = req.path.match(/^\/v1\/reservations\/([^/]+)$/))) {
      return cancelReservation(m[1], 'Cancelled by provider.', providerId);
    }
    return { status: 404, body: { error: { code: 'not_found', message: 'Unknown endpoint.' } } };
  }
  function publicCenter(c) {
    return { id: c.id, name: c.name, city: c.city, region: c.region, postal_code: c.postal, country: c.country };
  }

  /* ---------------------------------------------------------------- session */
  function login(email, password) {
    var s = load();
    var c = s.centers.filter(function (x) { return x.email.toLowerCase() === String(email).trim().toLowerCase(); })[0];
    if (!c || !password) { return { ok: false, message: 'Email or password is incorrect.' }; }
    if (!c.verified) { return { ok: false, message: 'Please verify your email before logging in.' }; }
    s.session = { centerId: c.id }; save();
    return { ok: true };
  }
  function logout() { var s = load(); s.session = null; save(); }

  /* ---------------------------------------------------------------- page shell */
  var OWNER_NAV = [
    ['accommodations.html', 'Accommodations'],
    ['availability.html', 'Availability'],
    ['reservations.html', 'Reservations'],
    ['providers.html', 'Providers']
  ];

  /* opts: { page: 'accommodations.html', owner: true|false } */
  function shell(opts) {
    function build() {
      var s = load(), main = document.getElementById('main');
      if (!main) { return; }
      var center = opts.owner ? currentCenter() : null;
      if (opts.owner && !center) { location.href = 'login.html'; return; }

      var banner = document.createElement('div');
      banner.className = 'banner';
      banner.setAttribute('role', 'note');
      banner.textContent = 'Prototype: sample data only. Nothing here is saved to a server.';

      var top = document.createElement('header');
      top.className = 'topbar';
      top.innerHTML = '<a class="brand" href="index.html">Seat-Sync <span>demo</span></a>' +
        (center ? '<span class="who">' + esc(center.name) + '</span>' : '<span class="who"></span>') +
        '<button type="button" class="btn small ghost" id="ss-reset">Reset demo data</button>' +
        (center ? '<button type="button" class="btn small" id="ss-logout">Logout</button>' : '');

      var layout = document.createElement('div');
      layout.className = 'layout' + (opts.owner ? '' : ' single');
      if (opts.owner) {
        var nav = document.createElement('nav');
        nav.setAttribute('aria-label', 'Main');
        nav.innerHTML = OWNER_NAV.map(function (n) {
          var cur = n[0] === opts.page;
          return '<a href="' + n[0] + '"' + (cur ? ' aria-current="page" class="current"' : '') + '>' + n[1] + '</a>';
        }).join('');
        layout.appendChild(nav);
      }
      main.parentNode.insertBefore(banner, main);
      main.parentNode.insertBefore(top, main);
      main.parentNode.insertBefore(layout, main);
      layout.appendChild(main);

      document.getElementById('ss-reset').addEventListener('click', function () {
        if (window.confirm('Restore the sample data? Your changes in this browser will be lost.')) {
          reset(); location.href = 'index.html';
        }
      });
      var lo = document.getElementById('ss-logout');
      if (lo) { lo.addEventListener('click', function () { logout(); location.href = 'index.html'; }); }
      void s;
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', build); } else { build(); }
  }

  /* Small helper: write a status message into an element with role="status"/"alert". */
  function flash(el, text, kind) {
    el.className = 'msg ' + (kind || 'info');
    el.textContent = text;
    el.hidden = !text;
  }

  global.SS = {
    // dates
    today: today, addDays: addDays, eachDate: eachDate, weekday: weekday, isDate: isDate, prettyDate: prettyDate,
    DAYS: DAYS, MONTHS: MONTHS, esc: esc, toDate: toDate, fmtDate: fmtDate,
    // state
    load: load, save: save, reset: reset, expireHolds: expireHolds,
    catalogItem: catalogItem, provider: provider, centerById: centerById, centerAccById: centerAccById,
    centerAccsFor: centerAccsFor, isApproved: isApproved, currentCenter: currentCenter,
    // engine
    buildCapacity: buildCapacity, reservedFor: reservedFor, availableFor: availableFor, canFit: canFit,
    searchCenters: searchCenters, capacityConflicts: capacityConflicts, isActiveReservation: isActiveReservation,
    // actions
    placeHold: placeHold, confirmHold: confirmHold, cancelReservation: cancelReservation, api: api,
    login: login, logout: logout, shell: shell, flash: flash, HOLD_MS: HOLD_MS
  };
})(window);
