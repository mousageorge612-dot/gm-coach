/* GM Coach — coach dashboard */
(function () {
  'use strict';
  var G = window.GM, $ = G.$, $$ = G.$$, esc = G.esc;
  var S = new G.Session('gmc_coach');
  var APP_URL = 'https://coach.georgemousa.com';
  var PKG = { m1: 'شهري 49$', m3: '3 أشهر 99$', m6: '6 أشهر 149$', apex: 'برايفت APEX (6 أسابيع)', apex_duo: 'برايفت APEX ثنائي', free: 'مجاني' };
  var PKG_DAYS = { m1: 30, m3: 91, m6: 182, apex: 42, apex_duo: 42 };
  var MUSCLES = ['صدر', 'ظهر', 'أكتاف', 'باي', 'تراي', 'سواعد', 'أرجل', 'أرداف', 'بطن', 'ترابيس', 'سمانة', 'كارديو', 'جسم كامل'];
  var EX = null;            // all exercises [{...}]
  var dirty = false;

  function exById(id) { if (!EX) return null; for (var i = 0; i < EX.length; i++) if (EX[i].id === id) return EX[i]; return null; }
  function loadEx(force) {
    if (EX && !force) return Promise.resolve(EX);
    return S.rest('coach_exercises', 'select=*&order=muscle.asc,name_ar.asc').then(function (r) { EX = r || []; return EX; });
  }
  function thumb(e, g) { if (!e) return ''; var p = g === 'female' ? (e.image_female || e.image_male) : (e.image_male || e.image_female); return p ? '<img loading="lazy" src="' + esc(G.media(p)) + '" alt="">' : 'بدون صورة'; }

  /* ---------- auth ---------- */
  function renderLogin(msg) {
    $('#app').innerHTML = '<form class="login" id="lf"><img class="logo" src="../assets/img/logo.png" alt="GM"><h1 class="h1" style="text-align:center">لوحة التحكم</h1><div class="sub">GM COACH</div>' +
      '<label class="field"><span>اسم المستخدم</span><input class="input" name="u" dir="ltr" autocapitalize="none" autocomplete="username" required></label>' +
      '<label class="field"><span>كلمة المرور</span><input class="input" name="p" type="password" dir="ltr" autocomplete="current-password" required></label>' +
      '<button class="btn gold block">دخول</button>' + (msg ? '<p class="red" style="text-align:center">' + esc(msg) + '</p>' : '') + '</form>';
    $('#lf').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      S.login(f.u.value, f.p.value).then(checkCoach).catch(function (er) { G.toast(G.errText(er)); });
    };
  }
  function checkCoach() {
    return S.rest('coaches', 'select=user_id&user_id=eq.' + S.a.uid).then(function (r) {
      if (!r || !r.length) { S.clear(); renderLogin('هالحساب مو حساب مدرب'); return; }
      route();
    });
  }

  /* ---------- router ---------- */
  function route() {
    if (!S.a) return renderLogin();
    var h = location.hash.replace(/^#\/?/, '').split('/');
    var page = h[0] || 'clients';
    if (page === 'client' && h[1]) return clientPage(h[1], h[2] || 'training');
    if (page === 'ex') return exPage();
    if (page === 'tpl' && h[1]) return tplEdit(+h[1]);
    if (page === 'tpl') return tplPage();
    return clientsPage();
  }
  window.addEventListener('hashchange', function () {
    if (dirty && !confirm('في تعديلات ما انحفظت. بدك تطلع بدون حفظ؟')) { dirty = false; return; }
    dirty = false; route();
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  function shell(active, body) {
    $('#app').innerHTML = '<div class="wrap wide"><div class="top"><div class="brand"><img src="../assets/img/logo.png" alt="GM"><div><b>لوحة التحكم</b><small>GM COACH</small></div></div>' +
      '<button class="btn sm ghost" id="lo">خروج</button></div><nav class="nav">' +
      [['clients', 'المشتركين'], ['ex', 'مكتبة التمارين'], ['tpl', 'القوالب']].map(function (n) { return '<a href="#' + n[0] + '" class="' + (active === n[0] ? 'on' : '') + '">' + n[1] + '</a>'; }).join('') +
      '</nav><div id="main">' + body + '</div></div>';
    $('#lo').onclick = function () { S.clear(); renderLogin(); };
  }
  function loading(active) { shell(active, '<div class="spinner"></div>'); }
  function fail(e) { $('#main').innerHTML = '<div class="empty">' + esc(G.errText(e)) + '</div>'; }

  /* ---------- clients list ---------- */
  function score(c) {
    var s = 0, n = 0;
    if (c.train) { n++; s += c.train === 'no' ? 0 : 1; }
    if (c.food) { n++; s += (+c.food) / 100; }
    if (c.sleep) { n++; s += +c.sleep >= 7 ? 1 : +c.sleep >= 6 ? .5 : 0; }
    if (c.water) { n++; s += +c.water >= 2 ? 1 : .4; }
    return n ? Math.round(s / n * 100) : 0;
  }
  function clientsPage() {
    loading('clients');
    var since = G.addDays(G.today(), -13);
    Promise.all([S.rest('coach_clients', 'select=*&order=active.desc,name.asc'), S.rest('coach_checkins', 'select=client_id,day,data&day=gte.' + since)]).then(function (r) {
      var cl = r[0] || [], ck = {}, t = G.today();
      (r[1] || []).forEach(function (c) { (ck[c.client_id] = ck[c.client_id] || {})[c.day] = c.data || {}; });
      var act = cl.filter(function (c) { return c.active; }), soon = 0, quiet = 0, sum = 0;
      var rows = act.map(function (c) {
        var m = ck[c.user_id] || {}, days7 = 0, sc = 0, dots = '', lastDay = null;
        for (var i = 13; i >= 0; i--) {
          var d = G.addDays(t, -i), x = m[d];
          if (x) { lastDay = d; var s = score(x); if (i < 7) { days7++; sc += s; } dots += '<i class="' + (s >= 75 ? 'g' : s >= 50 ? 'y' : 'r') + '"></i>'; } else dots += '<i></i>';
        }
        var adh = Math.round(days7 / 7 * (days7 ? sc / days7 : 0)), left = c.end_date ? G.diffDays(t, c.end_date) : null;
        var gap = lastDay ? G.diffDays(lastDay, t) : 99, lvl = gap >= 3 ? 'alert' : gap >= 2 || (left !== null && left <= 5) ? 'warn' : '';
        if (left !== null && left <= 7) soon++; if (gap >= 2) quiet++; sum += adh;
        return { c: c, html: '<a class="cl ' + lvl + '" href="#client/' + c.user_id + '"><div><div class="nm">' + esc(c.name) + '</div><div class="sub">' + esc(PKG[c.package] || c.package || '') +
          (left !== null ? ' · ' + (left < 0 ? '<span class="red">منتهي</span>' : 'باقي ' + left + ' يوم') : '') + ' · ' + (lastDay ? 'آخر تشيك ' + (gap === 0 ? 'اليوم' : 'من ' + gap + ' يوم') : 'ما في تشيكات') + '</div><div class="dots">' + dots + '</div></div>' +
          '<div class="sc ' + (adh >= 75 ? 'green' : adh >= 50 ? 'gold' : 'red') + '">' + adh + '%<small>التزام 7 أيام</small></div></a>' };
      });
      var inactive = cl.filter(function (c) { return !c.active; });
      $('#main').innerHTML = '<div class="kpis"><div class="kpi"><b>' + act.length + '</b><span>مشترك فعّال</span></div><div class="kpi"><b>' + (act.length ? Math.round(sum / act.length) : 0) + '%</b><span>متوسط الالتزام</span></div>' +
        '<div class="kpi"><b class="gold">' + soon + '</b><span>بينتهي خلال 7 أيام</span></div><div class="kpi"><b class="red">' + quiet + '</b><span>غايب يومين أو أكتر</span></div></div>' +
        '<div class="row" style="margin-bottom:12px"><button class="btn gold" id="add" style="flex:none">+ مشترك جديد</button><span></span></div>' +
        '<div class="list">' + (rows.length ? rows.map(function (x) { return x.html; }).join('') : '<div class="empty">ما في مشتركين لسا. ضيف أول مشترك.</div>') + '</div>' +
        (inactive.length ? '<h3 class="muted" style="margin-top:20px">غير فعّالين</h3><div class="list">' + inactive.map(function (c) { return '<a class="cl" href="#client/' + c.user_id + '"><div class="nm muted">' + esc(c.name) + '</div></a>'; }).join('') + '</div>' : '');
      $('#add').onclick = function () { clientForm(null); };
    }).catch(fail);
  }

  function clientForm(c) {
    var isNew = !c; c = c || { gender: 'male', package: 'm3', start_date: G.today() };
    G.sheet('<div class="h2">' + (isNew ? 'مشترك جديد' : 'تعديل البيانات') + '</div><form id="cf">' +
      '<label class="field"><span>الاسم الكامل</span><input class="input" name="name" required value="' + esc(c.name || '') + '"></label>' +
      (isNew ? '<div class="grid2"><label class="field"><span>اسم المستخدم (إنكليزي)</span><input class="input" name="username" dir="ltr" autocapitalize="none" required pattern="[a-z0-9._-]{3,24}" placeholder="ryan"></label>' +
        '<label class="field"><span>كلمة المرور</span><input class="input" name="password" dir="ltr" required minlength="6" value="' + genPw() + '"></label></div>' : '') +
      '<div class="grid2"><label class="field"><span>الجنس</span><select class="input" name="gender"><option value="male">ذكر</option><option value="female">أنثى</option></select></label>' +
      '<label class="field"><span>الباقة</span><select class="input" name="package">' + Object.keys(PKG).map(function (k) { return '<option value="' + k + '">' + PKG[k] + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>البداية</span><input class="input" type="date" name="start_date" value="' + esc(c.start_date || '') + '"></label>' +
      '<label class="field"><span>الانتهاء</span><input class="input" type="date" name="end_date" value="' + esc(c.end_date || '') + '"></label></div>' +
      '<div class="grid2"><label class="field"><span>واتساب (مع رمز الدولة)</span><input class="input" name="phone" dir="ltr" inputmode="tel" placeholder="9639..." value="' + esc(c.phone || '') + '"></label>' +
      '<label class="field"><span>الهدف</span><input class="input" name="goal" value="' + esc(c.goal || '') + '"></label></div>' +
      (isNew ? '' : '<label class="field"><span><input type="checkbox" name="active"' + (c.active ? ' checked' : '') + '> فعّال</span></label>') +
      '<button class="btn gold block">' + (isNew ? 'إنشاء الحساب' : 'حفظ') + '</button></form>', function (b) {
      var f = $('#cf', b); f.gender.value = c.gender || 'male'; f.package.value = c.package || 'm3';
      function autoEnd() { var d = PKG_DAYS[f.package.value]; if (d && f.start_date.value) f.end_date.value = G.addDays(f.start_date.value, d); }
      if (isNew) { autoEnd(); f.package.onchange = autoEnd; f.start_date.onchange = autoEnd; }
      f.onsubmit = function (e) {
        e.preventDefault(); var btn = f.querySelector('button'); btn.disabled = true;
        var v = { name: f.name.value.trim(), gender: f.gender.value, package: f.package.value, start_date: f.start_date.value || null, end_date: f.end_date.value || null, phone: f.phone.value.replace(/\D/g, '') || null, goal: f.goal.value.trim() || null };
        var p;
        if (isNew) { v.action = 'create_client'; v.username = f.username.value.trim().toLowerCase(); v.password = f.password.value; p = S.fn('coach-admin', v).then(function (r) { creds(v, r.user_id, v.password, r.existed); }); }
        else { v.active = f.active.checked; p = S.rest('coach_clients', 'user_id=eq.' + c.user_id, { method: 'PATCH', body: v }).then(function () { G.closeSheet(); route(); }); }
        p.catch(function (er) { btn.disabled = false; G.toast(G.errText(er.body && er.body.error || er)); });
      };
    });
  }
  function genPw() { var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function creds(c, uid, pw, existed) {
    var msg = 'أهلاً ' + String(c.name).split(' ')[0] + ' 💪\nهاد تطبيق خطتك مع الكوتش جورج موسى:\n' + APP_URL + '\n\nاسم المستخدم: ' + c.username + '\nكلمة المرور: ' + pw +
      '\n\nضيفه عالشاشة الرئيسية: آيفون من Safari زر المشاركة ← «إضافة إلى الشاشة الرئيسية»، أندرويد من Chrome ⋮ ← «إضافة إلى الشاشة الرئيسية».';
    G.sheet('<div class="h2">الحساب جاهز ✓</div>' + (existed ? '<p class="gold" style="font-size:13px">اسم المستخدم كان موجود بتطبيق التتبع، ربطناه وتغيّرت كلمة المرور للجديدة.</p>' : '') +
      '<textarea class="input" rows="8" readonly id="cm">' + esc(msg) + '</textarea><div class="row" style="margin-top:10px">' +
      (c.phone ? '<a class="btn gold" target="_blank" rel="noopener" href="https://wa.me/' + esc(c.phone) + '?text=' + encodeURIComponent(msg) + '">بعت على واتساب</a>' : '') +
      '<button class="btn" id="cp">نسخ</button><a class="btn" href="#client/' + uid + '" id="go">افتح المشترك</a></div>', function (b) {
      $('#cp', b).onclick = function () { copy(msg); };
      $('#go', b).onclick = function () { G.closeSheet(); };
    });
  }
  function copy(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { G.toast('انتسخ ✓'); }, function () { G.toast('انسخ يدوياً'); }); }

  /* ---------- client page ---------- */
  function clientPage(uid, sub) {
    loading('clients');
    Promise.all([S.rest('coach_clients', 'select=*&user_id=eq.' + uid), loadEx()]).then(function (r) {
      var c = r[0] && r[0][0]; if (!c) return fail('المشترك مو موجود');
      var left = c.end_date ? G.diffDays(G.today(), c.end_date) : null;
      $('#main').innerHTML = '<div class="card"><div class="row" style="align-items:flex-start"><div><div class="h1">' + esc(c.name) + '</div><div class="muted" style="font-size:13px"><span dir="ltr">@' + esc(c.username) + '</span> · ' + (c.gender === 'female' ? 'أنثى' : 'ذكر') + ' · ' + esc(PKG[c.package] || c.package || '') +
        (c.end_date ? ' · ينتهي ' + esc(c.end_date) + ' (' + (left < 0 ? 'منتهي' : 'باقي ' + left + ' يوم') + ')' : '') + (c.goal ? ' · ' + esc(c.goal) : '') + '</div></div>' +
        '<div class="row" style="flex:none;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm" id="ed">تعديل</button><button class="btn sm" id="pw">كلمة مرور جديدة</button>' + (c.phone ? '<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(c.phone) + '">واتساب</a>' : '') + '</div></div></div>' +
        '<div class="sub-tabs">' + [['training', 'التدريب'], ['nutrition', 'التغذية'], ['progress', 'المتابعة'], ['notes', 'ملاحظاتي']].map(function (t) {
          return '<a class="chip' + (sub === t[0] ? ' on' : '') + '" style="text-decoration:none;color:inherit" href="#client/' + uid + '/' + t[0] + '">' + t[1] + '</a>';
        }).join('') + '</div><div id="sub"><div class="spinner"></div></div>';
      $('#ed').onclick = function () { clientForm(c); };
      $('#pw').onclick = function () {
        var pw = genPw();
        if (!confirm('تغيير كلمة مرور ' + c.name + ' إلى: ' + pw + ' ؟')) return;
        S.fn('coach-admin', { action: 'reset_password', user_id: uid, password: pw }).then(function () { creds(c, uid, pw); }).catch(function (e) { G.toast(G.errText(e)); });
      };
      if (sub === 'training' || sub === 'nutrition') loadProgram(uid, sub, c);
      else if (sub === 'progress') progressTab(c);
      else notesTab(c);
    }).catch(fail);
  }

  function loadProgram(uid, kind, c) {
    S.rest('coach_programs', 'select=*&kind=eq.' + kind + '&client_id=eq.' + uid).then(function (r) {
      var p = r && r[0];
      if (!p) {
        $('#sub').innerHTML = '<div class="card" style="text-align:center"><p class="muted">ما في ' + (kind === 'training' ? 'خطة تدريب' : 'خطة تغذية') + ' لهالمشترك لسا.</p><div class="row" style="justify-content:center"><button class="btn gold" style="flex:none" id="fromTpl">نسخ من قالب</button><button class="btn" style="flex:none" id="blank">ابدأ فاضية</button></div></div>';
        $('#blank').onclick = function () { editor({ client_id: uid, kind: kind, title: '', data: kind === 'training' ? { days: [] } : { meals: [] } }, c.gender, $('#sub')); };
        $('#fromTpl').onclick = function () { pickTemplate(kind, function (t) { editor({ client_id: uid, kind: kind, title: t.title, data: JSON.parse(JSON.stringify(t.data)) }, c.gender, $('#sub')); dirty = true; }); };
        return;
      }
      editor(p, c.gender, $('#sub'));
    }).catch(fail);
  }
  function pickTemplate(kind, cb) {
    S.rest('coach_programs', 'select=id,title,data&kind=eq.' + kind + '&client_id=is.null&order=title.asc').then(function (r) {
      if (!r || !r.length) return G.toast('ما في قوالب. اعمل قالب من صفحة «القوالب».');
      G.sheet('<div class="h2">اختار قالب</div><div class="pick">' + r.map(function (t, i) { return '<button data-i="' + i + '" style="grid-template-columns:1fr"><b>' + esc(t.title || 'بدون اسم') + '</b></button>'; }).join('') + '</div>', function (b) {
        $$('[data-i]', b).forEach(function (x) { x.onclick = function () { G.closeSheet(); cb(r[+x.getAttribute('data-i')]); }; });
      });
    });
  }

  /* ---------- program editor (training + nutrition, client or template) ---------- */
  function editor(p, gender, host) {
    var P = JSON.parse(JSON.stringify(p));
    var isT = P.kind === 'training';
    function save() {
      var btn = $('#sv'); btn.disabled = true;
      var body = { kind: P.kind, title: P.title || '', data: P.data, client_id: P.client_id || null };
      var q = P.id ? S.rest('coach_programs', 'id=eq.' + P.id, { method: 'PATCH', body: body, headers: { Prefer: 'return=representation' } }) : S.rest('coach_programs', '', { method: 'POST', body: body, headers: { Prefer: 'return=representation' } });
      q.then(function (r) { var x = r && r[0]; if (x) { P.id = x.id; P.version = x.version; } dirty = false; btn.disabled = false; G.toast('انحفظت ✓ (نسخة ' + (P.version || 1) + ') ووصلت للمشترك'); draw(); })
        .catch(function (e) { btn.disabled = false; G.toast(G.errText(e)); });
    }
    function draw() {
      var h = '<label class="field"><span>' + (P.client_id ? 'عنوان الخطة' : 'اسم القالب') + '</span><input class="input" data-k="title" value="' + esc(P.title || '') + '"></label>';
      h += isT ? trainingHtml(P.data, gender) : nutritionHtml(P.data);
      h += '<div class="savebar"><button class="btn gold" id="sv">حفظ' + (P.version ? ' (حالياً نسخة ' + P.version + ')' : '') + '</button>' + (P.id ? '<button class="btn" id="hist" style="flex:none">النسخ السابقة</button>' : '') + '</div>';
      host.innerHTML = h;
      bindEditor();
    }
    function bindEditor() {
      $$('[data-k]', host).forEach(function (inp) {
        inp.oninput = function () {
          var path = inp.getAttribute('data-k').split('.'), o = path[0] === 'title' ? P : P.data, last = path.pop();
          if (path[0] === 'title') { P.title = inp.value; dirty = true; return; }
          path.forEach(function (k) { o = o[k]; }); o[last] = inp.value; dirty = true;
        };
      });
      $$('[data-act]', host).forEach(function (b) { b.onclick = function () { act(b.getAttribute('data-act'), b); }; });
      $('#sv').onclick = save;
      var hb = $('#hist'); if (hb) hb.onclick = function () { history(P, function (data) { P.data = data; dirty = true; draw(); }); };
    }
    function act(a, b) {
      var d = +b.getAttribute('data-d'), i = +b.getAttribute('data-i'), D = P.data;
      dirty = true;
      if (a === 'add-day') { D.days = D.days || []; D.days.push({ title: 'اليوم ' + (D.days.length + 1), title_en: '', weekdays: [], items: [] }); }
      else if (a === 'day-up' && d > 0) swap(D.days, d, d - 1);
      else if (a === 'day-down' && d < D.days.length - 1) swap(D.days, d, d + 1);
      else if (a === 'day-copy') D.days.splice(d + 1, 0, JSON.parse(JSON.stringify(D.days[d])));
      else if (a === 'day-del') { if (!confirm('حذف «' + (D.days[d].title || 'اليوم') + '»؟')) return; D.days.splice(d, 1); }
      else if (a === 'wd') { var w = +b.getAttribute('data-w'), arr = D.days[d].weekdays = D.days[d].weekdays || [], k = arr.indexOf(w); if (k >= 0) arr.splice(k, 1); else arr.push(w); arr.sort(); }
      else if (a === 'add-ex') return pickExercise(gender, function (e) { D.days[d].items.push({ ex: e.id, sets: '3', reps: '10-12', rest: '90 ث', note: '' }); dirty = true; draw(); });
      else if (a === 'swap-ex') return pickExercise(gender, function (e) { D.days[d].items[i].ex = e.id; dirty = true; draw(); });
      else if (a === 'it-up' && i > 0) swap(D.days[d].items, i, i - 1);
      else if (a === 'it-down' && i < D.days[d].items.length - 1) swap(D.days[d].items, i, i + 1);
      else if (a === 'it-del') D.days[d].items.splice(i, 1);
      else if (a === 'add-meal') { D.meals = D.meals || []; D.meals.push({ time: '', title: 'وجبة ' + (D.meals.length + 1), kcal: '', items: '', alts: '' }); }
      else if (a === 'meal-up' && i > 0) swap(D.meals, i, i - 1);
      else if (a === 'meal-down' && i < D.meals.length - 1) swap(D.meals, i, i + 1);
      else if (a === 'meal-copy') D.meals.splice(i + 1, 0, JSON.parse(JSON.stringify(D.meals[i])));
      else if (a === 'meal-del') { if (!confirm('حذف الوجبة؟')) return; D.meals.splice(i, 1); }
      draw();
    }
    draw();
  }
  function swap(a, i, j) { var t = a[i]; a[i] = a[j]; a[j] = t; }
  function trainingHtml(D, gender) {
    D.days = D.days || [];
    var h = '';
    D.days.forEach(function (day, d) {
      day.items = day.items || [];
      h += '<div class="day"><div class="row" style="margin-bottom:8px"><b class="gold" style="flex:none">اليوم ' + (d + 1) + '</b><span></span>' +
        '<div class="row" style="flex:none;gap:4px"><button class="btn sm" data-act="day-up" data-d="' + d + '">↑</button><button class="btn sm" data-act="day-down" data-d="' + d + '">↓</button><button class="btn sm" data-act="day-copy" data-d="' + d + '">نسخ</button><button class="btn sm danger" data-act="day-del" data-d="' + d + '">حذف</button></div></div>' +
        '<div class="dh"><input class="input" placeholder="العنوان بالعربي: صدر + باي" data-k="days.' + d + '.title" value="' + esc(day.title || '') + '"><input class="input" dir="ltr" placeholder="CHEST & BICEPS" data-k="days.' + d + '.title_en" value="' + esc(day.title_en || '') + '"></div>' +
        '<div class="wds">' + [1, 2, 3, 4, 5, 6, 0].map(function (w) { return '<button data-act="wd" data-d="' + d + '" data-w="' + w + '" class="' + ((day.weekdays || []).indexOf(w) >= 0 ? 'on' : '') + '">' + G.WD[w] + '</button>'; }).join('') + '</div>';
      day.items.forEach(function (it, i) {
        var e = exById(it.ex);
        h += '<div class="it"><button class="th" data-act="swap-ex" data-d="' + d + '" data-i="' + i + '" title="تغيير التمرين">' + thumb(e, gender) + '</button><div><b style="font-size:14px">' + (i + 1) + '. ' + esc(e ? e.name_ar : 'تمرين محذوف') + '</b>' + (e && e.name_en ? '<div class="gold" style="font-size:10.5px;direction:ltr;text-align:right">' + esc(e.name_en) + '</div>' : '') +
          '<div class="f4"><label><span class="muted" style="font-size:11px">جولات</span><input class="input" placeholder="جولات" data-k="days.' + d + '.items.' + i + '.sets" value="' + esc(it.sets || '') + '"></label><label><span class="muted" style="font-size:11px">عدّات</span><input class="input" placeholder="عدّات" data-k="days.' + d + '.items.' + i + '.reps" value="' + esc(it.reps || '') + '"></label><label><span class="muted" style="font-size:11px">راحة</span><input class="input" placeholder="راحة" data-k="days.' + d + '.items.' + i + '.rest" value="' + esc(it.rest || '') + '"></label></div>' +
          '<input class="input" style="margin-top:6px" placeholder="ملاحظة للمشترك (اختياري)" data-k="days.' + d + '.items.' + i + '.note" value="' + esc(it.note || '') + '"></div>' +
          '<div class="ctl"><button data-act="it-up" data-d="' + d + '" data-i="' + i + '">↑</button><button data-act="it-down" data-d="' + d + '" data-i="' + i + '">↓</button><button data-act="it-del" data-d="' + d + '" data-i="' + i + '" class="red">✕</button></div></div>';
      });
      h += '<button class="btn sm gold" data-act="add-ex" data-d="' + d + '">+ تمرين</button>' +
        '<div class="grid2" style="margin-top:8px"><input class="input" placeholder="كارديو (مثلاً: مشي سريع 20 دقيقة)" data-k="days.' + d + '.cardio" value="' + esc(day.cardio || '') + '"><input class="input" placeholder="ملاحظة لليوم" data-k="days.' + d + '.notes" value="' + esc(day.notes || '') + '"></div></div>';
    });
    h += '<button class="btn block" data-act="add-day">+ يوم تمرين</button>' +
      '<label class="field" style="margin-top:12px"><span>ملاحظات عامة للخطة</span><textarea class="input" data-k="notes">' + esc(D.notes || '') + '</textarea></label>';
    return h;
  }
  function nutritionHtml(D) {
    D.meals = D.meals || [];
    var h = '<div class="card"><div class="grid2" style="grid-template-columns:repeat(5,1fr)">' + [['kcal', 'سعرات'], ['p', 'بروتين غ'], ['c', 'كارب غ'], ['f', 'دهون غ'], ['water', 'المي']].map(function (x) {
      return '<label class="field"><span>' + x[1] + '</span><input class="input" data-k="' + x[0] + '" value="' + esc(D[x[0]] || '') + '"></label>';
    }).join('') + '</div></div>';
    D.meals.forEach(function (m, i) {
      h += '<div class="meal-ed"><div class="row" style="margin-bottom:6px"><input class="input" style="flex:0 0 90px" dir="ltr" placeholder="9:00" data-k="meals.' + i + '.time" value="' + esc(m.time || '') + '">' +
        '<input class="input" placeholder="اسم الوجبة" data-k="meals.' + i + '.title" value="' + esc(m.title || '') + '"><input class="input" style="flex:0 0 90px" placeholder="سعرات" data-k="meals.' + i + '.kcal" value="' + esc(m.kcal || '') + '">' +
        '<div class="row" style="flex:none;gap:4px"><button class="btn sm" data-act="meal-up" data-i="' + i + '">↑</button><button class="btn sm" data-act="meal-down" data-i="' + i + '">↓</button><button class="btn sm" data-act="meal-copy" data-i="' + i + '">نسخ</button><button class="btn sm danger" data-act="meal-del" data-i="' + i + '">✕</button></div></div>' +
        '<div class="grid2"><textarea class="input" placeholder="المكونات (كل سطر عنصر)" data-k="meals.' + i + '.items">' + esc(m.items || '') + '</textarea><textarea class="input" placeholder="البدائل" data-k="meals.' + i + '.alts">' + esc(m.alts || '') + '</textarea></div></div>';
    });
    h += '<button class="btn block" data-act="add-meal">+ وجبة</button><label class="field" style="margin-top:12px"><span>قواعد وملاحظات</span><textarea class="input" rows="5" data-k="rules">' + esc(D.rules || '') + '</textarea></label>';
    return h;
  }
  function history(P, restore) {
    S.rest('coach_program_history', 'select=id,version,saved_at,data&program_id=eq.' + P.id + '&order=version.desc&limit=30').then(function (r) {
      G.sheet('<div class="h2">النسخ السابقة</div>' + (r && r.length ? '<div class="pick">' + r.map(function (x, i) { return '<button data-i="' + i + '" style="grid-template-columns:1fr"><b>نسخة ' + x.version + '</b><span class="muted" style="font-size:12px">' + esc(String(x.saved_at).replace('T', ' ').slice(0, 16)) + '</span></button>'; }).join('') + '</div><p class="muted" style="font-size:12.5px">الاختيار بيرجّع النسخة للمحرر، وما بتوصل للمشترك إلا لما تضغط حفظ.</p>' : '<p class="muted">ما في نسخ سابقة.</p>'), function (b) {
        $$('[data-i]', b).forEach(function (x) { x.onclick = function () { G.closeSheet(); restore(r[+x.getAttribute('data-i')].data); }; });
      });
    });
  }

  /* ---------- exercise picker ---------- */
  function pickExercise(gender, cb) {
    loadEx().then(function () {
      G.sheet('<div class="h2">اختار تمرين</div><div class="row"><input class="input" id="q" placeholder="ابحث بالعربي أو الإنكليزي"><select class="input" id="mf" style="flex:0 0 120px"><option value="">كل العضلات</option>' + MUSCLES.map(function (m) { return '<option>' + m + '</option>'; }).join('') + '</select></div>' +
        '<div class="pick" id="pl"></div><button class="btn block" style="margin-top:10px" id="nw">+ تمرين جديد بالمكتبة</button>', function (b) {
        function list() {
          var q = $('#q', b).value.trim().toLowerCase(), m = $('#mf', b).value;
          var r = EX.filter(function (e) { return (!m || e.muscle === m) && (!q || (e.name_ar + ' ' + (e.name_en || '')).toLowerCase().indexOf(q) >= 0); }).slice(0, 80);
          $('#pl', b).innerHTML = r.length ? r.map(function (e) { return '<button data-id="' + e.id + '"><span class="th">' + thumb(e, gender) + '</span><span><b>' + esc(e.name_ar) + '</b><br><small class="gold" dir="ltr">' + esc(e.name_en || '') + '</small> <small class="muted">' + esc(e.muscle || '') + '</small></span></button>'; }).join('') : '<p class="muted">ما في نتائج.</p>';
          $$('[data-id]', b).forEach(function (x) { x.onclick = function () { G.closeSheet(); cb(exById(+x.getAttribute('data-id'))); }; });
        }
        $('#q', b).oninput = list; $('#mf', b).onchange = list; list(); $('#q', b).focus();
        $('#nw', b).onclick = function () { exForm({ name_ar: $('#q', b).value, muscle: $('#mf', b).value }, function (e) { cb(e); }); };
      });
    });
  }

  /* ---------- exercise library ---------- */
  var exFilter = { q: '', m: '', miss: '' };
  function exPage() {
    loading('ex');
    loadEx(true).then(function () {
      var noImg = EX.filter(function (e) { return !e.image_male || !e.image_female; }).length, noVid = EX.filter(function (e) { return !e.video_male || !e.video_female; }).length;
      $('#main').innerHTML = '<div class="row wrapx" style="margin-bottom:12px"><button class="btn gold" style="flex:none" id="nw">+ تمرين جديد</button><input class="input" id="q" placeholder="ابحث" value="' + esc(exFilter.q) + '">' +
        '<select class="input" id="mf" style="flex:0 0 130px"><option value="">كل العضلات</option>' + MUSCLES.map(function (m) { return '<option' + (exFilter.m === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
        '<select class="input" id="ms" style="flex:0 0 170px"><option value="">الكل (' + EX.length + ')</option><option value="img"' + (exFilter.miss === 'img' ? ' selected' : '') + '>ناقص صورة (' + noImg + ')</option><option value="vid"' + (exFilter.miss === 'vid' ? ' selected' : '') + '>ناقص فيديو (' + noVid + ')</option></select></div>' +
        '<p class="muted" style="font-size:12.5px;margin-top:0">كل تمرين إله صورة وفيديو للرجال، وصورة وفيديو للسيدات. المشترك بيشوف نسخة جنسه، وإذا ناقصة بيشوف التانية.</p><div class="exl" id="exl"></div>';
      function list() {
        exFilter.q = $('#q').value.trim().toLowerCase(); exFilter.m = $('#mf').value; exFilter.miss = $('#ms').value;
        var r = EX.filter(function (e) {
          if (exFilter.m && e.muscle !== exFilter.m) return false;
          if (exFilter.miss === 'img' && e.image_male && e.image_female) return false;
          if (exFilter.miss === 'vid' && e.video_male && e.video_female) return false;
          return !exFilter.q || (e.name_ar + ' ' + (e.name_en || '')).toLowerCase().indexOf(exFilter.q) >= 0;
        });
        $('#exl').innerHTML = r.length ? r.map(function (e) {
          return '<div class="exc" data-id="' + e.id + '"><div class="pp"><div>' + (e.image_male ? '<img loading="lazy" src="' + esc(G.media(e.image_male)) + '">' : 'رجال') + '</div><div>' + (e.image_female ? '<img loading="lazy" src="' + esc(G.media(e.image_female)) + '">' : 'سيدات') + '</div></div>' +
            '<div class="b"><b>' + esc(e.name_ar) + '</b><small>' + esc(e.name_en || '') + '</small><div class="flags">' + (e.muscle ? '<span class="pill">' + esc(e.muscle) + '</span>' : '') +
            '<span class="pill ' + (e.video_male ? 'g' : 'r') + '">فيديو ♂</span><span class="pill ' + (e.video_female ? 'g' : 'r') + '">فيديو ♀</span></div></div></div>';
        }).join('') : '<div class="empty">ما في تمارين' + (EX.length ? ' بهالفلتر' : ' لسا. ضيف أول تمرين.') + '</div>';
        $$('.exc').forEach(function (x) { x.onclick = function () { exForm(exById(+x.getAttribute('data-id')), function () { list(); }); }; });
      }
      $('#q').oninput = list; $('#mf').onchange = list; $('#ms').onchange = list; list();
      $('#nw').onclick = function () { exForm({}, function () { list(); }); };
    }).catch(fail);
  }
  function exForm(e, done) {
    var isNew = !e.id, img = { image_male: e.image_male || '', image_female: e.image_female || '' };
    G.sheet('<div class="h2">' + (isNew ? 'تمرين جديد' : 'تعديل التمرين') + '</div><form id="xf">' +
      '<div class="grid2"><label class="field"><span>الاسم بالعربي</span><input class="input" name="name_ar" required value="' + esc(e.name_ar || '') + '"></label>' +
      '<label class="field"><span>الاسم بالإنكليزي</span><input class="input" name="name_en" dir="ltr" value="' + esc(e.name_en || '') + '"></label></div>' +
      '<div class="grid2"><label class="field"><span>العضلة</span><select class="input" name="muscle"><option value="">—</option>' + MUSCLES.map(function (m) { return '<option' + (e.muscle === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>الأداة</span><input class="input" name="equipment" placeholder="دمبل، بار، جهاز، كيبل…" value="' + esc(e.equipment || '') + '"></label></div>' +
      '<div class="upl">' + [['male', 'رجال'], ['female', 'سيدات']].map(function (g) {
        return '<div class="box"><b>' + g[1] + '</b><div class="pv" id="pv-' + g[0] + '">' + (img['image_' + g[0]] ? '<img src="' + esc(G.media(img['image_' + g[0]])) + '">' : 'بدون صورة') + '</div>' +
          '<label class="btn sm block">رفع صورة من الجهاز<input type="file" accept="image/*" data-up="' + g[0] + '" hidden></label>' +
          '<input class="input" style="margin-top:6px" dir="ltr" name="video_' + g[0] + '" placeholder="رابط فيديو الشرح (يوتيوب)" value="' + esc(e['video_' + g[0]] || '') + '"></div>';
      }).join('') + '</div>' +
      '<label class="field" style="margin-top:10px"><span>نصائح الأداء (بتظهر تحت التمرين، اختياري)</span><textarea class="input" name="tips" rows="2">' + esc(e.tips || '') + '</textarea></label>' +
      '<div class="row"><button class="btn gold">حفظ</button>' + (isNew ? '' : '<button type="button" class="btn danger" style="flex:none" id="xd">حذف</button>') + '</div></form>', function (b) {
      var f = $('#xf', b), pending = {};
      $$('[data-up]', b).forEach(function (inp) {
        inp.onchange = function () {
          var g = inp.getAttribute('data-up'), file = inp.files[0]; if (!file) return;
          $('#pv-' + g, b).innerHTML = '<div class="spinner" style="margin:0"></div>';
          G.shrink(file, 1200).then(function (blob) { pending[g] = blob; $('#pv-' + g, b).innerHTML = '<img src="' + URL.createObjectURL(blob) + '">'; })
            .catch(function () { $('#pv-' + g, b).textContent = 'ما قدرت إقرا الصورة'; });
        };
      });
      f.onsubmit = function (ev) {
        ev.preventDefault(); var btn = f.querySelector('button.gold'); btn.disabled = true; btn.textContent = 'عم يحفظ…';
        var row = { name_ar: f.name_ar.value.trim(), name_en: f.name_en.value.trim() || null, muscle: f.muscle.value || null, equipment: f.equipment.value.trim() || null,
          video_male: f.video_male.value.trim() || null, video_female: f.video_female.value.trim() || null, tips: f.tips.value.trim() || null, updated_at: new Date().toISOString() };
        var first = isNew ? S.rest('coach_exercises', '', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }).then(function (r) { return r[0]; }) : Promise.resolve(e);
        first.then(function (saved) {
          var ups = Object.keys(pending).map(function (g) {
            return S.upload('ex/' + saved.id + '-' + g + '-' + Date.now() + '.webp', pending[g]).then(function (path) { row['image_' + g] = path; });
          });
          return Promise.all(ups).then(function () { return S.rest('coach_exercises', 'id=eq.' + saved.id, { method: 'PATCH', body: row, headers: { Prefer: 'return=representation' } }); });
        }).then(function (r) {
          var x = r[0]; if (EX) { var k = EX.findIndex(function (y) { return y.id === x.id; }); if (k >= 0) EX[k] = x; else EX.push(x); }
          G.closeSheet(); G.toast('انحفظ ✓ والتعديل وصل لكل المشتركين'); if (done) done(x);
        }).catch(function (er) { btn.disabled = false; btn.textContent = 'حفظ'; G.toast(G.errText(er)); });
      };
      var xd = $('#xd', b); if (xd) xd.onclick = function () {
        if (!confirm('حذف «' + e.name_ar + '» من المكتبة؟ رح ينشال من كل الخطط اللي فيها.')) return;
        S.rest('coach_exercises', 'id=eq.' + e.id, { method: 'DELETE' }).then(function () { EX = EX.filter(function (y) { return y.id !== e.id; }); G.closeSheet(); if (done) done(); });
      };
    });
  }

  /* ---------- templates ---------- */
  function tplPage() {
    loading('tpl');
    S.rest('coach_programs', 'select=id,kind,title,updated_at&client_id=is.null&order=kind.asc,title.asc').then(function (r) {
      r = r || [];
      function block(kind, label) {
        var x = r.filter(function (t) { return t.kind === kind; });
        return '<h3>' + label + '</h3><div class="list">' + (x.length ? x.map(function (t) { return '<a class="cl" href="#tpl/' + t.id + '"><div class="nm">' + esc(t.title || 'بدون اسم') + '</div><span class="muted" style="font-size:12px">' + esc(String(t.updated_at).slice(0, 10)) + '</span></a>'; }).join('') : '<div class="muted">ما في قوالب.</div>') + '</div>';
      }
      $('#main').innerHTML = '<p class="muted" style="margin-top:0">القالب خطة جاهزة (مثل Pro Split 4) بتنسخها لأي مشترك جديد وبتعدّل الفروقات بس.</p><div class="row" style="margin-bottom:6px"><button class="btn gold" style="flex:none" id="nt">+ قالب تدريب</button><button class="btn" style="flex:none" id="nn">+ قالب تغذية</button><span></span></div>' +
        block('training', 'قوالب التدريب') + block('nutrition', 'قوالب التغذية');
      $('#nt').onclick = function () { newTpl('training'); }; $('#nn').onclick = function () { newTpl('nutrition'); };
    }).catch(fail);
  }
  function newTpl(kind) {
    var title = prompt('اسم القالب'); if (!title) return;
    S.rest('coach_programs', '', { method: 'POST', body: { kind: kind, title: title, data: kind === 'training' ? { days: [] } : { meals: [] } }, headers: { Prefer: 'return=representation' } })
      .then(function (r) { location.hash = '#tpl/' + r[0].id; }).catch(function (e) { G.toast(G.errText(e)); });
  }
  function tplEdit(id) {
    loading('tpl');
    Promise.all([S.rest('coach_programs', 'select=*&id=eq.' + id), loadEx()]).then(function (r) {
      var p = r[0] && r[0][0]; if (!p) return fail('القالب مو موجود');
      $('#main').innerHTML = '<div class="row" style="margin-bottom:10px"><a class="btn sm" style="flex:none" href="#tpl">← القوالب</a><span></span><button class="btn sm danger" style="flex:none" id="dl">حذف القالب</button></div>' +
        (p.kind === 'training' ? '<div class="row" style="margin-bottom:10px"><span class="muted" style="font-size:13px">معاينة الصور:</span><button class="btn sm" id="gm" style="flex:none">رجال</button><button class="btn sm" id="gf" style="flex:none">سيدات</button></div>' : '') + '<div id="ed"></div>';
      editor(p, 'male', $('#ed'));
      if (p.kind === 'training') { $('#gm').onclick = function () { editor(p, 'male', $('#ed')); }; $('#gf').onclick = function () { editor(p, 'female', $('#ed')); }; }
      $('#dl').onclick = function () { if (confirm('حذف القالب؟ خطط المشتركين المنسوخة منه ما بتتأثر.')) S.rest('coach_programs', 'id=eq.' + id, { method: 'DELETE' }).then(function () { location.hash = '#tpl'; }); };
    }).catch(fail);
  }

  /* ---------- progress ---------- */
  var LBL = { train: { yes: '✓', rest: 'راحة', no: '✗' }, cardio: { yes: '✓', no: '✗' }, energy: { high: 'عالية', mid: 'متوسطة', low: 'منخفضة' } };
  function progressTab(c) {
    var since = G.addDays(G.today(), -45);
    Promise.all([S.rest('coach_checkins', 'select=day,data&client_id=eq.' + c.user_id + '&day=gte.' + since + '&order=day.desc'),
      S.rest('coach_logs', 'select=day,exercise_id,sets&client_id=eq.' + c.user_id + '&order=day.desc&limit=300')]).then(function (r) {
      var ck = r[0] || [], logs = r[1] || [];
      var ws = ck.filter(function (x) { return parseFloat(x.data.weight); }).map(function (x) { return [x.day, parseFloat(x.data.weight)]; }).reverse();
      var h = '<div class="card"><b>الوزن</b>' + (ws.length ? ' <span class="muted">' + ws[0][1] + ' ← ' + ws[ws.length - 1][1] + ' كغ</span>' + spark(ws) : '<p class="muted">ما سجّل وزن لسا.</p>') + '</div>';
      h += '<div class="card" style="overflow-x:auto"><b>التشيكات اليومية</b>' + (ck.length ? '<table class="t"><tr><th>اليوم</th><th>تمرين</th><th>كارديو</th><th>أكل</th><th>نوم</th><th>مي</th><th>طاقة</th><th>وزن</th><th>ملاحظة</th></tr>' + ck.map(function (x) {
        var d = x.data || {};
        return '<tr><td dir="ltr">' + esc(x.day.slice(5)) + '</td><td>' + esc((LBL.train[d.train] || '-')) + '</td><td>' + esc(LBL.cardio[d.cardio] || '-') + '</td><td>' + esc(d.food ? d.food + '%' : '-') + '</td><td>' + esc(d.sleep || '-') + '</td><td>' + esc(d.water || '-') + '</td><td>' + esc(LBL.energy[d.energy] || '-') + '</td><td>' + esc(d.weight || '-') + '</td><td style="text-align:right">' + esc(d.note || '') + '</td></tr>';
      }).join('') + '</table>' : '<p class="muted">ما في تشيكات لسا.</p>') + '</div>';
      var by = {}; logs.forEach(function (l) { (by[l.exercise_id] = by[l.exercise_id] || []).push(l); });
      var ids = Object.keys(by);
      h += '<div class="card"><b>الأوزان بالتمارين</b>' + (ids.length ? ids.map(function (id) {
        var e = exById(+id), a = by[id].slice(0, 6);
        return '<div style="margin-top:10px"><b style="font-size:14px">' + esc(e ? e.name_ar : '#' + id) + '</b>' + a.map(function (l) { return '<div class="muted" style="font-size:12.5px"><span dir="ltr">' + esc(l.day.slice(5)) + '</span>: ' + (l.sets || []).filter(Boolean).map(function (s) { return (s.w || '-') + '×' + (s.r || '-'); }).join(' · ') + '</div>'; }).join('') + '</div>';
      }).join('') : '<p class="muted">ما سجّل أوزان لسا.</p>') + '</div>';
      $('#sub').innerHTML = h;
    }).catch(fail);
  }
  function spark(ws) {
    if (ws.length < 2) return '';
    var W = 600, H = 120, vals = ws.map(function (x) { return x[1]; }), min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { max += 1; min -= 1; }
    var pts = ws.map(function (x, i) { return [12 + i * (W - 24) / (ws.length - 1), 12 + (max - x[1]) * (H - 24) / (max - min)]; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:120px;margin-top:8px;direction:ltr"><polyline fill="none" stroke="#ffb800" stroke-width="2.5" points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>' + pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="#ffb800"/>'; }).join('') + '</svg>';
  }
  function notesTab(c) {
    S.rest('coach_private_notes', 'select=note&client_id=eq.' + c.user_id).then(function (r) {
      $('#sub').innerHTML = '<div class="card"><p class="muted" style="margin-top:0;font-size:13px">ملاحظات خاصة إلك بس (إصابات، أدوية، أكلات ما بيحبها…). المشترك ما بيشوفها.</p><textarea class="input" id="nt" rows="10">' + esc(r && r[0] ? r[0].note : '') + '</textarea><button class="btn gold block" style="margin-top:10px" id="ns">حفظ</button></div>';
      $('#ns').onclick = function () { S.upsert('coach_private_notes', { client_id: c.user_id, note: $('#nt').value, updated_at: new Date().toISOString() }, 'client_id').then(function () { G.toast('انحفظ ✓'); }).catch(function (e) { G.toast(G.errText(e)); }); };
    }).catch(fail);
  }

  if (S.a) checkCoach().catch(function () { renderLogin(); }); else renderLogin();
})();
