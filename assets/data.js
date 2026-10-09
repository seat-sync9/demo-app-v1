/* Seat-Sync prototype: seed data. All names are fictional. */
(function (global) {
  'use strict';

  // Accommodation catalog. kind: resource (a physical thing/space), capability (a service or software), modifier (a rule change).
  var CATALOG = [
    { code: 'private-room', name: 'Private room', category: 'Environment', kind: 'resource' },
    { code: 'low-distraction-room', name: 'Low-distraction room', category: 'Environment', kind: 'resource' },
    { code: 'reduced-lighting', name: 'Reduced-lighting station', category: 'Environment', kind: 'resource' },
    { code: 'quiet-waiting-area', name: 'Quiet waiting area', category: 'Environment', kind: 'resource' },
    { code: 'wheelchair-station', name: 'Wheelchair-accessible station', category: 'Physical access', kind: 'resource' },
    { code: 'adjustable-desk', name: 'Adjustable-height desk', category: 'Physical access', kind: 'resource' },
    { code: 'ergonomic-chair', name: 'Ergonomic chair', category: 'Physical access', kind: 'resource' },
    { code: 'foot-rest', name: 'Foot rest', category: 'Physical access', kind: 'resource' },
    { code: 'screen-reader', name: 'Screen reader software', category: 'Assistive technology', kind: 'capability' },
    { code: 'screen-magnifier', name: 'Screen magnification software', category: 'Assistive technology', kind: 'capability' },
    { code: 'text-to-speech', name: 'Text-to-speech', category: 'Assistive technology', kind: 'capability' },
    { code: 'speech-to-text', name: 'Speech-to-text', category: 'Assistive technology', kind: 'capability' },
    { code: 'trackball', name: 'Trackball mouse', category: 'Assistive technology', kind: 'resource' },
    { code: 'noise-headphones', name: 'Noise-reducing headphones', category: 'Equipment', kind: 'resource' },
    { code: 'ear-plugs', name: 'Ear plugs', category: 'Equipment', kind: 'resource' },
    { code: 'medical-space', name: 'Medical equipment space', category: 'Medical', kind: 'resource' },
    { code: 'snack-break', name: 'Snack/medication break access', category: 'Medical', kind: 'modifier' },
    { code: 'scribe', name: 'Scribe', category: 'Staff support', kind: 'capability' },
    { code: 'reader', name: 'Reader', category: 'Staff support', kind: 'capability' },
    { code: 'sign-interpreter', name: 'Sign language interpreter', category: 'Staff support', kind: 'capability' },
    { code: 'extended-time', name: 'Extended time', category: 'Timing', kind: 'modifier' },
    { code: 'extra-breaks', name: 'Extra breaks', category: 'Timing', kind: 'modifier' },
    { code: 'large-print', name: 'Large-print materials', category: 'Materials', kind: 'resource' },
    { code: 'braille', name: 'Braille materials', category: 'Materials', kind: 'resource' },
    { code: 'colored-overlay', name: 'Colored overlay', category: 'Materials', kind: 'resource' }
  ];

  var PROVIDERS = [
    { id: 'prov_a', name: 'Brightpath Exams (fictional)', apiKey: 'ss_test_brightpath_0001' },
    { id: 'prov_b', name: 'Cedar Assessment Co. (fictional)', apiKey: 'ss_test_cedar_0002' },
    { id: 'prov_c', name: 'Delta Credentialing (fictional)', apiKey: 'ss_test_delta_0003' }
  ];

  /**
   * Builds the full starting state. Dates are relative to "today" so the demo never looks stale.
   * h = { today: 'YYYY-MM-DD', addDays: fn, now: ms }
   */
  function makeSeed(h) {
    var t = h.today, d = h.addDays, now = h.now;

    var centers = [
      { id: 'ctr_001', name: 'Harborview Testing Center (fictional)', ownerFirst: 'Demo', ownerLast: 'Owner One',
        email: 'owner1@harborview.example', verified: true,
        street: '100 Example Way', city: 'Lakeport', region: 'OR', postal: '97000', country: 'US', phone: '555-0100', timeZone: 'America/Los_Angeles' },
      { id: 'ctr_002', name: 'Northgate Assessment Hub (fictional)', ownerFirst: 'Demo', ownerLast: 'Owner Two',
        email: 'owner2@northgate.example', verified: true,
        street: '200 Sample Street', city: 'Riverton', region: 'TX', postal: '75000', country: 'US', phone: '555-0200', timeZone: 'America/Chicago' }
    ];

    // Center accommodations: one row per (center, catalog item).
    var centerAccs = [
      { id: 'ca_01', centerId: 'ctr_001', code: 'private-room', qty: 2, notes: 'Two rooms, one with a window.', fav: true, active: true },
      { id: 'ca_02', centerId: 'ctr_001', code: 'screen-reader', qty: 2, notes: '', fav: false, active: true },
      { id: 'ca_03', centerId: 'ctr_001', code: 'scribe', qty: 1, notes: 'Weekdays only.', fav: false, active: true },
      { id: 'ca_04', centerId: 'ctr_001', code: 'extended-time', qty: 10, notes: 'Up to 2x standard time.', fav: true, active: true },
      { id: 'ca_05', centerId: 'ctr_001', code: 'wheelchair-station', qty: 1, notes: '', fav: false, active: true },
      { id: 'ca_06', centerId: 'ctr_001', code: 'large-print', qty: 3, notes: '', fav: false, active: true },
      { id: 'ca_11', centerId: 'ctr_002', code: 'private-room', qty: 1, notes: '', fav: true, active: true },
      { id: 'ca_12', centerId: 'ctr_002', code: 'reader', qty: 2, notes: '', fav: false, active: true },
      { id: 'ca_13', centerId: 'ctr_002', code: 'adjustable-desk', qty: 2, notes: '', fav: false, active: true },
      { id: 'ca_14', centerId: 'ctr_002', code: 'noise-headphones', qty: 4, notes: '', fav: false, active: true },
      { id: 'ca_15', centerId: 'ctr_002', code: 'medical-space', qty: 1, notes: 'Needs 24h notice.', fav: false, active: true },
      { id: 'ca_16', centerId: 'ctr_002', code: 'extended-time', qty: 8, notes: '', fav: false, active: true }
    ];

    // Availability exceptions. type: date | range | weekday. weekday uses days 0=Sun..6=Sat within start..end.
    var rules = [
      { id: 'rl_01', centerAccId: 'ca_01', type: 'date', start: d(t, 5), end: d(t, 5), days: [], qty: 0 },
      { id: 'rl_02', centerAccId: 'ca_01', type: 'range', start: d(t, 10), end: d(t, 12), days: [], qty: 1 },
      { id: 'rl_03', centerAccId: 'ca_03', type: 'weekday', start: t, end: d(t, 90), days: [0, 6], qty: 0 },
      { id: 'rl_04', centerAccId: 'ca_11', type: 'date', start: d(t, 3), end: d(t, 3), days: [], qty: 0 },
      { id: 'rl_05', centerAccId: 'ca_14', type: 'range', start: d(t, 20), end: d(t, 24), days: [], qty: 2 }
    ];

    var approvals = [
      { centerId: 'ctr_001', providerId: 'prov_a' },
      { centerId: 'ctr_002', providerId: 'prov_a' },
      { centerId: 'ctr_001', providerId: 'prov_b' }
    ];

    function res(n, caId, centerId, prov, qty, s, e, status, ref, extra) {
      var r = { id: 'R-' + (1000 + n), centerId: centerId, centerAccId: caId, providerId: prov, qty: qty,
        start: s, end: e, status: status, ref: ref, createdAt: now - 86400000 * 3, expiresAt: null, cancelReason: '' };
      for (var k in extra) { r[k] = extra[k]; }
      return r;
    }
    var reservations = [
      res(1, 'ca_01', 'ctr_001', 'prov_a', 1, d(t, -30), d(t, -30), 'confirmed', 'ext_9f2a01'),
      res(2, 'ca_02', 'ctr_001', 'prov_a', 1, d(t, -21), d(t, -21), 'confirmed', 'ext_9f2a02'),
      res(3, 'ca_01', 'ctr_001', 'prov_b', 1, d(t, -14), d(t, -14), 'cancelled', 'ext_7c11b3', { cancelReason: 'Candidate rescheduled.' }),
      res(4, 'ca_04', 'ctr_001', 'prov_a', 4, d(t, -7), d(t, -7), 'confirmed', 'ext_9f2a04'),
      res(5, 'ca_01', 'ctr_001', 'prov_a', 1, d(t, 2), d(t, 2), 'confirmed', 'ext_9f2a05'),
      res(6, 'ca_01', 'ctr_001', 'prov_b', 1, d(t, 2), d(t, 2), 'confirmed', 'ext_7c11b6'),
      res(7, 'ca_02', 'ctr_001', 'prov_a', 2, d(t, 7), d(t, 8), 'confirmed', 'ext_9f2a07'),
      res(8, 'ca_05', 'ctr_001', 'prov_b', 1, d(t, 14), d(t, 14), 'held', 'ext_7c11b8', { createdAt: now - 60000, expiresAt: now + 14 * 60000 }),
      res(9, 'ca_11', 'ctr_002', 'prov_a', 1, d(t, -10), d(t, -10), 'confirmed', 'ext_9f2a09'),
      res(10, 'ca_12', 'ctr_002', 'prov_a', 1, d(t, 4), d(t, 4), 'confirmed', 'ext_9f2a10'),
      res(11, 'ca_14', 'ctr_002', 'prov_a', 3, d(t, 21), d(t, 22), 'confirmed', 'ext_9f2a11'),
      res(12, 'ca_13', 'ctr_002', 'prov_a', 1, d(t, 9), d(t, 9), 'expired', 'ext_9f2a12', { createdAt: now - 7200000, expiresAt: now - 6300000 })
    ];

    return {
      version: 1,
      nextId: 2000,
      session: null,
      centers: centers,
      centerAccs: centerAccs,
      rules: rules,
      approvals: approvals,
      reservations: reservations
    };
  }

  global.SeatSyncSeed = { CATALOG: CATALOG, PROVIDERS: PROVIDERS, make: makeSeed };
})(window);
