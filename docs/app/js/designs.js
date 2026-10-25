/*
 * BUHAY-AH design generator: turns a usage, a requirement (classrooms, beds, staff, persons, stalls,
 * passengers, loading bays) or a budget into a schematic building, bridge, airfield or port design
 * that the cost engine can price.
 *
 * Buildings are composed from reusable space modules (DepEd 7 × 9 m classroom, wards, offices,
 * hall bays, stall bays, toilets, stairs) laid out as single-loaded, double-loaded or open plans.
 * Any design, including one the user saved, can be added as a wing of another design.
 * Budget-to-design searches storeys × capacity for the largest program whose quotation fits the budget.
 * Drawings are schematic (SVG) and not for construction.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.BuhayDesign = factory(root.BuhayEngine);
}(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // ------------------------------------------------------------------ space modules
  // w: width along the building length (m); d: depth (m, 0 = takes the row depth)
  // cap: capacity the space adds; ground: prefers the ground floor
  var S = {};
  function sp(id, name, w, d, cat, groups, cap, ground) { S[id] = { id: id, name: name, w: w, d: d, cat: cat, groups: groups, cap: cap || {}, ground: !!ground }; }
  // learning (school row depth 7 m, DepEd standard classroom 7 × 9 m)
  sp('classroom', 'Classroom (7 × 9 m)', 9.0, 7.0, 'learning', ['school'], { classrooms: 1, learners: 45 });
  sp('kinder', 'Kindergarten room with toilet', 9.0, 7.0, 'learning', ['school', 'civic'], { classrooms: 1, learners: 30 }, true);
  sp('science_lab', 'Science laboratory', 13.5, 7.0, 'learning', ['school'], {});
  sp('ict_lab', 'ICT / computer room', 9.0, 7.0, 'learning', ['school'], {});
  sp('library', 'Library / learning resource center', 13.5, 7.0, 'learning', ['school', 'civic'], {});
  sp('tvl_shop', 'TVL workshop', 13.5, 7.0, 'learning', ['school'], {}, true);
  sp('faculty', 'Faculty room', 9.0, 7.0, 'office', ['school'], {});
  sp('school_admin', 'Principal / admin office', 4.5, 7.0, 'office', ['school'], {}, true);
  sp('school_clinic', 'School clinic', 4.5, 7.0, 'health', ['school'], {}, true);
  sp('guidance', 'Guidance office', 4.5, 7.0, 'office', ['school'], {});
  sp('toilet_school', 'Toilets (boys / girls / PWD)', 4.5, 7.0, 'service', ['school', 'civic'], {});
  // health (double-loaded, row depth 5 m)
  sp('consult', 'Consultation room', 3.5, 5.0, 'health', ['health'], { consult: 1 }, true);
  sp('treatment', 'Treatment / emergency room', 5.0, 5.0, 'health', ['health'], {}, true);
  sp('ward6', 'Ward (6 beds)', 7.0, 5.0, 'health', ['health'], { beds: 6 });
  sp('labor', 'Labor & recovery (2 beds)', 4.0, 5.0, 'health', ['health'], { beds: 2 });
  sp('isolation', 'Isolation room (1 bed)', 4.0, 5.0, 'health', ['health'], { beds: 1 });
  sp('delivery', 'Delivery room', 5.0, 5.0, 'health', ['health'], {});
  sp('lab', 'Laboratory', 4.0, 5.0, 'health', ['health'], {});
  sp('pharmacy', 'Pharmacy & dispensing', 3.5, 5.0, 'health', ['health'], {}, true);
  sp('dental', 'Dental room', 3.5, 5.0, 'health', ['health'], {});
  sp('nurse', 'Nurse station', 3.5, 5.0, 'health', ['health'], {});
  sp('waiting', 'Waiting area', 7.0, 5.0, 'assembly', ['health'], {}, true);
  sp('health_admin', 'Admin & records', 4.0, 5.0, 'office', ['health'], {});
  sp('toilet_health', 'Toilet & bath (PWD)', 3.5, 5.0, 'service', ['health'], {});
  // offices (double-loaded, row depth 6 m)
  sp('office_open', 'Open office (6 staff)', 6.0, 6.0, 'office', ['office'], { staff: 6 });
  sp('office_private', 'Private office', 4.0, 6.0, 'office', ['office'], { staff: 1 });
  sp('session_hall', 'Session hall', 12.0, 6.0, 'assembly', ['office'], {});
  sp('conference', 'Conference room', 6.0, 6.0, 'assembly', ['office'], {});
  sp('records', 'Records & storage', 4.0, 6.0, 'service', ['office'], {});
  sp('lobby', 'Lobby & public counter', 6.0, 6.0, 'assembly', ['office', 'civic'], {}, true);
  sp('custodial', 'Custodial facility', 4.0, 6.0, 'service', ['office'], {}, true);
  sp('pantry', 'Pantry', 3.0, 6.0, 'service', ['office'], {});
  sp('toilet_office', 'Toilets (M / F / PWD)', 4.0, 6.0, 'service', ['office', 'market'], {});
  // evacuation & assembly (open plan, row depth 12 m)
  sp('hall_bay', 'Hall bay (20 persons at 3.5 m²)', 6.0, 12.0, 'assembly', ['evacuation', 'civic'], { persons: 20 });
  sp('stage', 'Stage', 8.0, 12.0, 'assembly', ['evacuation', 'court', 'civic'], {});
  sp('kitchen', 'Communal kitchen', 4.0, 12.0, 'service', ['evacuation', 'civic'], {}, true);
  sp('showers', 'Toilets & showers (M / F / PWD)', 5.0, 12.0, 'service', ['evacuation', 'court', 'civic'], {}, true);
  sp('wcfs', 'Women & child-friendly space', 4.0, 12.0, 'health', ['evacuation'], {});
  sp('triage', 'Health & triage', 4.0, 12.0, 'health', ['evacuation'], {}, true);
  sp('relief_store', 'Relief goods storage', 4.0, 12.0, 'service', ['evacuation'], {}, true);
  // market (open plan, row depth 12 m = two stall rows)
  sp('wet_bay', 'Wet section bay (12 stalls)', 6.0, 12.0, 'commerce', ['market'], { stalls: 12 }, true);
  sp('dry_bay', 'Dry goods bay (10 stalls)', 6.0, 12.0, 'commerce', ['market'], { stalls: 10 });
  sp('food_bay', 'Eatery bay (6 stalls)', 6.0, 12.0, 'commerce', ['market'], { stalls: 6 });
  sp('market_office', 'Market office', 4.0, 12.0, 'office', ['market'], {}, true);
  sp('loading', 'Loading & receiving', 6.0, 12.0, 'service', ['market'], {}, true);
  sp('toilet_market', 'Toilets (M / F / PWD)', 4.0, 12.0, 'service', ['market'], {}, true);
  // living (double-loaded, row depth 5 m)
  sp('dorm_room', 'Dorm room (8 beds)', 4.5, 5.0, 'living', ['dorm'], { beds: 8 });
  sp('quarters', 'Staff quarters (2 persons)', 4.5, 5.0, 'living', ['dorm'], { beds: 2 });
  sp('bath', 'Toilet & bath', 3.5, 5.0, 'service', ['dorm'], {});
  sp('lounge', 'Lounge / study area', 6.0, 5.0, 'assembly', ['dorm'], {}, true);
  sp('warden', 'Warden room', 3.5, 5.0, 'office', ['dorm'], {}, true);
  sp('laundry', 'Laundry', 3.0, 5.0, 'service', ['dorm'], {}, true);
  // courts
  sp('court_floor', 'Playing court 28 × 15 m with run-off', 32.0, 20.0, 'assembly', ['court'], { persons: 300 });
  sp('bleachers', 'Bleachers', 4.0, 20.0, 'assembly', ['court'], { persons: 120 });
  // hospitals (double-loaded, row depth 6 m, DOH A.O. 2016-0042 patient corridor 2.44 m)
  sp('hosp_lobby', 'Lobby, admitting & cashier', 9.0, 6.0, 'assembly', ['hospital'], {}, true);
  sp('hosp_er', 'Emergency room (6 bays)', 12.0, 6.0, 'health', ['hospital'], {}, true);
  sp('hosp_opd', 'Outpatient clinics (4 rooms)', 12.0, 6.0, 'health', ['hospital'], { consult: 4 }, true);
  sp('hosp_ward', 'Ward (6 beds)', 7.5, 6.0, 'health', ['hospital'], { beds: 6 });
  sp('hosp_private', 'Private room (1 bed, toilet)', 4.0, 6.0, 'health', ['hospital'], { beds: 1 });
  sp('hosp_isolation', 'Isolation room with anteroom (1 bed)', 4.5, 6.0, 'health', ['hospital'], { beds: 1 });
  sp('hosp_icu', 'Intensive care unit (4 beds)', 12.0, 6.0, 'health', ['hospital'], { beds: 4 });
  sp('hosp_or', 'Operating room suite (OR, scrub, recovery)', 12.0, 6.0, 'health', ['hospital'], {});
  sp('hosp_dr', 'Delivery suite (DR + 2 labor beds)', 9.0, 6.0, 'health', ['hospital'], { beds: 2 });
  sp('hosp_nicu', 'Nursery / NICU', 6.0, 6.0, 'health', ['hospital'], {});
  sp('hosp_lab', 'Clinical laboratory', 9.0, 6.0, 'health', ['hospital'], {}, true);
  sp('hosp_xray', 'Radiology (X-ray, ultrasound)', 9.0, 6.0, 'health', ['hospital'], {}, true);
  sp('hosp_pharm', 'Pharmacy', 6.0, 6.0, 'health', ['hospital'], {}, true);
  sp('hosp_dialysis', 'Dialysis unit (6 stations)', 12.0, 6.0, 'health', ['hospital'], {});
  sp('hosp_cssd', 'Central sterile supply', 6.0, 6.0, 'service', ['hospital'], {});
  sp('hosp_dietary', 'Dietary / kitchen', 9.0, 6.0, 'service', ['hospital'], {}, true);
  sp('hosp_laundry', 'Laundry & linen', 6.0, 6.0, 'service', ['hospital'], {}, true);
  sp('hosp_admin', 'Administration & medical records', 9.0, 6.0, 'office', ['hospital'], {});
  sp('hosp_morgue', 'Morgue', 4.0, 6.0, 'service', ['hospital'], {}, true);
  sp('hosp_waste', 'Health-care waste holding & MRF', 4.0, 6.0, 'service', ['hospital'], {}, true);
  sp('hosp_nurse', 'Nurse station & treatment', 6.0, 6.0, 'health', ['hospital'], {});
  sp('hosp_toilet', 'Public toilets (M / F / PWD)', 4.0, 6.0, 'service', ['hospital'], {});
  // airport passenger terminals (open plan, row depth 20 m; IATA ADRM space per peak-hour passenger)
  sp('ap_curb', 'Departure curbside & entrance hall', 12.0, 20.0, 'assembly', ['airport'], {}, true);
  sp('ap_checkin', 'Check-in hall (8 counters)', 12.0, 20.0, 'office', ['airport'], {}, true);
  sp('ap_security', 'Security screening (2 lanes)', 8.0, 20.0, 'service', ['airport'], {}, true);
  sp('ap_hold', 'Departure holdroom (80 passengers)', 12.0, 20.0, 'assembly', ['airport'], { pax: 80 });
  sp('ap_concourse', 'Concourse & circulation', 12.0, 20.0, 'assembly', ['airport'], {});
  sp('ap_claim', 'Baggage claim hall (1 carousel)', 12.0, 20.0, 'assembly', ['airport'], {}, true);
  sp('ap_makeup', 'Baggage make-up area', 8.0, 20.0, 'service', ['airport'], {}, true);
  sp('ap_arrival', 'Arrival hall & greeters', 12.0, 20.0, 'assembly', ['airport'], {}, true);
  sp('ap_admin', 'Terminal administration & CAAP offices', 8.0, 20.0, 'office', ['airport'], {});
  sp('ap_food', 'Concessions & food court', 8.0, 20.0, 'commerce', ['airport'], {});
  sp('ap_vip', 'VIP & PWD lounge', 6.0, 20.0, 'assembly', ['airport'], {});
  sp('ap_plant', 'Utility, AC plant & generator room', 8.0, 20.0, 'service', ['airport'], {}, true);
  sp('ap_toilet', 'Toilets (M / F / PWD)', 5.0, 20.0, 'service', ['airport'], {});
  // seaport passenger terminals (open plan, row depth 15 m)
  sp('sp_lobby', 'Entrance lobby & ticketing', 9.0, 15.0, 'assembly', ['seaport'], {}, true);
  sp('sp_wait', 'Passenger waiting lounge (120 seats)', 12.0, 15.0, 'assembly', ['seaport'], { pax: 120 });
  sp('sp_predep', 'Pre-departure area & security check', 9.0, 15.0, 'service', ['seaport'], {}, true);
  sp('sp_bag', 'Baggage & cargo check-in', 6.0, 15.0, 'service', ['seaport'], {}, true);
  sp('sp_admin', 'PPA, Coast Guard & port police offices', 9.0, 15.0, 'office', ['seaport'], {});
  sp('sp_food', 'Concessions', 6.0, 15.0, 'commerce', ['seaport'], {});
  sp('sp_clinic', 'First aid, PWD & senior lounge', 5.0, 15.0, 'health', ['seaport'], {});
  sp('sp_toilet', 'Toilets (M / F / PWD)', 5.0, 15.0, 'service', ['seaport'], {});
  // land transport terminals: passenger concourse (open plan, row depth 10 m); loading bays are site works
  var TERM = ['jeepterm', 'uvterm', 'busterm'];
  sp('tr_waiting', 'Passenger waiting area (60 seats)', 9.0, 10.0, 'assembly', TERM, {});
  sp('tr_ticket', 'Ticketing & dispatch booths', 4.0, 10.0, 'office', TERM, {}, true);
  sp('tr_office', 'Terminal office & LGU / LTFRB desk', 6.0, 10.0, 'office', TERM, {});
  sp('tr_food', 'Food stalls (4)', 8.0, 10.0, 'commerce', TERM, {});
  sp('tr_lounge', 'PWD, senior & breastfeeding lounge', 4.0, 10.0, 'assembly', TERM, {}, true);
  sp('tr_driver', 'Drivers\' lounge & dispatch', 5.0, 10.0, 'service', TERM, {}, true);
  sp('tr_parcel', 'Parcel & baggage counter', 4.0, 10.0, 'service', TERM, {}, true);
  sp('tr_toilet', 'Toilets (M / F / PWD)', 5.0, 10.0, 'service', TERM, {});
  // circulation (any usage)
  sp('stair', 'Stair', 3.5, 0, 'circulation', ['all'], {});

  // loading bays by design vehicle (AASHTO 2018: bus 12 m; modern jeepney 9 m; UV Express van 5.4 m):
  // w bay width, d stall depth, drive aisle share, hold = queueing / holding area share, canopy depth over the loading lane
  var BAYS = {
    jeep: { label: 'jeepney', w: 3.5, d: 10.0, drive: 7.0, hold: 0.40, canopy: 6.0 },
    uv:   { label: 'UV Express', w: 3.0, d: 6.5, drive: 6.0, hold: 0.40, canopy: 4.5 },
    bus:  { label: 'bus', w: 4.5, d: 15.0, drive: 12.0, hold: 0.25, canopy: 6.0 }
  };
  function siteOf(bays) {
    var out = { bays: 0, pave: 0, canopy: 0, list: [] };
    Object.keys(BAYS).forEach(function (m) {
      var n = (bays && bays[m]) || 0, b = BAYS[m];
      if (!n) return;
      out.bays += n; out.pave += n * b.w * (b.d + b.drive) * (1 + b.hold); out.canopy += n * b.w * b.canopy;
      out.list.push({ mode: m, n: n });
    });
    out.pave = Math.round(out.pave); out.canopy = Math.round(out.canopy);
    return out;
  }

  // ------------------------------------------------------------------ usages
  var USAGE = {
    school:     { label: 'School building', costType: 'school', layout: 'single', depth: 7.0, corridor: 2.5, fh: 3.3, bay: 4.5, cap: 'classrooms', capLabel: 'classrooms', unit: 'classroom', range: [1, 40, 1] },
    health:     { label: 'Health facility', costType: 'health', layout: 'double', depth: 5.0, corridor: 2.4, fh: 3.3, bay: 5.0, cap: 'beds', capLabel: 'beds', unit: 'bed', range: [0, 150, 1] },
    office:     { label: 'Government office', costType: 'office', layout: 'double', depth: 6.0, corridor: 2.4, fh: 3.4, bay: 6.0, cap: 'staff', capLabel: 'staff', unit: 'staff', range: [6, 300, 6] },
    evacuation: { label: 'Evacuation center / multi-purpose hall', costType: 'evacuation', layout: 'open', depth: 12.0, corridor: 0, fh: 5.0, bay: 6.0, cap: 'persons', capLabel: 'persons', unit: 'person', range: [40, 1500, 20] },
    market:     { label: 'Public market', costType: 'market', layout: 'open', depth: 12.0, corridor: 0, fh: 4.5, bay: 6.0, cap: 'stalls', capLabel: 'stalls', unit: 'stall', range: [20, 500, 10] },
    dorm:       { label: 'Dormitory / quarters', costType: 'dorm', layout: 'double', depth: 5.0, corridor: 2.0, fh: 3.0, bay: 4.5, cap: 'beds', capLabel: 'beds', unit: 'bed', range: [8, 480, 8] },
    court:      { label: 'Covered court', costType: 'court', layout: 'open', depth: 20.0, corridor: 0, fh: 8.0, bay: 6.0, cap: 'persons', capLabel: 'persons', unit: 'person', range: [300, 900, 120] },
    hospital:   { label: 'Hospital (DOH Level 1–3)', costType: 'hospital', layout: 'double', depth: 6.0, corridor: 2.44, fh: 3.8, bay: 6.0, cap: 'beds', capLabel: 'beds', unit: 'bed', range: [10, 300, 5], lot: 100 },
    airport:    { label: 'Airport passenger terminal', costType: 'airport', layout: 'open', depth: 20.0, corridor: 0, fh: 7.0, bay: 9.0, cap: 'pax', capLabel: 'peak-hour passengers', unit: 'passenger', range: [50, 1500, 50], maxRows: 4, lot: 150 },
    seaport:    { label: 'Seaport passenger terminal', costType: 'seaport', layout: 'open', depth: 15.0, corridor: 0, fh: 5.0, bay: 7.5, cap: 'pax', capLabel: 'passengers', unit: 'passenger', range: [60, 1800, 60], lot: 100 },
    jeepterm:   { label: 'Jeepney terminal', costType: 'terminal', layout: 'open', depth: 10.0, corridor: 0, fh: 4.5, bay: 6.0, cap: 'bays', capLabel: 'jeepney bays', unit: 'bay', range: [4, 80, 2], maxRows: 2, mode: 'jeep', lot: 80 },
    uvterm:     { label: 'UV Express terminal', costType: 'terminal', layout: 'open', depth: 10.0, corridor: 0, fh: 4.5, bay: 6.0, cap: 'bays', capLabel: 'UV Express bays', unit: 'bay', range: [4, 60, 2], maxRows: 2, mode: 'uv', lot: 80 },
    busterm:    { label: 'Bus terminal', costType: 'terminal', layout: 'open', depth: 10.0, corridor: 0, fh: 4.5, bay: 6.0, cap: 'bays', capLabel: 'bus bays', unit: 'bay', range: [2, 40, 1], maxRows: 2, mode: 'bus', lot: 80 }
  };

  // requirement → program (rules follow DepEd, DOH, NBC and DSWD space norms used in the study)
  function programFor(usage, k, N, extra) {
    N = Math.max(1, N || 1);
    var p = { usage: usage, storeys: N, modules: [], perFloor: [] };
    var add = function (id, n) { if (n > 0) p.modules.push([id, n]); };
    var per = function (id, n) { if (n > 0) p.perFloor.push([id, n]); };
    if (usage === 'school') {
      add('classroom', k); per('toilet_school', 1);
      if (k >= 6) { add('school_admin', 1); add('school_clinic', 1); }
      if (k >= 10) { add('faculty', 1); add('library', 1); }
      if (k >= 16) { add('science_lab', 1); add('ict_lab', 1); add('guidance', 1); }
    } else if (usage === 'health') {
      var wards = Math.floor(k / 6), rest = k - 6 * wards, labors = Math.floor(rest / 2), iso = rest - 2 * labors;
      add('consult', 1 + Math.ceil(k / 12)); add('treatment', 1); add('pharmacy', 1); add('waiting', k > 20 ? 2 : 1); add('health_admin', k >= 6 ? 1 : 0);
      if (k > 0) { add('delivery', 1); add('nurse', N); add('lab', 1); }
      add('ward6', wards); add('labor', labors); add('isolation', iso); add('dental', k >= 10 ? 1 : 0);
      per('toilet_health', k > 20 ? 2 : 1);
    } else if (usage === 'office') {
      add('lobby', 1); add('office_open', Math.ceil(k / 6)); add('office_private', Math.max(1, Math.ceil(k / 20)));
      add('conference', 1 + Math.floor(k / 60)); add('records', Math.max(1, Math.ceil(k / 40))); add('pantry', 1);
      add('session_hall', k >= 24 ? 1 : 0); per('toilet_office', k > 60 ? 2 : 1);
    } else if (usage === 'evacuation') {
      add('hall_bay', Math.ceil(k / 20)); add('kitchen', Math.max(1, Math.ceil(k / 250))); add('showers', Math.max(1, Math.ceil(k / 120)));
      add('wcfs', 1); add('triage', 1); add('relief_store', 1);
    } else if (usage === 'market') {
      add('wet_bay', Math.ceil(0.45 * k / 12)); add('dry_bay', Math.ceil(0.40 * k / 10)); add('food_bay', Math.ceil(0.15 * k / 6));
      add('market_office', 1); add('loading', 1); per('toilet_market', k > 120 ? 2 : 1);
    } else if (usage === 'dorm') {
      add('dorm_room', Math.ceil(k / 8)); add('lounge', 1); add('warden', 1); add('laundry', 1); per('bath', Math.max(1, Math.ceil(k / (8 * N) / 3)));
    } else if (usage === 'court') {
      add('court_floor', 1); add('stage', 1); add('showers', 1); add('bleachers', Math.max(0, Math.round((k - 300) / 120)));
    } else if (usage === 'hospital') {
      // service level grows with size (DOH A.O. 2012-0012): Level 2 adds ICU and NICU, Level 3 adds dialysis and more ORs
      var level = k >= 150 ? 3 : k >= 75 ? 2 : 1;
      var icu = level >= 2 ? Math.max(1, Math.round(k * 0.06 / 4)) : 0, dr = Math.max(1, Math.ceil(k / 60));
      var iso2 = Math.max(1, Math.round(k * 0.04)), priv = Math.round(k * 0.12);
      var rest2 = Math.max(0, k - 4 * icu - 2 * dr - iso2 - priv), wards2 = Math.floor(rest2 / 6);
      priv += rest2 - 6 * wards2; // leftover beds go to private rooms so the program meets the bed count exactly
      add('hosp_lobby', 1); add('hosp_er', level >= 2 ? 2 : 1); add('hosp_opd', Math.max(1, Math.ceil(k / 50)));
      add('hosp_ward', wards2); add('hosp_private', priv); add('hosp_isolation', iso2); add('hosp_icu', icu);
      add('hosp_or', level === 1 ? 1 : level === 2 ? 2 : Math.ceil(k / 50)); add('hosp_dr', dr); add('hosp_nicu', level >= 2 ? 1 : 0);
      add('hosp_lab', 1); add('hosp_xray', 1); add('hosp_pharm', 1); add('hosp_cssd', 1); add('hosp_dietary', 1); add('hosp_laundry', 1);
      add('hosp_admin', level === 3 ? 2 : 1); add('hosp_morgue', 1); add('hosp_waste', 1); add('hosp_dialysis', level === 3 ? 1 : 0);
      per('hosp_nurse', 1); per('hosp_toilet', 1);
      p.level = level;
    } else if (usage === 'airport') {
      add('ap_hold', Math.ceil(k / 80)); add('ap_checkin', Math.ceil(k / 120)); add('ap_security', Math.ceil(k / 200));
      add('ap_claim', Math.ceil(k / 250)); add('ap_makeup', Math.ceil(k / 300)); add('ap_arrival', Math.ceil(k / 250));
      add('ap_curb', 1 + Math.floor(k / 600)); add('ap_concourse', Math.ceil(k / 90)); add('ap_admin', 1 + Math.floor(k / 800));
      add('ap_food', Math.ceil(k / 200)); add('ap_vip', 1); add('ap_plant', 1); per('ap_toilet', Math.ceil(k / 400));
    } else if (usage === 'seaport') {
      add('sp_wait', Math.ceil(k / 120)); add('sp_lobby', 1 + Math.floor(k / 600)); add('sp_predep', Math.ceil(k / 300));
      add('sp_bag', 1 + Math.floor(k / 500)); add('sp_admin', 1); add('sp_food', Math.ceil(k / 400)); add('sp_clinic', 1);
      per('sp_toilet', Math.ceil(k / 400));
    } else if (usage === 'jeepterm' || usage === 'uvterm' || usage === 'busterm') {
      var mode = USAGE[usage].mode, perWait = { jeep: 5, uv: 6, bus: 2 }[mode];
      add('tr_waiting', Math.ceil(k / perWait)); add('tr_ticket', mode === 'bus' ? Math.ceil(k / 6) : 1); add('tr_office', 1);
      add('tr_food', Math.ceil(k / ({ jeep: 20, uv: 25, bus: 6 }[mode]))); add('tr_lounge', 1); add('tr_driver', 1);
      add('tr_parcel', mode === 'bus' ? 1 : 0); per('tr_toilet', 1 + Math.floor(k / ({ jeep: 40, uv: 40, bus: 12 }[mode])));
      p.bays = {}; p.bays[mode] = k;
    }
    if (extra) extra.forEach(function (m) { p.modules.push(m.slice()); });
    return p;
  }

  // ------------------------------------------------------------------ layout
  function build(program, opt) {
    opt = opt || {};
    var U = USAGE[program.usage] || USAGE.school;
    var layout = program.layout || U.layout, D = program.depth || U.depth;
    var C = layout === 'open' ? 0 : (program.corridor != null ? program.corridor : U.corridor);
    var N = Math.max(1, Math.round(program.storeys || 1));
    var rooms = [], perFloor = [];
    (program.modules || []).forEach(function (m) { for (var i = 0; i < m[1]; i++) if (S[m[0]]) rooms.push(S[m[0]]); });
    (program.perFloor || []).forEach(function (m) { for (var i = 0; i < m[1]; i++) if (S[m[0]]) perFloor.push(S[m[0]]); });
    // spaces deeper than the row (court floor) set the row depth
    rooms.forEach(function (r) { if (layout === 'open' && r.d > D) D = r.d; });

    // open plans fold into 2–3 parallel rows when one row would exceed 48 m (compact halls and markets)
    var totalW = rooms.reduce(function (s, r) { return s + r.w; }, 0) / N;
    var nRows = layout === 'double' ? 2 : layout === 'open' && program.usage !== 'court' ? Math.min(U.maxRows || 3, Math.max(1, Math.ceil(totalW / 48))) : 1;
    var floors = [];
    for (var f = 0; f < N; f++) floors.push({ level: f, list: perFloor.slice() });
    var len = function (fl) { return fl.list.reduce(function (s, r) { return s + r.w; }, 0) / nRows; };
    rooms.filter(function (r) { return r.ground; }).forEach(function (r) { floors[0].list.push(r); });
    rooms.filter(function (r) { return !r.ground; }).sort(function (a, b) { return b.w - a.w; }).forEach(function (r) {
      var best = floors[0];
      floors.forEach(function (fl) { if (len(fl) < len(best) - 1e-9) best = fl; });
      best.list.push(r);
    });
    // vertical circulation: one stair per floor, two when the plan is long (egress, RA 9514 / PD 1096)
    var nStair = N > 1 ? (Math.max.apply(null, floors.map(len)) > 30 ? 2 : 1) : 0;
    floors.forEach(function (fl) { for (var i = 0; i < nStair; i++) fl.list.push(S.stair); });

    // rows
    var Lmax = 0;
    floors.forEach(function (fl) {
      var stairs = fl.list.filter(function (r) { return r.id === 'stair'; });
      var others = fl.list.filter(function (r) { return r.id !== 'stair'; });
      // keep the program order readable: group by category, ground rooms first
      others.sort(function (a, b) { return (b.ground - a.ground) || a.cat.localeCompare(b.cat) || b.w - a.w; });
      var rows = [];
      for (var q = 0; q < nRows; q++) rows.push([]);
      if (stairs[0]) rows[0].push(stairs[0]);
      others.forEach(function (r) {
        var target = rows[0];
        rows.forEach(function (row) { if (rowLen(row) < rowLen(target)) target = row; });
        target.push(r);
      });
      if (stairs[1]) rows[rows.length - 1].push(stairs[1]);
      fl.rows = rows;
      rows.forEach(function (row) { Lmax = Math.max(Lmax, rowLen(row)); });
    });
    var L = Math.ceil(Lmax * 2) / 2;
    var W = layout === 'double' ? 2 * D + C : layout === 'open' ? nRows * D : D + C;

    // coordinates; shorter rows end with an open terrace
    var placed = [], partitions = 0;
    floors.forEach(function (fl) {
      fl.rooms = [];
      fl.rows.forEach(function (row, ri) {
        var y0 = layout === 'double' ? (ri === 0 ? 0 : D + C) : (layout === 'single' ? C : ri * D);
        var x = 0;
        row.forEach(function (r) {
          var room = { id: r.id, name: r.name, cat: r.cat, x: x, y: y0, w: r.w, d: D, floor: fl.level };
          fl.rooms.push(room); placed.push(room); x += r.w;
        });
        if (L - x > 0.25) { var v = { id: 'void', name: fl.level === 0 ? 'Open area' : 'Open terrace', cat: 'void', x: x, y: y0, w: L - x, d: D, floor: fl.level }; fl.rooms.push(v); }
        partitions += Math.max(0, row.length - 1) * D;
      });
      if (layout !== 'open') fl.corridor = { x: 0, y: layout === 'double' ? D : 0, w: L, d: C };
      partitions += layout === 'double' ? 2 * L : layout === 'single' ? L : 0.3 * (nRows - 1) * L;
    });

    var cap = {};
    placed.forEach(function (r) { var c = S[r.id] ? S[r.id].cap : {}; Object.keys(c).forEach(function (k) { cap[k] = (cap[k] || 0) + c[k]; }); });
    var footprint = L * W, gfa = footprint * N;
    var nb = layout === 'double' ? 3 : layout === 'single' ? 2 : (program.usage === 'court' ? 1 : Math.max(1, Math.round(W / 6.5)));
    var plan = {
      kind: 'building', name: program.name || (U.label + ' design'), type: U.costType,
      length: L, width: W, storeys: N, floorHeight: program.floorHeight || U.fh,
      bayX: L / Math.max(1, Math.round(L / U.bay)), bayY: W / nb,
      roof: program.roof || (N >= 3 && (program.usage === 'office' || program.usage === 'health' || program.usage === 'hospital') ? 'rc_deck' : 'steel_truss'),
      footprintArea: footprint, perimeter: 2 * (L + W), interiorWallLength: Math.round(partitions / N * 10) / 10,
      province: opt.province || program.province || 'Albay', year: opt.year || program.year || 2025
    };
    // site works: loading bays for land transport terminals, curbside and parking for air and sea terminals
    var site = siteOf(program.bays);
    if (site.bays) { cap.bays = site.bays; plan.bays = site.bays; }
    if (cap.pax && program.usage === 'airport') { site.pave += Math.round(6 * cap.pax); site.canopy += Math.round(0.6 * cap.pax); }
    if (cap.pax && program.usage === 'seaport') { site.pave += Math.round(2.5 * cap.pax); site.canopy += Math.round(0.3 * cap.pax); }
    if (site.pave) plan.sitePavement = site.pave;
    if (site.canopy) plan.canopyArea = site.canopy;
    var d = { program: program, usage: program.usage, usageLabel: U.label, name: plan.name, layout: layout, depth: D, corridor: C,
      L: L, W: W, N: N, floors: floors, rooms: placed, footprint: footprint, gfa: gfa, capacity: cap, plan: plan, site: site };
    d.checks = checks(d);
    return d;
  }
  function rowLen(row) { return row.reduce(function (s, r) { return s + r.w; }, 0); }

  function checks(d) {
    var out = [], c = d.capacity;
    var count = function (id) { return d.rooms.filter(function (r) { return r.id === id; }).length; };
    if (c.classrooms) out.push({ ok: true, text: c.classrooms + ' classrooms at 63 m² each (DepEd standard 7 × 9 m), about ' + (c.learners || 0) + ' learners per shift.' });
    if (d.corridor && d.usage === 'hospital') out.push({ ok: d.corridor >= 2.44, text: 'Patient corridor ' + d.corridor.toFixed(2) + ' m wide (DOH A.O. 2016-0042 minimum 2.44 m for stretcher and bed traffic).' });
    else if (d.corridor) out.push({ ok: d.corridor >= 1.12, text: 'Corridor ' + d.corridor.toFixed(2) + ' m wide (PD 1096 minimum 1.12 m).' });
    if (d.N > 1) {
      var st = count('stair') / d.N;
      out.push({ ok: st >= (d.L > 30 ? 2 : 1), text: st + ' stair' + (st > 1 ? 's' : '') + ' per floor for a ' + d.L.toFixed(1) + ' m long plan' + (d.L > 30 ? ' (two exits required beyond 30 m).' : '.') });
    }
    var toilets = d.rooms.filter(function (r) { return /toilet|showers|bath/.test(r.id); }).length;
    out.push({ ok: toilets >= (d.usage === 'court' ? 1 : d.N), text: toilets + ' toilet block' + (toilets === 1 ? '' : 's') + ' with PWD cubicles (BP 344); ramp included in the quotation.' });
    if (c.persons && d.usage === 'evacuation') {
      var hall = d.rooms.filter(function (r) { return r.id === 'hall_bay'; }).reduce(function (s, r) { return s + r.w * r.d; }, 0);
      out.push({ ok: hall / c.persons >= 3.5, text: 'Living space ' + (hall / c.persons).toFixed(1) + ' m² per person (Sphere / DSWD minimum 3.5 m²).' });
    }
    if (c.beds && d.usage === 'health') out.push({ ok: true, text: c.beds + ' beds in wards, labor and isolation rooms; delivery room and laboratory included.' });
    if (d.usage === 'hospital') {
      var lv = d.program.level || (c.beds >= 150 ? 3 : c.beds >= 75 ? 2 : 1);
      var need = ['hosp_er', 'hosp_or', 'hosp_dr', 'hosp_lab', 'hosp_xray', 'hosp_pharm'].concat(lv >= 2 ? ['hosp_icu', 'hosp_nicu'] : []);
      var miss = need.filter(function (id) { return !count(id); });
      out.push({ ok: !miss.length, text: 'Level ' + lv + ' hospital, ' + (c.beds || 0) + ' beds: ' + (miss.length ? 'missing ' + miss.map(function (id) { return S[id].name; }).join(', ') : 'emergency, surgery, delivery, laboratory, imaging and pharmacy' + (lv >= 2 ? ', ICU and NICU' : '') + ' present') + ' (DOH A.O. 2012-0012).' });
      if (d.N > 1) out.push({ ok: true, text: 'Bed elevator included in the quotation for a ' + d.N + '-storey hospital (DOH A.O. 2016-0042).' });
    }
    if (c.pax && d.usage === 'airport') {
      var perPax = d.gfa / c.pax;
      out.push({ ok: perPax >= 14, text: 'Terminal area ' + perPax.toFixed(1) + ' m² per peak-hour passenger (IATA ADRM planning range about 14–25 m²).' });
    }
    if (c.pax && d.usage === 'seaport') {
      var wait = d.rooms.filter(function (r) { return r.id === 'sp_wait'; }).reduce(function (s2, r) { return s2 + r.w * r.d; }, 0);
      out.push({ ok: wait / c.pax >= 1.2, text: 'Waiting lounge ' + (wait / c.pax).toFixed(2) + ' m² per seated passenger (at least 1.2 m²).' });
    }
    if (d.site && d.site.bays) out.push({ ok: true, text: d.site.list.map(function (x) { return x.n + ' ' + BAYS[x.mode].label + ' bay' + (x.n > 1 ? 's' : ''); }).join(' + ') + ' on ' + d.site.pave.toLocaleString('en-PH') + ' m² of PCCP with ' + d.site.canopy.toLocaleString('en-PH') + ' m² of loading canopy (design vehicles per AASHTO 2018).' });
    out.push({ ok: true, text: 'Windows sized to at least 10% of floor area for natural light (PD 1096), computed in the quotation.' });
    return out;
  }

  function combine(program, other) {
    var p = JSON.parse(JSON.stringify(program));
    (other.modules || []).forEach(function (m) { p.modules.push(m.slice()); });
    (other.perFloor || []).forEach(function (m) {
      if (!p.perFloor.some(function (x) { return x[0] === m[0]; })) p.perFloor.push(m.slice());
    });
    p.storeys = Math.max(p.storeys || 1, other.storeys || 1);
    if (other.bays) { p.bays = p.bays || {}; Object.keys(other.bays).forEach(function (m) { p.bays[m] = (p.bays[m] || 0) + other.bays[m]; }); }
    p.name = (program.name || 'Design') + ' + ' + (other.name || 'wing');
    return p;
  }

  function quote(design, opt) { return E.quote(Object.assign({}, design.plan, opt && opt.plan), opt); }

  // ------------------------------------------------------------------ budget-to-design
  // For each storey count, binary-search the largest capacity whose quotation fits the budget.
  function fromBudget(usage, budget, opt) {
    opt = opt || {};
    var U = USAGE[usage], maxN = opt.maxStoreys || (usage === 'hospital' ? 5 : usage === 'court' || usage === 'market' || usage === 'evacuation' || usage === 'airport' || usage === 'seaport' || U.mode ? 2 : 4);
    var basis = opt.basis || 'start', maxL = opt.maxLength || U.lot || 60;
    var cost = function (q) { return basis === 'standard' ? q.fair : q.start; };
    var make = function (k, N) {
      var d = build(Object.assign(programFor(usage, k, N), { name: U.label + ', ' + k + ' ' + U.capLabel + ', ' + N + '-storey' }), opt);
      return { k: k, N: N, design: d, quote: quote(d, opt) };
    };
    var r = U.range, results = [], evals = 0;
    if (usage === 'court') maxN = 1;
    // exhaustive enumeration of the discrete design space (storeys × capacity step); support rooms make
    // cost non-monotonic in capacity, so every point is evaluated rather than bisected
    for (var N = 1; N <= maxN; N++) {
      var best = null, over = 0;
      for (var k = Math.max(r[0], usage === 'school' ? N : r[0]); k <= r[1]; k += r[2]) {
        var t = make(k, N); evals++;
        var c = cost(t.quote);
        if (c <= budget && t.design.L <= maxL) { if (!best || k > best.k || (k === best.k && c < cost(best.quote))) best = t; over = 0; }
        else if (c > budget * 1.5 && ++over >= 3) break;
      }
      if (best) results.push(best);
    }
    results.forEach(function (x) { x.cost = cost(x.quote); });
    // keep Pareto-efficient options: no other option gives at least the capacity for less
    results = results.filter(function (x) { return !results.some(function (y) { return y !== x && y.k >= x.k && y.cost <= x.cost && (y.k > x.k || y.cost < x.cost); }); });
    results.forEach(function (x) { x.cost = cost(x.quote); x.utilization = x.cost / budget; x.perUnit = x.k > 0 ? x.cost / x.k : null; });
    results.sort(function (x, y) { return y.k - x.k || x.cost - y.cost; });
    if (results[0]) results[0].best = true;
    return { usage: usage, budget: budget, basis: basis, options: results, evaluations: evals };
  }

  // ------------------------------------------------------------------ bridges
  var BRIDGE_RANGE = { box_culvert: [1.5, 4.5], rcdg: [8, 25], pscg: [24, 40], steel_truss: [40, 90] };
  function bridgeOptions(q) {
    var gap = Math.max(2, +q.gap || 20), lanes = q.lanes == null ? 2 : +q.lanes;
    var cw = { 0: 2.0, 1: 4.0, 2: 6.7, 4: 13.4 }[lanes] || 6.7;
    var out = [];
    Object.keys(BRIDGE_RANGE).forEach(function (t) {
      var rg = BRIDGE_RANGE[t];
      if (t === 'box_culvert' && (gap > 14 || lanes === 0)) return;
      var nMin = Math.max(1, Math.ceil(gap / rg[1])), nMax = Math.max(nMin, Math.floor(gap / rg[0]));
      var tried = 0;
      for (var n = nMin; n <= nMax && tried < 3; n++, tried++) {
        var plan = { kind: 'bridge', name: E.SUPERSTRUCTURES[t].label + ' ' + n + ' × ' + (gap / n).toFixed(1) + ' m', superstructure: t, totalLength: gap, spans: n,
          carriageway: cw, sidewalk: lanes === 0 || t === 'box_culvert' ? 0 : (q.sidewalk != null ? +q.sidewalk : 0.75),
          pierHeight: +q.pierHeight || 6, abutmentHeight: t === 'box_culvert' ? Math.min(4, +q.abutmentHeight || 3) : (+q.abutmentHeight || 5),
          foundation: t === 'box_culvert' ? 'spread' : (q.foundation || (t === 'rcdg' ? 'driven_pile' : 'bored_pile')), pileLength: +q.pileLength || 15,
          waterway: q.waterway !== false, approachLength: t === 'box_culvert' ? 0 : (q.approachLength != null ? +q.approachLength : 15),
          province: q.province || 'Albay', year: q.year || 2025 };
        var qq = E.quote(plan);
        out.push({ type: t, spans: n, span: gap / n, plan: plan, quote: qq, fits: q.budget ? qq.start <= q.budget : true });
      }
    });
    out.sort(function (a, b) { return a.quote.fair - b.quote.fair; });
    if (out[0]) out[0].recommended = true;
    return out;
  }

  // ------------------------------------------------------------------ templates
  var T = [];
  function tpl(id, name, usage, modules, perFloor, storeys, more) {
    T.push(Object.assign({ id: id, name: name, usage: usage, modules: modules, perFloor: perFloor || [], storeys: storeys || 1 }, more || {}));
  }
  // schools
  tpl('sch-1s2', '1-storey 2-classroom school building', 'school', [['classroom', 2]], [['toilet_school', 1]]);
  tpl('sch-1s3', '1-storey 3-classroom school building', 'school', [['classroom', 3]], [['toilet_school', 1]]);
  tpl('sch-1s4', '1-storey 4-classroom school building', 'school', [['classroom', 4]], [['toilet_school', 1]]);
  tpl('sch-kinder', 'Kindergarten building (2 rooms)', 'school', [['kinder', 2], ['school_admin', 1]], [['toilet_school', 1]]);
  tpl('sch-2s4', '2-storey 4-classroom school building', 'school', [['classroom', 4]], [['toilet_school', 1]], 2);
  tpl('sch-2s6', '2-storey 6-classroom school building', 'school', [['classroom', 6]], [['toilet_school', 1]], 2);
  tpl('sch-2s8', '2-storey 8-classroom school building with library', 'school', [['classroom', 8], ['library', 1], ['school_admin', 1]], [['toilet_school', 1]], 2);
  tpl('sch-shs', '2-storey senior high school building (6 CL + labs)', 'school', [['classroom', 6], ['science_lab', 1], ['ict_lab', 1], ['faculty', 1]], [['toilet_school', 1]], 2);
  tpl('sch-tvl', 'TVL workshop building (2 shops + 2 CL)', 'school', [['tvl_shop', 2], ['classroom', 2]], [['toilet_school', 1]]);
  tpl('sch-3s9', '3-storey 9-classroom school building', 'school', [['classroom', 9]], [['toilet_school', 1]], 3);
  tpl('sch-3s12', '3-storey 12-classroom school building with labs', 'school', [['classroom', 12], ['science_lab', 1], ['ict_lab', 1]], [['toilet_school', 1]], 3);
  tpl('sch-4s16', '4-storey 16-classroom school building', 'school', [['classroom', 16]], [['toilet_school', 1]], 4);
  tpl('sch-4s20', '4-storey 20-classroom school building with support rooms', 'school', [['classroom', 20], ['faculty', 1], ['school_admin', 1], ['school_clinic', 1], ['library', 1]], [['toilet_school', 1]], 4);
  tpl('sch-admin', 'School admin & library building', 'school', [['school_admin', 1], ['faculty', 1], ['school_clinic', 1], ['guidance', 1], ['library', 1]], [['toilet_school', 1]]);
  // health
  tpl('bhs', 'Barangay health station', 'health', [['consult', 1], ['treatment', 1], ['pharmacy', 1], ['waiting', 1]], [['toilet_health', 1]]);
  tpl('bhs-birthing', 'Barangay health station with birthing room', 'health', [['consult', 1], ['treatment', 1], ['delivery', 1], ['labor', 1], ['nurse', 1], ['pharmacy', 1], ['waiting', 1]], [['toilet_health', 1]]);
  tpl('rhu', 'Rural health unit (1-storey)', 'health', [['consult', 3], ['dental', 1], ['lab', 1], ['pharmacy', 1], ['treatment', 1], ['waiting', 2], ['health_admin', 1], ['nurse', 1]], [['toilet_health', 2]]);
  tpl('rhu-2s', 'Rural health unit with birthing (2-storey)', 'health', [['consult', 3], ['dental', 1], ['lab', 1], ['pharmacy', 1], ['treatment', 1], ['waiting', 1], ['health_admin', 1], ['delivery', 1], ['labor', 2], ['nurse', 2]], [['toilet_health', 1]], 2);
  tpl('infirmary-10', '10-bed infirmary', 'health', programFor('health', 10, 1).modules, programFor('health', 10, 1).perFloor);
  tpl('hospital-25', '25-bed community hospital (2-storey)', 'health', programFor('health', 25, 2).modules, programFor('health', 25, 2).perFloor, 2);
  // civic & offices
  tpl('brgy-hall', 'Barangay hall', 'office', [['lobby', 1], ['session_hall', 1], ['office_open', 1], ['office_private', 1], ['records', 1]], [['toilet_office', 1]]);
  tpl('brgy-hall-2s', 'Barangay hall with multi-purpose floor (2-storey)', 'office', [['lobby', 1], ['session_hall', 1], ['office_open', 2], ['office_private', 2], ['records', 1], ['conference', 1]], [['toilet_office', 1]], 2);
  tpl('mun-hall', 'Municipal hall (2-storey)', 'office', programFor('office', 60, 2).modules, programFor('office', 60, 2).perFloor, 2);
  tpl('prov-office', 'Provincial office building (3-storey)', 'office', programFor('office', 120, 3).modules, programFor('office', 120, 3).perFloor, 3);
  tpl('police', 'Municipal police station', 'office', [['lobby', 1], ['office_open', 2], ['office_private', 2], ['custodial', 2], ['records', 1]], [['toilet_office', 1]]);
  tpl('library-public', 'Public library', 'school', [['library', 2], ['school_admin', 1], ['ict_lab', 1]], [['toilet_school', 1]]);
  tpl('daycare', 'Child development center', 'school', [['kinder', 2], ['school_admin', 1], ['school_clinic', 1]], [['toilet_school', 1]]);
  // evacuation & assembly
  tpl('evac-100', 'Evacuation center, 100 persons', 'evacuation', programFor('evacuation', 100, 1).modules, []);
  tpl('evac-200', 'Evacuation center, 200 persons', 'evacuation', programFor('evacuation', 200, 1).modules, []);
  tpl('evac-400', 'Evacuation center, 400 persons', 'evacuation', programFor('evacuation', 400, 1).modules, []);
  tpl('evac-600-2s', 'Evacuation center, 600 persons (2-storey)', 'evacuation', programFor('evacuation', 600, 2).modules, [], 2);
  tpl('senior-center', 'Senior citizens center', 'evacuation', [['hall_bay', 2], ['kitchen', 1], ['showers', 1], ['triage', 1]], []);
  tpl('mph', 'Multi-purpose hall with stage', 'evacuation', [['hall_bay', 4], ['stage', 1], ['kitchen', 1], ['showers', 1]], []);
  // markets
  tpl('market-40', 'Public market, 40 stalls', 'market', programFor('market', 40, 1).modules, programFor('market', 40, 1).perFloor);
  tpl('market-100', 'Public market, 100 stalls', 'market', programFor('market', 100, 1).modules, programFor('market', 100, 1).perFloor);
  tpl('market-200-2s', 'Public market, 200 stalls (2-storey)', 'market', programFor('market', 200, 2).modules, programFor('market', 200, 2).perFloor, 2);
  // living
  tpl('dorm-48', 'Dormitory, 48 beds', 'dorm', programFor('dorm', 48, 1).modules, programFor('dorm', 48, 1).perFloor);
  tpl('dorm-96-3s', 'Dormitory, 96 beds (3-storey)', 'dorm', programFor('dorm', 96, 3).modules, programFor('dorm', 96, 3).perFloor, 3);
  tpl('teachers-quarters', 'Teachers\' quarters (8 units)', 'dorm', [['quarters', 8], ['lounge', 1], ['laundry', 1]], [['bath', 2]]);
  // courts
  tpl('court-brgy', 'Barangay covered court', 'court', [['court_floor', 1], ['stage', 1], ['showers', 1]], []);
  tpl('court-std', 'Covered court with bleachers and showers', 'court', [['court_floor', 1], ['stage', 1], ['bleachers', 2], ['showers', 1]], []);
  // hospitals
  function ptpl(id, name, usage, k, N) { var pr = programFor(usage, k, N); tpl(id, name, usage, pr.modules, pr.perFloor, N, pr.bays ? { bays: pr.bays, level: pr.level } : (pr.level ? { level: pr.level } : null)); }
  ptpl('hosp-l1-25', 'Level 1 hospital, 25 beds (2-storey)', 'hospital', 25, 2);
  ptpl('hosp-l1-50', 'Level 1 hospital, 50 beds (3-storey)', 'hospital', 50, 3);
  ptpl('hosp-l2-100', 'Level 2 hospital, 100 beds (4-storey)', 'hospital', 100, 4);
  ptpl('hosp-l3-200', 'Level 3 hospital, 200 beds (5-storey)', 'hospital', 200, 5);
  // airport and seaport passenger terminals
  ptpl('ap-150', 'Community airport terminal, 150 peak-hour passengers', 'airport', 150, 1);
  ptpl('ap-400-2s', 'Principal airport terminal, 400 peak-hour passengers (2-storey)', 'airport', 400, 2);
  ptpl('ap-1000-2s', 'International airport terminal, 1,000 peak-hour passengers (2-storey)', 'airport', 1000, 2);
  ptpl('sp-120', 'Seaport passenger terminal, 120 passengers', 'seaport', 120, 1);
  ptpl('sp-360', 'Seaport passenger terminal, 360 passengers', 'seaport', 360, 1);
  ptpl('sp-900-2s', 'Seaport passenger terminal, 900 passengers (2-storey)', 'seaport', 900, 2);
  // land transport terminals (jeepney, UV Express, bus)
  ptpl('jt-20', 'Jeepney terminal, 20 loading bays', 'jeepterm', 20, 1);
  ptpl('uv-15', 'UV Express terminal, 15 loading bays', 'uvterm', 15, 1);
  ptpl('bus-12', 'Bus terminal, 12 sawtooth bays', 'busterm', 12, 1);
  (function () {
    var itt = combine(combine(programFor('busterm', 8, 2), programFor('jeepterm', 16, 2)), programFor('uvterm', 12, 2));
    tpl('itt-36', 'Integrated land transport terminal: 8 bus + 16 jeepney + 12 UV Express bays (2-storey)', 'busterm', itt.modules, itt.perFloor, 2, { bays: itt.bays });
  }());

  var BRIDGE_TEMPLATES = [
    { id: 'br-foot', name: 'Pedestrian footbridge 1 × 15 m', plan: { superstructure: 'rcdg', totalLength: 15, spans: 1, carriageway: 2.0, sidewalk: 0, abutmentHeight: 3.5, foundation: 'spread', approachLength: 5 } },
    { id: 'br-bc1', name: 'Single-cell RC box culvert 3.0 m', plan: { superstructure: 'box_culvert', totalLength: 3, spans: 1, carriageway: 6.7, abutmentHeight: 3, foundation: 'spread' } },
    { id: 'br-bc2', name: 'Double-barrel RC box culvert 2 × 3.0 m', plan: { superstructure: 'box_culvert', totalLength: 6, spans: 2, carriageway: 6.7, abutmentHeight: 2.5, foundation: 'spread' } },
    { id: 'br-bc3', name: 'Triple-barrel RC box culvert 3 × 3.5 m', plan: { superstructure: 'box_culvert', totalLength: 10.5, spans: 3, carriageway: 6.7, abutmentHeight: 3, foundation: 'spread' } },
    { id: 'br-fmr12', name: 'Farm-to-market RCDG bridge 1 × 12 m (1 lane)', plan: { superstructure: 'rcdg', totalLength: 12, spans: 1, carriageway: 4.0, sidewalk: 0.5, abutmentHeight: 4, foundation: 'spread', approachLength: 10 } },
    { id: 'br-rcdg15', name: 'RCDG bridge 1 × 15 m (2 lanes)', plan: { superstructure: 'rcdg', totalLength: 15, spans: 1, carriageway: 6.7, sidewalk: 0.75, abutmentHeight: 5, foundation: 'driven_pile', pileLength: 12 } },
    { id: 'br-rcdg40', name: 'RCDG bridge 2 × 20 m (2 lanes)', plan: { superstructure: 'rcdg', totalLength: 40, spans: 2, carriageway: 6.7, sidewalk: 0.75, pierHeight: 6, abutmentHeight: 5, foundation: 'driven_pile', pileLength: 15 } },
    { id: 'br-rcdg60', name: 'RCDG bridge 3 × 20 m (2 lanes)', plan: { superstructure: 'rcdg', totalLength: 60, spans: 3, carriageway: 6.7, sidewalk: 0.75, pierHeight: 6, abutmentHeight: 5.5, foundation: 'driven_pile', pileLength: 15 } },
    { id: 'br-pscg30', name: 'PSCG bridge 1 × 30 m (2 lanes)', plan: { superstructure: 'pscg', totalLength: 30, spans: 1, carriageway: 6.7, sidewalk: 1.0, abutmentHeight: 6, foundation: 'bored_pile', pileLength: 18 } },
    { id: 'br-pscg90', name: 'PSCG bridge 3 × 30 m (2 lanes)', plan: { superstructure: 'pscg', totalLength: 90, spans: 3, carriageway: 6.7, sidewalk: 1.0, pierHeight: 8, abutmentHeight: 6, foundation: 'bored_pile', pileLength: 20 } },
    { id: 'br-pscg4l', name: 'PSCG bridge 3 × 30 m (4 lanes)', plan: { superstructure: 'pscg', totalLength: 90, spans: 3, carriageway: 13.4, sidewalk: 1.2, pierHeight: 8, abutmentHeight: 6, foundation: 'bored_pile', pileLength: 22 } },
    { id: 'br-truss45', name: 'Steel truss bridge 1 × 45 m', plan: { superstructure: 'steel_truss', totalLength: 45, spans: 1, carriageway: 6.7, sidewalk: 0.75, abutmentHeight: 7, foundation: 'bored_pile', pileLength: 20 } },
    { id: 'br-truss120', name: 'Steel truss bridge 2 × 60 m', plan: { superstructure: 'steel_truss', totalLength: 120, spans: 2, carriageway: 6.7, sidewalk: 0.75, pierHeight: 10, abutmentHeight: 7, foundation: 'bored_pile', pileLength: 24 } }
  ];
  BRIDGE_TEMPLATES.forEach(function (b) { b.plan.kind = 'bridge'; b.plan.name = b.name; });

  var AIRFIELD_TEMPLATES = [
    { id: 'af-rwy-b', name: 'Runway 800 × 23 m (small aircraft, PCC)', plan: { facility: 'runway', aircraft: 'code_b', length: 800, width: 23 } },
    { id: 'af-rwy-c', name: 'Runway 1,200 × 30 m (turboprop, PCC)', plan: { facility: 'runway', aircraft: 'turboprop', length: 1200, width: 30 } },
    { id: 'af-rwy-ext', name: 'Runway extension 400 × 30 m (turboprop)', plan: { facility: 'runway', aircraft: 'turboprop', length: 400, width: 30 } },
    { id: 'af-rwy-jet', name: 'Runway 2,100 × 45 m (A320 / B737, PCC)', plan: { facility: 'runway', aircraft: 'jet', length: 2100, width: 45 } },
    { id: 'af-twy', name: 'Parallel taxiway 600 × 15 m (turboprop)', plan: { facility: 'taxiway', aircraft: 'turboprop', length: 600, width: 15 } },
    { id: 'af-apron4', name: 'Apron, 4 turboprop stands (120 × 80 m)', plan: { facility: 'apron', aircraft: 'turboprop', length: 120, width: 80 } },
    { id: 'af-apron-jet', name: 'Apron, 3 jet stands (150 × 90 m)', plan: { facility: 'apron', aircraft: 'jet', length: 150, width: 90 } }
  ];
  AIRFIELD_TEMPLATES.forEach(function (b) { b.plan.kind = 'airfield'; b.plan.name = b.name; });
  var PORT_TEMPLATES = [
    { id: 'pt-jetty', name: 'Passenger jetty 30 × 6 m (PC spun piles)', plan: { facility: 'pier', length: 30, width: 6, waterDepth: 3, deckLevel: 3.0, pileType: 'pc_spun' } },
    { id: 'pt-fish', name: 'Fishport pier 40 × 8 m with 80 m causeway', plan: { facility: 'pier', length: 40, width: 8, waterDepth: 4, pileType: 'pc_spun', causeway: 80 } },
    { id: 'pt-roro', name: 'RoRo pier 60 × 15 m with ramp (PC spun piles)', plan: { facility: 'pier', length: 60, width: 15, waterDepth: 6, pileType: 'pc_spun', roro: true } },
    { id: 'pt-wharf', name: 'Marginal wharf 100 × 20 m (steel pipe piles)', plan: { facility: 'wharf', length: 100, width: 20, waterDepth: 9, pileType: 'steel_pipe' } },
    { id: 'pt-wharf-ext', name: 'Wharf extension 50 × 20 m (steel pipe piles)', plan: { facility: 'wharf', length: 50, width: 20, waterDepth: 9, pileType: 'steel_pipe' } }
  ];
  PORT_TEMPLATES.forEach(function (b) { b.plan.kind = 'port'; b.plan.name = b.name; });

  // ------------------------------------------------------------------ drawings (SVG)
  var FILL = { learning: '#dce9f8', health: '#d9f0e2', office: '#e9e3f5', assembly: '#fdeec9', service: '#e3e7ed', commerce: '#fbe1d5', living: '#f4e2ee', circulation: '#ffffff', void: '#ffffff' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function planSVG(d, level, o) {
    o = o || {};
    var fl = d.floors[level || 0], k = 20, m = 70;                 // 20 px per metre, margins
    var showSite = d.site && d.site.bays && (level || 0) === 0;
    var siteRows = [], siteLen = 0, siteH = 0;
    if (showSite) {
      // loading bays in rows along the building front: canopy band, then stalls of each vehicle type
      var rowMax = Math.max(d.L, 30), cur = { x: 0, items: [] };
      d.site.list.forEach(function (x) {
        var b = BAYS[x.mode];
        for (var i = 0; i < x.n; i++) {
          if (cur.x + b.w > rowMax + 1e-6) { siteRows.push(cur); cur = { x: 0, items: [] }; }
          cur.items.push({ mode: x.mode, x: cur.x, w: b.w, d: b.d, no: i + 1 }); cur.x += b.w;
        }
      });
      if (cur.items.length) siteRows.push(cur);
      siteLen = rowMax;
      siteRows.forEach(function (r) { r.depth = Math.max.apply(null, r.items.map(function (it) { return it.d; })); siteH += r.depth + 7; });
      siteH += 6;
    }
    var Wp = Math.max(d.L, siteLen) * k + 2 * m, Hp = (d.W + siteH) * k + 2 * m + 30;
    var s = [];
    s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wp + ' ' + Hp + '" class="planSvg" role="img" aria-label="Schematic floor plan, ' + esc(levelName(level || 0)) + '" font-family="Arial, Helvetica, sans-serif">');
    s.push('<rect width="' + Wp + '" height="' + Hp + '" fill="#ffffff"/>');
    var X = function (x) { return m + x * k; }, Y = function (y) { return m + y * k; };
    // structural grid
    var bx = d.plan.bayX, by = d.plan.bayY;
    var gx = Math.round(d.L / bx), gy = Math.round(d.W / by);
    for (var i = 0; i <= gx; i++) {
      var xx = X(i * bx);
      s.push('<line x1="' + xx + '" y1="' + (m - 34) + '" x2="' + xx + '" y2="' + (Y(d.W) + 8) + '" stroke="#9aa6b8" stroke-width="0.8" stroke-dasharray="6 4"/>');
      s.push('<circle cx="' + xx + '" cy="' + (m - 44) + '" r="10" fill="#fff" stroke="#55627a"/><text x="' + xx + '" y="' + (m - 40) + '" font-size="11" text-anchor="middle" fill="#13213a">' + (i + 1) + '</text>');
    }
    for (var j = 0; j <= gy; j++) {
      var yy = Y(j * by);
      s.push('<line x1="' + (m - 34) + '" y1="' + yy + '" x2="' + (X(d.L) + 8) + '" y2="' + yy + '" stroke="#9aa6b8" stroke-width="0.8" stroke-dasharray="6 4"/>');
      s.push('<circle cx="' + (m - 44) + '" cy="' + yy + '" r="10" fill="#fff" stroke="#55627a"/><text x="' + (m - 44) + '" y="' + (yy + 4) + '" font-size="11" text-anchor="middle" fill="#13213a">' + String.fromCharCode(65 + j) + '</text>');
    }
    if (fl.corridor) {
      s.push('<rect x="' + X(fl.corridor.x) + '" y="' + Y(fl.corridor.y) + '" width="' + fl.corridor.w * k + '" height="' + fl.corridor.d * k + '" fill="#f5f6f8" stroke="#13213a" stroke-width="1"/>');
      s.push('<text x="' + X(d.L / 2) + '" y="' + (Y(fl.corridor.y + fl.corridor.d / 2) + 4) + '" font-size="11" text-anchor="middle" fill="#55627a" letter-spacing="2">CORRIDOR ' + fl.corridor.d.toFixed(2) + ' m</text>');
    }
    fl.rooms.forEach(function (r) {
      var x = X(r.x), y = Y(r.y), w = r.w * k, h = r.d * k;
      s.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (FILL[r.cat] || '#fff') + '" stroke="#13213a" stroke-width="' + (r.cat === 'void' ? 0.8 : 2) + '"' + (r.cat === 'void' ? ' stroke-dasharray="5 4"' : '') + '/>');
      if (r.id === 'stair') {
        for (var t = 1; t < 12; t++) s.push('<line x1="' + (x + 4) + '" y1="' + (y + t * h / 12) + '" x2="' + (x + w - 4) + '" y2="' + (y + t * h / 12) + '" stroke="#13213a" stroke-width="0.7"/>');
        s.push('<line x1="' + (x + w / 2) + '" y1="' + (y + h - 6) + '" x2="' + (x + w / 2) + '" y2="' + (y + 8) + '" stroke="#c22f27" stroke-width="1.2" marker-end="url(#arr)"/>');
      }
      if (w > 42) {
        var fs = Math.max(8, Math.min(12, w / 9));
        var words = r.name.split(' '), lines = [], cur = '';
        words.forEach(function (wd) { if ((cur + ' ' + wd).trim().length * fs * 0.55 > w - 8) { lines.push(cur.trim()); cur = wd; } else cur += ' ' + wd; });
        lines.push(cur.trim());
        lines = lines.slice(0, 3);
        lines.forEach(function (ln, li) { s.push('<text x="' + (x + w / 2) + '" y="' + (y + h / 2 - (lines.length - 1) * fs * 0.6 + li * fs * 1.2) + '" font-size="' + fs + '" text-anchor="middle" fill="#13213a">' + esc(ln) + '</text>'); });
        if (r.cat !== 'circulation' && h > 50) s.push('<text x="' + (x + w / 2) + '" y="' + (y + h - 8) + '" font-size="9" text-anchor="middle" fill="#55627a">' + (r.w * r.d).toFixed(1) + ' m²</text>');
      }
    });
    s.push('<rect x="' + X(0) + '" y="' + Y(0) + '" width="' + d.L * k + '" height="' + d.W * k + '" fill="none" stroke="#13213a" stroke-width="3.5"/>');
    if (showSite) {
      var sy0 = d.W + 3, ini = { jeep: 'J', uv: 'UV', bus: 'B' };
      s.push('<rect x="' + X(0) + '" y="' + Y(sy0 - 3) + '" width="' + siteLen * k + '" height="' + 3 * k + '" fill="#e8ecf2" stroke="#9aa6b8" stroke-dasharray="6 4"/>');
      s.push('<text x="' + X(siteLen / 2) + '" y="' + (Y(sy0 - 1.5) + 4) + '" font-size="11" text-anchor="middle" fill="#55627a" letter-spacing="2">CANOPY-COVERED LOADING PLATFORM</text>');
      siteRows.forEach(function (r) {
        r.items.forEach(function (it) {
          s.push('<rect x="' + X(it.x) + '" y="' + Y(sy0) + '" width="' + it.w * k + '" height="' + it.d * k + '" fill="#f1f3f6" stroke="#13213a" stroke-width="1.2"/>');
          if (it.w * k > 30) s.push('<text x="' + X(it.x + it.w / 2) + '" y="' + (Y(sy0 + it.d / 2) + 4) + '" font-size="10" text-anchor="middle" fill="#13213a">' + ini[it.mode] + it.no + '</text>');
        });
        s.push('<rect x="' + X(0) + '" y="' + Y(sy0 + r.depth) + '" width="' + siteLen * k + '" height="' + 7 * k + '" fill="#d7dbe2"/>');
        s.push('<text x="' + X(siteLen / 2) + '" y="' + (Y(sy0 + r.depth + 3.5) + 4) + '" font-size="11" text-anchor="middle" fill="#3b4250" letter-spacing="2">DRIVE AISLE →</text>');
        sy0 += r.depth + 7;
      });
    }
    // dimensions
    var dy = Y(d.W) + 26;
    s.push('<line x1="' + X(0) + '" y1="' + dy + '" x2="' + X(d.L) + '" y2="' + dy + '" stroke="#13213a" stroke-width="1"/><line x1="' + X(0) + '" y1="' + (dy - 6) + '" x2="' + X(0) + '" y2="' + (dy + 6) + '" stroke="#13213a"/><line x1="' + X(d.L) + '" y1="' + (dy - 6) + '" x2="' + X(d.L) + '" y2="' + (dy + 6) + '" stroke="#13213a"/>');
    s.push('<text x="' + X(d.L / 2) + '" y="' + (dy - 5) + '" font-size="12" text-anchor="middle" fill="#13213a">' + d.L.toFixed(2) + ' m</text>');
    var dx = X(d.L) + 30;
    s.push('<line x1="' + dx + '" y1="' + Y(0) + '" x2="' + dx + '" y2="' + Y(d.W) + '" stroke="#13213a" stroke-width="1"/><text x="' + (dx + 6) + '" y="' + Y(d.W / 2) + '" font-size="12" fill="#13213a" transform="rotate(90 ' + (dx + 6) + ' ' + Y(d.W / 2) + ')" text-anchor="middle">' + d.W.toFixed(2) + ' m</text>');
    s.push('<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#c22f27"/></marker></defs>');
    if (!o.bare) s.push('<text x="' + m + '" y="' + (Hp - 10) + '" font-size="12" fill="#13213a"><tspan font-weight="bold">' + esc(levelName(level || 0)) + '</tspan> · ' + esc(d.name) + ' · BUHAY-AH schematic, not for construction</text>');
    s.push('</svg>');
    return s.join('');
  }
  // runway / taxiway / apron plan (length compressed to fit; widths exaggerated and labelled)
  function airfieldSVG(plan) {
    var a = E.normalizeAirfield(plan), Wp = 900, m = 40, apron = a.facility === 'apron';
    var kx = (Wp - 2 * m) / a.length, ky = apron ? kx : Math.min(3, 120 / Math.max(a.width + 2 * a.shoulder, 1));
    var pw = a.width * ky, sw = a.shoulder * ky, stripH = apron ? 0 : Math.min(200, Math.max(pw + 2 * sw + 40, a.stripWidth * ky * 0.6));
    var Hp = (apron ? a.width * ky : stripH) + 2 * m + 40, cy = m + (apron ? a.width * ky : stripH) / 2;
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wp + ' ' + Hp + '" class="planSvg" role="img" aria-label="Schematic airfield plan" font-family="Arial, Helvetica, sans-serif"><rect width="' + Wp + '" height="' + Hp + '" fill="#ffffff"/>'];
    if (!apron) s.push('<rect x="' + m + '" y="' + (cy - stripH / 2) + '" width="' + (Wp - 2 * m) + '" height="' + stripH + '" fill="#dbe8cf"/>');
    s.push('<rect x="' + m + '" y="' + (cy - pw / 2 - sw) + '" width="' + (Wp - 2 * m) + '" height="' + (pw + 2 * sw) + '" fill="#9aa1ab"/>');
    s.push('<rect x="' + m + '" y="' + (cy - pw / 2) + '" width="' + (Wp - 2 * m) + '" height="' + pw + '" fill="#6f7682" stroke="#13213a"/>');
    if (a.facility === 'runway') {
      for (var x = m + 40; x < Wp - m - 40; x += 26) s.push('<rect x="' + x + '" y="' + (cy - 1) + '" width="14" height="2" fill="#ffffff"/>');
      [m + 4, Wp - m - 22].forEach(function (x0) { for (var i = 0; i < 6; i++) { var yy = cy - pw / 2 + pw * (i + 0.5) / 6 - 1.5; s.push('<rect x="' + x0 + '" y="' + yy + '" width="18" height="3" fill="#ffffff"/>'); } });
      if (a.lighting) for (var xl = m; xl <= Wp - m; xl += Math.max(6, 60 * kx)) { s.push('<circle cx="' + xl + '" cy="' + (cy - pw / 2) + '" r="2" fill="#e3a51a"/><circle cx="' + xl + '" cy="' + (cy + pw / 2) + '" r="2" fill="#e3a51a"/>'); }
    } else if (a.facility === 'taxiway') {
      s.push('<line x1="' + m + '" y1="' + cy + '" x2="' + (Wp - m) + '" y2="' + cy + '" stroke="#f2c230" stroke-width="2"/>');
      if (a.lighting) for (var xt = m; xt <= Wp - m; xt += Math.max(5, 30 * kx)) s.push('<circle cx="' + xt + '" cy="' + (cy - pw / 2) + '" r="2" fill="#2f6fd0"/><circle cx="' + xt + '" cy="' + (cy + pw / 2) + '" r="2" fill="#2f6fd0"/>');
    } else {
      var stand = a.aircraft === 'jet' ? 45 : 30, nSt = Math.max(1, Math.floor(a.length / stand));
      for (var st = 0; st < nSt; st++) {
        var x1 = m + (st + 0.5) * a.length / nSt * kx;
        s.push('<line x1="' + x1 + '" y1="' + (cy - pw / 2 + 6) + '" x2="' + x1 + '" y2="' + (cy + pw / 2 - 6) + '" stroke="#f2c230" stroke-width="2"/>');
        s.push('<text x="' + x1 + '" y="' + (cy - pw / 2 + 20) + '" font-size="12" text-anchor="middle" fill="#ffffff">Stand ' + (st + 1) + '</text>');
      }
    }
    s.push('<text x="' + (Wp / 2) + '" y="' + (Hp - 14) + '" font-size="13" text-anchor="middle" fill="#13213a">' + esc(E.AIRFIELD_FACILITIES[a.facility].label) + ' ' + a.length.toFixed(0) + ' × ' + a.width.toFixed(1) + ' m · ' + Math.round(a.pcc * 1000) + ' mm PCC · ' + esc(E.AIRCRAFT[a.aircraft].label) + (apron ? '' : ' · widths exaggerated') + ' · BUHAY-AH schematic</text>');
    s.push('</svg>');
    return s.join('');
  }

  // pier / wharf longitudinal section: deck on piles, water and seabed, fenders and causeway
  function portSVG(plan) {
    var p = E.normalizePort(plan), m = 40, Wp = 900, cw = Math.min(p.causeway, p.length * 1.2);
    var total = p.length + cw + 10, k = (Wp - 2 * m) / total;
    var kz = Math.min(12, 300 / (p.deckLevel + p.waterDepth + p.embedment + 2));
    var Hp = (p.deckLevel + p.waterDepth + p.embedment + 3) * kz + 2 * m + 30;
    var Z = function (z) { return m + (p.deckLevel + 1.5 - z) * kz; }, X = function (x) { return m + (x + cw + 5) * k; };
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wp + ' ' + Hp + '" class="planSvg" role="img" aria-label="Schematic pier section" font-family="Arial, Helvetica, sans-serif"><rect width="' + Wp + '" height="' + Hp + '" fill="#ffffff"/>'];
    s.push('<rect x="' + m + '" y="' + Z(0) + '" width="' + (Wp - 2 * m) + '" height="' + p.waterDepth * kz + '" fill="#9cc3ea" opacity="0.8"/>');
    s.push('<rect x="' + m + '" y="' + Z(-p.waterDepth) + '" width="' + (Wp - 2 * m) + '" height="' + (p.embedment + 1.5) * kz + '" fill="#cdb894"/>');
    if (cw > 0) {
      var hc = 0.6 * p.waterDepth;
      s.push('<path d="M' + m + ' ' + Z(p.deckLevel - 0.3) + ' L' + X(-5) + ' ' + Z(p.deckLevel - 0.3) + ' L' + X(0) + ' ' + Z(-hc) + ' L' + m + ' ' + Z(-hc) + ' Z" fill="#a39a8c" stroke="#6b6355"/>');
      s.push('<text x="' + (m + (X(-5) - m) / 2) + '" y="' + (Z(p.deckLevel) - 6) + '" font-size="11" text-anchor="middle" fill="#13213a">Causeway ' + p.causeway.toFixed(0) + ' m</text>');
    } else s.push('<path d="M' + m + ' ' + Z(p.deckLevel - 0.3) + ' L' + X(-2) + ' ' + Z(p.deckLevel - 0.3) + ' L' + X(4) + ' ' + Z(-p.waterDepth) + ' L' + m + ' ' + Z(-p.waterDepth) + ' Z" fill="#cdb894" stroke="#8a744f"/>');
    var nB = Math.floor(p.length / p.bentSpacing) + 1;
    for (var i = 0; i < nB; i++) {
      var xb = X(i * p.length / Math.max(1, nB - 1));
      s.push('<rect x="' + (xb - 2) + '" y="' + Z(p.deckLevel - 1.6) + '" width="4" height="' + (p.deckLevel - 1.6 + p.waterDepth + p.embedment) * kz + '" fill="' + (p.pileType === 'steel_pipe' ? '#6f7682' : '#a7aeb8') + '" stroke="#13213a" stroke-width="0.6"/>');
    }
    s.push('<rect x="' + X(0) + '" y="' + Z(p.deckLevel) + '" width="' + p.length * k + '" height="' + 1.6 * kz + '" fill="#c9ced6" stroke="#13213a" stroke-width="1.5"/>');
    var nF = Math.max(2, Math.ceil(p.length / 12));
    for (var f = 0; f < nF; f++) s.push('<rect x="' + (X((f + 0.5) * p.length / nF) - 4) + '" y="' + Z(p.deckLevel - 1.6) + '" width="8" height="' + 1.6 * kz + '" fill="#222"/>');
    if (p.roro) s.push('<path d="M' + X(p.length) + ' ' + Z(p.deckLevel) + ' L' + X(p.length + 6) + ' ' + Z(0.5) + '" stroke="#13213a" stroke-width="4"/>');
    s.push('<text x="' + (X(p.length) + 6) + '" y="' + (Z(0) - 4) + '" font-size="11" fill="#13213a">MLLW ±0.00</text>');
    s.push('<text x="' + X(p.length / 2) + '" y="' + (Z(p.deckLevel) - 6) + '" font-size="11" text-anchor="middle" fill="#13213a">Deck +' + p.deckLevel.toFixed(1) + ' m · ' + p.length.toFixed(0) + ' × ' + p.width.toFixed(1) + ' m</text>');
    s.push('<text x="' + (Wp / 2) + '" y="' + (Hp - 12) + '" font-size="13" text-anchor="middle" fill="#13213a">' + esc(E.PORT_FACILITIES[p.facility].label) + ' · ' + esc(E.PORT_PILES[p.pileType].label) + ', ' + (p.waterDepth + p.deckLevel + p.embedment).toFixed(1) + ' m · water depth ' + p.waterDepth.toFixed(1) + ' m · BUHAY-AH schematic</text>');
    s.push('</svg>');
    return s.join('');
  }

  function levelName(i) { return i === 0 ? 'Ground floor plan' : ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'][i - 1] + ' floor plan'; }

  function bridgeSVG(plan) {
    var b = E.normalizeBridge(plan), k = Math.min(9, 900 / (b.totalLength + 30)), m = 40;
    var Lt = b.totalLength, n = b.spans, S = Lt / n, isC = b.superstructure === 'box_culvert';
    var deck = isC ? b.abutmentHeight + 0.6 : Math.max(b.pierHeight, b.abutmentHeight) + 1.5;
    var Wp = (Lt + 30) * k + 2 * m, Hp = (deck + 6) * k + 2 * m + 40, base = m + (deck + 4) * k;
    var X = function (x) { return m + (x + 15) * k; }, Y = function (z) { return base - z * k; };
    var s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wp + ' ' + Hp + '" class="planSvg" role="img" aria-label="Schematic bridge elevation" font-family="Arial, Helvetica, sans-serif"><rect width="' + Wp + '" height="' + Hp + '" fill="#ffffff"/>'];
    s.push('<path d="M' + X(-15) + ' ' + Y(deck - 0.6) + ' L' + X(0) + ' ' + Y(deck - 0.6) + ' L' + X(Math.min(4, Lt / 4)) + ' ' + Y(0) + ' L' + X(Lt - Math.min(4, Lt / 4)) + ' ' + Y(0) + ' L' + X(Lt) + ' ' + Y(deck - 0.6) + ' L' + X(Lt + 15) + ' ' + Y(deck - 0.6) + ' L' + X(Lt + 15) + ' ' + (base + 3 * k) + ' L' + X(-15) + ' ' + (base + 3 * k) + ' Z" fill="#cdb894" stroke="#8a744f"/>');
    if (b.waterway) s.push('<rect x="' + X(1) + '" y="' + Y(1.2) + '" width="' + (Lt - 2) * k + '" height="' + 1.2 * k + '" fill="#9cc3ea" opacity="0.8"/>');
    if (isC) {
      s.push('<rect x="' + X(0) + '" y="' + Y(b.abutmentHeight + 0.4) + '" width="' + Lt * k + '" height="' + (b.abutmentHeight + 0.4) * k + '" fill="#c3c8cf" stroke="#13213a" stroke-width="2"/>');
      for (var c = 0; c < n; c++) s.push('<rect x="' + X(c * S + 0.2) + '" y="' + Y(b.abutmentHeight + 0.2) + '" width="' + (S - 0.4) * k + '" height="' + b.abutmentHeight * k + '" fill="#ffffff" stroke="#13213a"/>');
    } else {
      var gd = b.superstructure === 'rcdg' ? Math.max(0.9, S / 13 + 0.1) : b.superstructure === 'pscg' ? (S <= 24 ? 1.14 : S <= 32 ? 1.37 : 1.6) : 0.8;
      s.push('<rect x="' + X(-1.5) + '" y="' + Y(deck) + '" width="' + 1.5 * k + '" height="' + (deck + 1) * k + '" fill="#b9bec6" stroke="#13213a"/>');
      s.push('<rect x="' + X(Lt) + '" y="' + Y(deck) + '" width="' + 1.5 * k + '" height="' + (deck + 1) * k + '" fill="#b9bec6" stroke="#13213a"/>');
      for (var p = 1; p < n; p++) {
        s.push('<rect x="' + X(p * S - 0.6) + '" y="' + Y(deck - gd - 0.2) + '" width="' + 1.2 * k + '" height="' + (deck - gd + 0.8) * k + '" fill="#9aa3b0" stroke="#13213a"/>');
        s.push('<rect x="' + X(p * S - 2) + '" y="' + Y(-0.6) + '" width="' + 4 * k + '" height="' + 1.5 * k + '" fill="#b9bec6" stroke="#13213a"/>');
      }
      s.push('<rect x="' + X(0) + '" y="' + Y(deck) + '" width="' + Lt * k + '" height="' + gd * k + '" fill="#d3d7dd" stroke="#13213a" stroke-width="1.5"/>');
      if (b.superstructure === 'steel_truss') {
        var Ht = Math.max(5, S / 8);
        for (var sp2 = 0; sp2 < n; sp2++) {
          var x0 = sp2 * S, bays = Math.max(4, Math.round(S / 6));
          s.push('<polyline points="' + X(x0) + ',' + Y(deck) + ' ' + X(x0) + ',' + Y(deck + Ht) + ' ' + X(x0 + S) + ',' + Y(deck + Ht) + ' ' + X(x0 + S) + ',' + Y(deck) + '" fill="none" stroke="#c4561f" stroke-width="2.5"/>');
          for (var bb = 0; bb < bays; bb++) {
            var xa = x0 + bb * S / bays, xb = xa + S / bays;
            s.push('<line x1="' + X(xa) + '" y1="' + Y(deck + Ht) + '" x2="' + X(xa) + '" y2="' + Y(deck) + '" stroke="#c4561f" stroke-width="1.5"/>');
            s.push('<line x1="' + X(bb < bays / 2 ? xa : xb) + '" y1="' + Y(deck) + '" x2="' + X(bb < bays / 2 ? xb : xa) + '" y2="' + Y(deck + Ht) + '" stroke="#c4561f" stroke-width="1.5"/>');
          }
        }
      }
      for (var sp3 = 0; sp3 < n; sp3++) s.push('<text x="' + X(sp3 * S + S / 2) + '" y="' + (Y(deck) - 8) + '" font-size="12" text-anchor="middle" fill="#13213a">' + S.toFixed(1) + ' m</text>');
    }
    s.push('<line x1="' + X(-15) + '" y1="' + Y(deck + 0.05) + '" x2="' + X(Lt + 15) + '" y2="' + Y(deck + 0.05) + '" stroke="#3b3f45" stroke-width="3"/>');
    s.push('<text x="' + X(Lt / 2) + '" y="' + (base + 3 * k + 20) + '" font-size="13" text-anchor="middle" fill="#13213a">' + esc(E.SUPERSTRUCTURES[b.superstructure].label) + ' · ' + n + ' × ' + S.toFixed(1) + ' m = ' + Lt.toFixed(1) + ' m · ' + b.carriageway.toFixed(2) + ' m carriageway · BUHAY-AH schematic</text>');
    s.push('</svg>');
    return s.join('');
  }

  return {
    SPACES: S, USAGE: USAGE, TEMPLATES: T, BRIDGE_TEMPLATES: BRIDGE_TEMPLATES, CAT_FILL: FILL, BAYS: BAYS,
    AIRFIELD_TEMPLATES: AIRFIELD_TEMPLATES, PORT_TEMPLATES: PORT_TEMPLATES,
    programFor: programFor, build: build, combine: combine, quote: quote, fromBudget: fromBudget,
    bridgeOptions: bridgeOptions, planSVG: planSVG, bridgeSVG: bridgeSVG, airfieldSVG: airfieldSVG, portSVG: portSVG, levelName: levelName
  };
}));
