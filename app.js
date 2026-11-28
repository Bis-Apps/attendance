/*
 * Attendance System - pages: app.js
 * Phase 3, Stage D, step 4 (academic structure). Version 0.6.0
 *
 * Sign-in (as proven in step 1c), the menu built from the user's roles, the
 * accounts screens (Owner and Admin) and the academic structure screens (step 4:
 * years, terms, levels, absence policies; Supervisors see them read-only). The page only shows and asks: every rule and
 * permission is checked again by the backend (Stage B 3, "hiding is not security").
 * The session token is kept in page memory only (Stage B 2): closing or reloading
 * the page signs out.
 */
(function () {
  'use strict';
  var CFG = window.ATTENDANCE_CONFIG || {};
  var ROLE_AR = { Owner: 'مالك النظام', Admin: 'مسؤول', Supervisor: 'مشرف', Professor: 'أستاذ', TA: 'معيد' };
  var ROLES = ['Owner', 'Admin', 'Supervisor', 'Professor', 'TA'];
  var FIELD_AR = {
    REQUIRED: 'هذا الحقل مطلوب.',
    INVALID_EMAIL: 'البريد الإلكتروني غير صحيح.',
    DUPLICATE_RECORD: 'مسجل بالفعل في النظام.',
    TOO_LONG: 'النص أطول من المسموح.',
    INVALID_TEXT: 'النص غير صالح.',
    FORMULA_NOT_ALLOWED: 'لا يمكن أن يبدأ النص بعلامة =.',
    INVALID_FOREIGN_KEY: 'السجل المرتبط غير موجود.',
    NOT_IN_LIST: 'قيمة غير مسموح بها.',
    UNKNOWN_FIELD: 'حقل غير معروف.',
    INVALID_YEAR_LABEL: 'اكتب العام بالشكل 2026/2027 (السنة الثانية تلي الأولى).',
    END_BEFORE_START: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية.',
    OUTSIDE_YEAR: 'التاريخ خارج العام الدراسي.',
    EXCLUDES_TERM: 'يوجد فصل دراسي خارج هذه التواريخ.',
    OUT_OF_RANGE: 'القيمة خارج المدى المسموح.',
    INVALID_INTEGER: 'اكتب رقماً صحيحاً.',
    INVALID_DATE: 'تاريخ غير صحيح.'
  };
  var RULE_AR = {
    U24: 'لكل بريد إلكتروني حساب واحد فقط.',
    U25: 'لكل عضو هيئة تدريس حساب واحد فقط.',
    U27: 'هذا الدور ممنوح لهذا الحساب بالفعل.',
    U28: 'يجب أن يبقى للنظام مالك واحد بحساب مفعّل.',
    U02: 'هذا العام مسجل بالفعل.',
    U03: 'يكون عام واحد فقط هو العام الحالي.',
    U04: 'لكل عام فصل أول واحد وفصل ثانٍ واحد وفصل صيفي واحد.',
    U05: 'يوجد فصل آخر جارٍ بالفعل. أغلقه أولاً.',
    U06: 'رقم المستوى مستخدم بالفعل.',
    U22: 'لكل فصل سياسة واحدة للمحاضرات وواحدة للسكاشن.',
    B05: 'توجد محاضرات أو سكاشن ستقع خارج تواريخ الفصل أو عدد أسابيعه.',
    B21: 'يجب ضبط سياستي الغياب (المحاضرات والسكاشن) قبل بدء الفصل، ويضبطهما المالك فقط.',
    'C-5': 'لا يمكن إغلاق الفصل وفيه محاضرة أو سكشن مفتوح لم يُنهَ بعد.',
    B20: 'دورا الأستاذ والمعيد يحتاجان ربط الحساب بسجل عضو هيئة تدريس، ولا يُمنح حساب النظام أي دور، ودورا المالك والمسؤول يمنحهما المالك فقط.'
  };
  var PAGE_SIZE = 50;
  var TERM_AR = { First: 'الفصل الأول', Second: 'الفصل الثاني', Summer: 'الفصل الصيفي' };
  var SEMSTATUS_AR = { Planned: 'مخطط', Active: 'جارٍ', Closed: 'مغلق' };
  var TYPE_AR = { Lecture: 'المحاضرات', Section: 'السكاشن' };

  var S = {
    token: null, user: null, menus: [], grantable: [],
    rows: [], total: 0, page: 1, current: null
  };
  var logLines = [];

  // ------------------------------------------------------------------ small helpers
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function log(line) {
    logLines.push(new Date().toTimeString().slice(0, 8) + ' ' + line);
    if (logLines.length > 60) logLines.shift();
    el('log').textContent = logLines.join('\n');
  }
  function roleText(r) { return ROLE_AR[r] || r; }
  function rolesText(list) { return list && list.length ? list.map(roleText).join('، ') : 'لا توجد أدوار'; }

  function show(view) {
    ['vSignin', 'vHome', 'vAccounts', 'vCreate', 'vAccount', 'vAcademic', 'vEntity'].forEach(function (v) { el(v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }
  function message(cls, html) {
    var m = el('msg');
    if (!html) { m.hidden = true; return; }
    m.className = 'card ' + cls; m.innerHTML = html; m.hidden = false;
  }
  function failText(res) {
    var t = esc(res && res.message || 'تعذّر تنفيذ الطلب.');
    if (res && res.rule && RULE_AR[res.rule]) t += '<br>' + esc(RULE_AR[res.rule]);
    return t;
  }
  function warningsText(res) {
    return (res && res.warnings || []).map(function (w) { return esc(w.message || w); }).join('<br>');
  }

  // ------------------------------------------------------------------ backend calls
  var pending = 0;
  function call(op, input) {
    var req = { op: op, clientRequestId: rid() };
    if (S.token) req.token = S.token;
    if (input) req.input = input;
    pending++; el('busy').style.display = 'block';
    return fetch(CFG.BACKEND_URL, { method: 'POST', body: JSON.stringify(req), redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        return { success: false, errorCode: 'CALL_FAILED', message: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.', detail: String(err && err.message || err) };
      })
      .then(function (res) {
        pending--; if (!pending) el('busy').style.display = 'none';
        log(op + ': ' + (res.success ? 'OK' : res.errorCode + (res.rule ? ' ' + res.rule : '') + (res.detail ? ' ' + res.detail : '')) + '  id=' + (res.requestId || req.clientRequestId));
        if (!res.success && (res.errorCode === 'UNAUTHORIZED' || res.errorCode === 'NOT_REGISTERED') && S.token) {
          signOut(failText(res));
        }
        return res;
      });
  }

  function busyButton(btn, promise) {
    btn.disabled = true;
    return promise.then(function (x) { btn.disabled = false; return x; });
  }

  // ------------------------------------------------------------------ sign-in (step 1c)
  function startSignIn() {
    show('vSignin');
    el('gbtn').innerHTML = '';
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(CFG.BACKEND_URL || '')) {
      el('signinText').textContent = 'لم يُضبط عنوان الخادم في config.js بعد.';
      log('START: BACKEND_URL not set in config.js');
      return;
    }
    el('signinText').textContent = 'جارٍ التحضير…';
    call('auth.startSignIn').then(function (res) {
      if (!res.success) { el('signinText').innerHTML = failText(res); return; }
      if (!res.data.clientId) { el('signinText').textContent = 'لم يُضبط GOOGLE_CLIENT_ID في الخادم بعد.'; return; }
      loadGoogle(res.data.clientId, res.data.nonce);
    });
  }

  function loadGoogle(clientId, nonce) {
    var init = function () {
      try {
        google.accounts.id.initialize({
          client_id: clientId, nonce: nonce, callback: onCredential,
          ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true
        });
        google.accounts.id.renderButton(el('gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ar', width: 280 });
        el('signinText').textContent = 'اضغط زر Google واختر حسابك المسجل في النظام.';
      } catch (e) {
        el('signinText').textContent = 'تعذّر تشغيل تسجيل الدخول من Google.';
        log('GOOGLE: init error ' + e);
      }
    };
    if (window.google && google.accounts && google.accounts.id) { init(); return; }
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    s.onerror = function () { el('signinText').textContent = 'تعذّر تحميل تسجيل الدخول من Google.'; log('GOOGLE: library failed to load'); };
    document.head.appendChild(s);
  }

  function onCredential(resp) {
    if (!resp || !resp.credential) { el('signinText').textContent = 'لم يُرسل Google بيانات الدخول.'; return; }
    el('signinText').textContent = 'جارٍ التحقق…';
    el('gbtn').innerHTML = '';
    call('auth.signInWithGoogle', { credential: resp.credential }).then(function (res) {
      if (!res.success) {
        el('signinText').innerHTML = failText(res);
        var again = document.createElement('button');
        again.textContent = 'تسجيل الدخول بحساب آخر';
        again.onclick = startSignIn;
        el('gbtn').appendChild(again);
        return;
      }
      S.token = res.data.token;
      loadHome();
    });
  }

  function signOut(why) {
    S.token = null; S.user = null; S.menus = []; S.current = null;
    el('who').textContent = ''; el('btnOut').hidden = true;
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* not loaded */ }
    message(why ? 'bad' : '', why || '');
    startSignIn();
  }

  // ------------------------------------------------------------------ home and menu
  var MENU = {
    academic: { label: 'الهيكل الأكاديمي', hint: 'الأعوام والفصول والمستويات وسياسات الغياب', open: function () { openAcademic(); } },
    accounts: { label: 'الحسابات والأدوار', hint: 'إنشاء الحسابات ومنح الأدوار وتفعيلها', open: function () { openAccounts(); } }
  };

  function loadHome() {
    call('auth.me').then(function (res) {
      if (!res.success) { if (S.token) message('bad', failText(res)); return; }
      S.user = res.data.user; S.menus = res.data.menus || [];
      el('who').innerHTML = esc(S.user.DisplayName || S.user.Email) + '<br>' + esc(rolesText(res.data.roles));
      el('btnOut').hidden = false;
      el('homeHello').textContent = 'مرحباً، ' + (S.user.DisplayName || S.user.Email);
      el('homeRoles').textContent = 'أدوارك: ' + rolesText(res.data.roles);
      var m = el('menu'); m.innerHTML = '';
      S.menus.forEach(function (k) {
        if (!MENU[k]) return;
        var b = document.createElement('button');
        b.innerHTML = '<b>' + esc(MENU[k].label) + '</b><div class="muted">' + esc(MENU[k].hint) + '</div>';
        b.onclick = function () { message(); MENU[k].open(); };
        m.appendChild(b);
      });
      el('noMenu').hidden = S.menus.length > 0;
      message();
      show('vHome');
    });
  }

  // ------------------------------------------------------------------ accounts list
  function filters(page) {
    var f = { page: page, pageSize: PAGE_SIZE };
    var q = el('fQuery').value.trim(); if (q) f.query = q;
    if (el('fRole').value) f.role = el('fRole').value;
    if (el('fActive').value) f.isActive = el('fActive').value === 'true';
    return f;
  }

  function openAccounts() {
    show('vAccounts');
    loadList(1);
  }

  function loadList(page) {
    return call('users.list', filters(page)).then(function (res) {
      if (!res.success) { message('bad', failText(res)); return res; }
      S.grantable = res.data.grantableRoles || [];
      S.rows = page === 1 ? res.data.rows : S.rows.concat(res.data.rows);
      S.total = res.data.total; S.page = page;
      renderList();
      return res;
    });
  }

  function renderList() {
    el('listCount').textContent = S.total ? ('عدد الحسابات: ' + S.total) : 'لا توجد حسابات مطابقة.';
    var box = el('list'); box.innerHTML = '';
    S.rows.forEach(function (u) {
      var b = document.createElement('button');
      b.className = 'item';
      b.innerHTML = '<b>' + esc(u.DisplayName || u.StaffName || '—') + '</b>' +
        '<span class="email">' + esc(u.LoginEmail) + '</span><br>' +
        '<span class="chip ' + (u.IsActive ? 'on' : 'off') + '">' + (u.IsActive ? 'مفعّل' : 'غير مفعّل') + '</span>' +
        (u.roles.length ? u.roles.map(function (r) { return '<span class="chip">' + esc(roleText(r.Role)) + '</span>'; }).join('')
                        : '<span class="chip off">بدون دور</span>');
      b.onclick = function () { message(); openAccount(u); };
      box.appendChild(b);
    });
    el('btnMore').hidden = S.rows.length >= S.total;
  }

  // ------------------------------------------------------------------ one account
  function openAccount(u) {
    S.current = u;
    el('aTitle').textContent = u.DisplayName || u.StaffName || u.LoginEmail;
    var info = [
      ['البريد', '<span class="email">' + esc(u.LoginEmail) + '</span>'],
      ['رقم المستخدم', '<span dir="ltr">' + esc(u.UserID) + '</span>'],
      ['عضو هيئة التدريس', u.StaffID ? esc(u.StaffName || u.StaffID) : 'غير مرتبط'],
      ['الحالة', u.IsActive ? 'مفعّل' : 'غير مفعّل'],
      ['تاريخ الإنشاء', '<span dir="ltr">' + esc(String(u.CreatedAt || '').replace('T', ' ').slice(0, 16)) + '</span>']
    ];
    el('aInfo').innerHTML = info.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('');

    var can = u.canManage === true;
    el('aLocked').hidden = can;
    el('aLocked').textContent = 'حسابات المالك والمسؤولين يعدّلها المالك فقط، لذلك تظهر هنا للاطلاع.';
    el('aEdit').hidden = !can;
    el('aName').value = u.DisplayName || '';
    el('aNameErr').textContent = '';

    var held = u.roles.map(function (r) { return r.Role; });
    el('aRoles').innerHTML = '';
    if (!u.roles.length) el('aRoles').innerHTML = '<p class="muted">لا توجد أدوار لهذا الحساب.</p>';
    u.roles.forEach(function (r) {
      var line = document.createElement('div');
      line.className = 'roleline';
      line.innerHTML = '<span>' + esc(roleText(r.Role)) + '</span>';
      if (can && S.grantable.indexOf(r.Role) >= 0) {
        var x = document.createElement('button');
        x.className = 'secondary'; x.textContent = 'إزالة';
        x.onclick = function () {
          confirmSheet('إزالة دور «' + roleText(r.Role) + '» من هذا الحساب؟ سيتوقف أثره من الطلب التالي لصاحبه.', function () {
            busyButton(x, call('users.revokeRole', { userRoleId: r.UserRoleID })).then(function (res) { afterChange(res, 'تمت إزالة الدور.'); });
          });
        };
        line.appendChild(x);
      }
      el('aRoles').appendChild(line);
    });

    var options = S.grantable.filter(function (r) { return held.indexOf(r) < 0; });
    el('aAddRole').hidden = !can || !options.length;
    el('aRoleSel').innerHTML = options.map(function (r) {
      var needsStaff = (r === 'Professor' || r === 'TA') && !u.StaffID;
      return '<option value="' + r + '"' + (needsStaff ? ' disabled' : '') + '>' + esc(roleText(r)) + (needsStaff ? ' (يحتاج ربطاً بعضو هيئة تدريس)' : '') + '</option>';
    }).join('');
    var firstOk = options.filter(function (r) { return !((r === 'Professor' || r === 'TA') && !u.StaffID); })[0];
    if (firstOk) el('aRoleSel').value = firstOk;
    el('btnGrant').disabled = !firstOk;
    el('aRoleNote').textContent = u.StaffID ? '' : 'دورا الأستاذ والمعيد يتاحان بعد إضافة شاشة أعضاء هيئة التدريس وربط الحساب بها.';

    el('aActive').hidden = !can;
    el('aActiveText').textContent = u.IsActive ? 'الحساب مفعّل، ويمكن لصاحبه الدخول.' : 'الحساب غير مفعّل، ولا يمكن لصاحبه الدخول.';
    el('btnActive').textContent = u.IsActive ? 'إيقاف الحساب' : 'تفعيل الحساب';
    el('btnActive').className = u.IsActive ? 'danger' : '';
    show('vAccount');
  }

  function afterChange(res, okText) {
    if (!res.success) { message('bad', failText(res)); window.scrollTo(0, 0); return; }
    var w = warningsText(res);
    message(w ? 'warn' : 'ok', esc(okText) + (w ? '<br>' + w : ''));
    reloadCurrent();
  }

  /** Re-reads the account from the backend, so the screen shows what was saved. */
  function reloadCurrent(userId) {
    var id = userId || (S.current && S.current.UserID);
    return call('users.list', { query: id, pageSize: 200 }).then(function (res) {
      if (!res.success) { message('bad', failText(res)); return; }
      S.grantable = res.data.grantableRoles || [];
      var u = res.data.rows.filter(function (x) { return x.UserID === id; })[0];
      if (u) openAccount(u); else openAccounts();
    });
  }

  // ------------------------------------------------------------------ academic structure (step 4)
  // One generic screen: a list, an add/edit form built from the entity's fields, and
  // per-row actions. The backend says in each list whether this user may edit (canEdit).
  function dates(a, b) { return '<span dir="ltr">' + esc(a) + '</span> إلى <span dir="ltr">' + esc(b) + '</span>'; }
  function opts(list, labels) { return list.map(function (v) { return { v: v, t: labels ? labels[v] : v }; }); }
  var lookup = { years: [], semesters: [] };
  function loadLookup(name) {
    var op = name === 'years' ? 'years.list' : 'semesters.list';
    return call(op, { pageSize: 200 }).then(function (res) { if (res.success) lookup[name] = res.data.rows; return res; });
  }
  function semLabel(s) { return (TERM_AR[s.Term] || s.Term) + ' ' + (s.YearLabel || ''); }

  var ENT = {
    years: {
      title: 'الأعوام الدراسية', list: 'years.list', id: 'AcademicYearID', idKey: 'academicYearId',
      create: 'years.create', update: 'years.update',
      fields: [
        { k: 'yearLabel', col: 'YearLabel', label: 'العام', type: 'text', ltr: true, ph: '2026/2027', req: true },
        { k: 'startDate', col: 'StartDate', label: 'تاريخ بداية العام', type: 'date', req: true },
        { k: 'endDate', col: 'EndDate', label: 'تاريخ نهاية العام', type: 'date', req: true }
      ],
      head: function (r) { return r.YearLabel; },
      body: function (r) { return dates(r.StartDate, r.EndDate) + '<br><span class="muted">عدد الفصول: ' + r.Semesters + '</span>'; },
      chips: function (r) { return r.IsCurrent ? [['العام الحالي', 'on']] : []; },
      actions: function (r) {
        return r.IsCurrent ? [] : [{ label: 'تعيين كعام حالي', op: 'years.setCurrent', input: { academicYearId: r.AcademicYearID }, ok: 'تم تعيين العام الحالي.' }];
      }
    },
    semesters: {
      title: 'الفصول الدراسية', list: 'semesters.list', id: 'SemesterID', idKey: 'semesterId',
      create: 'semesters.create', update: 'semesters.update', needs: ['years'],
      hint: 'يبدأ الفصل «مخططاً»، ثم «جارٍ» بعد ضبط سياستي الغياب، ثم «مغلق» نهائياً. الأسبوع الأول هو 7 أيام تبدأ من تاريخ بداية الفصل.',
      fields: [
        { k: 'academicYearId', col: 'AcademicYearID', label: 'العام الدراسي', type: 'select', createOnly: true, req: true,
          options: function () { return lookup.years.map(function (y) { return { v: y.AcademicYearID, t: y.YearLabel }; }); } },
        { k: 'term', col: 'Term', label: 'الفصل', type: 'select', req: true, options: function () { return opts(['First', 'Second', 'Summer'], TERM_AR); } },
        { k: 'startDate', col: 'StartDate', label: 'تاريخ بداية الفصل (أول يوم في الأسبوع الأول)', type: 'date', req: true },
        { k: 'endDate', col: 'EndDate', label: 'تاريخ نهاية الفصل', type: 'date', req: true },
        { k: 'teachingWeeks', col: 'TeachingWeeks', label: 'عدد أسابيع الدراسة (1 إلى 20)', type: 'number', req: true }
      ],
      head: function (r) { return semLabel(r); },
      body: function (r) {
        return dates(r.StartDate, r.EndDate) + '<br><span class="muted">أسابيع الدراسة: ' + r.TeachingWeeks +
          ' · سياسة المحاضرات: ' + (r.HasLecturePolicy ? 'مضبوطة' : 'غير مضبوطة') + ' · سياسة السكاشن: ' + (r.HasSectionPolicy ? 'مضبوطة' : 'غير مضبوطة') + '</span>';
      },
      chips: function (r) { return [[SEMSTATUS_AR[r.Status] || r.Status, r.Status === 'Active' ? 'on' : (r.Status === 'Closed' ? 'off' : '')]]; },
      editable: function (r) { return r.Status !== 'Closed'; },
      actions: function (r) {
        if (r.Status === 'Planned') return [{ label: 'بدء الفصل (جارٍ)', op: 'semesters.setStatus', input: { semesterId: r.SemesterID, status: 'Active' }, ok: 'أصبح الفصل جارياً.',
          confirm: 'بدء «' + semLabel(r) + '»؟ لا يكون إلا فصل واحد جارٍ في نفس الوقت.' }];
        if (r.Status === 'Active') return [{ label: 'إغلاق الفصل', op: 'semesters.setStatus', input: { semesterId: r.SemesterID, status: 'Closed' }, ok: 'تم إغلاق الفصل.', danger: true,
          confirm: 'إغلاق «' + semLabel(r) + '» نهائياً؟ لا يمكن إعادة فتحه بعد الإغلاق.' }];
        return [];
      }
    },
    levels: {
      title: 'المستويات', list: 'levels.list', id: 'LevelID', idKey: 'levelId',
      create: 'levels.create', update: 'levels.update',
      fields: [
        { k: 'levelNumber', col: 'LevelNumber', label: 'رقم المستوى', type: 'number', req: true },
        { k: 'nameAr', col: 'NameAr', label: 'الاسم بالعربي', type: 'text', req: true, ph: 'الفرقة الأولى' },
        { k: 'nameEn', col: 'NameEn', label: 'الاسم بالإنجليزي (اختياري)', type: 'text', ltr: true },
        { k: 'isActive', col: 'IsActive', label: 'المستوى مفعّل', type: 'check', updateOnly: true }
      ],
      head: function (r) { return r.NameAr; },
      body: function (r) { return '<span class="muted">رقم المستوى: ' + r.LevelNumber + (r.NameEn ? ' · <span dir="ltr">' + esc(r.NameEn) + '</span>' : '') + '</span>'; },
      chips: function (r) { return [[r.IsActive ? 'مفعّل' : 'غير مفعّل', r.IsActive ? 'on' : 'off']]; }
    },
    policies: {
      title: 'سياسات الغياب', list: 'policies.list', id: 'PolicyID', create: 'policies.set', setStyle: true, needs: ['semesters'],
      hint: 'سياسة لكل فصل: واحدة للمحاضرات وواحدة للسكاشن. يضبطها مالك النظام فقط، ويطبَّق أي تغيير على المراجعات التي تُفتح بعده.',
      fields: [
        { k: 'semesterId', col: 'SemesterID', label: 'الفصل', type: 'select', lockOnEdit: true, req: true,
          options: function () { return lookup.semesters.map(function (x) { return { v: x.SemesterID, t: semLabel(x) }; }); } },
        { k: 'sessionType', col: 'SessionType', label: 'النوع', type: 'select', lockOnEdit: true, req: true, options: function () { return opts(['Lecture', 'Section'], TYPE_AR); } },
        { k: 'maxAllowedAbsences', col: 'MaxAllowedAbsences', label: 'أقصى عدد غيابات مسموح', type: 'number', req: true },
        { k: 'finalizationDeadlineDays', col: 'FinalizationDeadlineDays', label: 'مهلة إنهاء المحاضرة بالأيام (0 = نفس اليوم)', type: 'number', req: true },
        { k: 'notes', col: 'Notes', label: 'ملاحظات (اختياري)', type: 'text' }
      ],
      head: function (r) { return (TYPE_AR[r.SessionType] || r.SessionType) + ' · ' + (TERM_AR[r.Term] || r.Term) + ' ' + r.YearLabel; },
      body: function (r) {
        return 'أقصى غياب مسموح: <b>' + r.MaxAllowedAbsences + '</b><br>مهلة الإنهاء: ' + (r.FinalizationDeadlineDays === 0 ? 'نفس اليوم' : r.FinalizationDeadlineDays + ' يوم') +
          (r.Notes ? '<br><span class="muted">' + esc(r.Notes) + '</span>' : '');
      },
      chips: function () { return []; }
    }
  };

  var E = { name: null, rows: [], canEdit: false, editing: null };

  function openAcademic() {
    var m = el('acMenu'); m.innerHTML = '';
    ['years', 'semesters', 'levels', 'policies'].forEach(function (k) {
      var b = document.createElement('button');
      b.innerHTML = '<b>' + esc(ENT[k].title) + '</b>';
      b.onclick = function () { message(); openEntity(k); };
      m.appendChild(b);
    });
    show('vAcademic');
  }

  function openEntity(name) {
    E.name = name; E.editing = null;
    var ent = ENT[name];
    el('eTitle').textContent = ent.title;
    el('eHint').textContent = ent.hint || '';
    el('eForm').hidden = true;
    el('eList').innerHTML = '';
    show('vEntity');
    var needs = (ent.needs || []).map(loadLookup);
    Promise.all(needs).then(function () { return loadEntity(); });
  }

  function loadEntity() {
    var ent = ENT[E.name];
    return call(ent.list, { pageSize: 200 }).then(function (res) {
      if (!res.success) { message('bad', failText(res)); return; }
      E.rows = res.data.rows; E.canEdit = res.data.canEdit === true;
      el('eAdd').hidden = !E.canEdit;
      renderEntity();
    });
  }

  function renderEntity() {
    var ent = ENT[E.name], box = el('eList');
    box.innerHTML = '';
    if (!E.rows.length) box.innerHTML = '<p class="muted">لا توجد سجلات بعد.</p>';
    E.rows.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<b>' + esc(ent.head(r)) + '</b> ' +
        ent.chips(r).map(function (c) { return '<span class="chip ' + c[1] + '">' + esc(c[0]) + '</span>'; }).join('') +
        '<div style="margin-top:6px">' + ent.body(r) + '</div>';
      if (E.canEdit) {
        var act = document.createElement('div'); act.className = 'actions';
        if (!ent.editable || ent.editable(r)) {
          var ed = document.createElement('button'); ed.className = 'secondary'; ed.textContent = 'تعديل';
          ed.onclick = function () { openForm(r); };
          act.appendChild(ed);
        }
        (ent.actions ? ent.actions(r) : []).forEach(function (a) {
          var b = document.createElement('button'); b.textContent = a.label; if (a.danger) b.className = 'danger';
          b.onclick = function () {
            var go = function () { busyButton(b, call(a.op, a.input)).then(function (res) { afterEntity(res, a.ok); }); };
            if (a.confirm) confirmSheet(a.confirm, go); else go();
          };
          act.appendChild(b);
        });
        card.appendChild(act);
      }
      box.appendChild(card);
    });
  }

  function openForm(row) {
    var ent = ENT[E.name];
    E.editing = row || null;
    el('eFormTitle').textContent = row ? 'تعديل: ' + ent.head(row) : 'إضافة';
    var f = el('eFields'); f.innerHTML = '';
    ent.fields.forEach(function (fd) {
      if (row && fd.createOnly) return;
      if (!row && fd.updateOnly) return;
      var v = row ? row[fd.col] : '';
      var id = 'f_' + fd.k, html;
      if (fd.type === 'check') {
        html = '<label class="check"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(fd.label) + '</label>';
      } else {
        html = '<label for="' + id + '">' + esc(fd.label) + '</label>';
        if (fd.type === 'select') {
          html += '<select id="' + id + '"' + (row && fd.lockOnEdit ? ' disabled' : '') + '><option value="">اختر…</option>' +
            fd.options().map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(v) === String(o.v) ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('') + '</select>';
        } else {
          html += '<input id="' + id + '" type="' + (fd.type === 'number' ? 'text' : fd.type) + '"' + (fd.type === 'number' ? ' inputmode="numeric"' : '') +
            (fd.ltr ? ' class="ltr"' : '') + (fd.ph ? ' placeholder="' + esc(fd.ph) + '"' : '') + ' value="' + esc(v === undefined || v === null ? '' : v) + '" autocomplete="off">';
        }
      }
      html += '<div class="err" id="' + id + '_err"></div>';
      var d = document.createElement('div'); d.innerHTML = html; f.appendChild(d);
    });
    el('eForm').hidden = false;
    el('eForm').scrollIntoView({ behavior: 'smooth' });
  }

  function readField(fd) {
    var e = el('f_' + fd.k);
    if (!e) return undefined;
    if (fd.type === 'check') return e.checked;
    var v = e.value.trim();
    if (v === '') return undefined;
    if (fd.type === 'number') { var n = Number(v.replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })); return isNaN(n) ? v : n; }
    return v;
  }

  function saveForm() {
    var ent = ENT[E.name], row = E.editing, input = {}, missing = false;
    ent.fields.forEach(function (fd) {
      if (row && fd.createOnly) return;
      if (!row && fd.updateOnly) return;
      var v = readField(fd);
      el('f_' + fd.k + '_err').textContent = '';
      if (row && fd.lockOnEdit) v = row[fd.col];
      if (v === undefined) { if (fd.req && (!row || ent.setStyle)) { el('f_' + fd.k + '_err').textContent = FIELD_AR.REQUIRED; missing = true; } return; }
      if (row && !ent.setStyle && String(v) === String(row[fd.col])) return;   // send only what changed
      input[fd.k] = v;
    });
    if (missing) return;
    if (row && !ent.setStyle) {
      if (!Object.keys(input).length) { message('', 'لم يتغير شيء.'); el('eForm').hidden = true; return; }
      input[ent.idKey] = row[ent.id];
    }
    var op = row && !ent.setStyle ? ent.update : ent.create;
    busyButton(el('eSave'), call(op, input)).then(function (res) {
      (res.fieldErrors || []).forEach(function (fe) {
        var k = String(fe.field).replace(/^input\./, ''), box = el('f_' + k + '_err');
        if (box) box.textContent = FIELD_AR[fe.code] || fe.message || fe.code;
      });
      if (!res.success) { message('bad', failText(res)); return; }
      el('eForm').hidden = true;
      if (res.data && res.data.changed === false) { message('', 'لم يتغير شيء.'); return; }
      afterEntity(res, 'تم الحفظ.');
    });
  }

  function afterEntity(res, okText) {
    if (!res.success) { message('bad', failText(res)); window.scrollTo(0, 0); return; }
    var w = warningsText(res);
    message(w ? 'warn' : 'ok', esc(okText) + (w ? '<br>' + w : ''));
    window.scrollTo(0, 0);
    var needs = (ENT[E.name].needs || []).map(loadLookup);
    Promise.all(needs).then(loadEntity);
  }

  // ------------------------------------------------------------------ confirmation sheet
  var confirmAction = null;
  function confirmSheet(text, action) {
    el('confirmText').textContent = text;
    confirmAction = action;
    el('overlay').style.display = 'flex';
  }
  function closeSheet() { el('overlay').style.display = 'none'; confirmAction = null; }

  // ------------------------------------------------------------------ field errors on forms
  function showFieldErrors(res, map) {
    Object.keys(map).forEach(function (k) { el(map[k]).textContent = ''; });
    (res.fieldErrors || []).forEach(function (f) {
      if (map[f.field]) el(map[f.field]).textContent = FIELD_AR[f.code] || f.message || f.code;
    });
  }

  // ------------------------------------------------------------------ wiring
  function wire() {
    el('btnOut').onclick = function () { signOut(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
      b.onclick = function () {
        message();
        var go = b.getAttribute('data-go');
        if (go === 'home') loadHome(); else if (go === 'accounts') openAccounts(); else if (go === 'academic') openAcademic();
      };
    });
    ROLES.forEach(function (r) {
      var o = document.createElement('option'); o.value = r; o.textContent = roleText(r); el('fRole').appendChild(o);
    });
    var t = null;
    el('fQuery').oninput = function () { clearTimeout(t); t = setTimeout(function () { loadList(1); }, 400); };
    el('fRole').onchange = function () { loadList(1); };
    el('fActive').onchange = function () { loadList(1); };
    el('btnMore').onclick = function () { busyButton(el('btnMore'), loadList(S.page + 1)); };

    el('btnNew').onclick = function () {
      message();
      el('cEmail').value = ''; el('cName').value = ''; el('cEmailErr').textContent = ''; el('cNameErr').textContent = '';
      show('vCreate');
      el('cEmail').focus();
    };
    el('btnCreate').onclick = function () {
      var input = { loginEmail: el('cEmail').value.trim() };
      if (el('cName').value.trim()) input.displayName = el('cName').value.trim();
      busyButton(el('btnCreate'), call('users.create', input)).then(function (res) {
        showFieldErrors(res, { 'input.loginEmail': 'cEmailErr', 'input.displayName': 'cNameErr' });
        if (!res.success) { message('bad', failText(res)); window.scrollTo(0, 0); return; }
        var w = warningsText(res);
        message('warn', 'تم إنشاء الحساب ' + esc(res.data.userId) + '. أضف له دوراً من الأسفل.' + (w ? '<br>' + w : ''));
        reloadCurrent(res.data.userId);
      });
    };

    el('btnSaveName').onclick = function () {
      var name = el('aName').value.trim();
      if (!name) { el('aNameErr').textContent = FIELD_AR.REQUIRED; return; }
      busyButton(el('btnSaveName'), call('users.update', { userId: S.current.UserID, displayName: name })).then(function (res) {
        showFieldErrors(res, { 'input.displayName': 'aNameErr' });
        if (res.success && !res.data.changed) { message('', 'لم يتغير شيء.'); return; }
        afterChange(res, 'تم حفظ الاسم.');
      });
    };
    el('btnGrant').onclick = function () {
      var role = el('aRoleSel').value;
      if (!role) return;
      busyButton(el('btnGrant'), call('users.grantRole', { userId: S.current.UserID, role: role })).then(function (res) {
        afterChange(res, 'تمت إضافة دور «' + roleText(role) + '».');
      });
    };
    el('btnActive').onclick = function () {
      var u = S.current, to = !u.IsActive;
      var go = function () {
        busyButton(el('btnActive'), call('users.update', { userId: u.UserID, isActive: to })).then(function (res) {
          afterChange(res, to ? 'تم تفعيل الحساب.' : 'تم إيقاف الحساب.');
        });
      };
      if (to) go(); else confirmSheet('إيقاف هذا الحساب؟ لن يتمكن صاحبه من الدخول، ويخرج من النظام في طلبه التالي. يمكن تفعيله لاحقاً.', go);
    };
    el('eAdd').onclick = function () { message(); openForm(null); };
    el('eSave').onclick = saveForm;
    el('eCancel').onclick = function () { el('eForm').hidden = true; };
    el('confirmYes').onclick = function () { var a = confirmAction; closeSheet(); if (a) a(); };
    el('confirmNo').onclick = closeSheet;
  }

  wire();
  startSignIn();
})();
