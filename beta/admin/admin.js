/* GM Coach BETA dashboard (read only). Shows what only the beta app records:
   off-plan meals, weekly check-ins, postponed workouts, exercise swaps, personal records, and who uses the beta.
   Uses the same coach login as /admin (session key gmc_coach), so one sign-in covers both. */
(function () {
  'use strict';
  var G = window.GM, $ = G.$, $$ = G.$$, esc = G.esc;
  var S = new G.Session('gmc_coach');
  var DAYS = 30, D = null, filter = 'all', who = '';
  var WQ = { hunger: ['الجوع', { low: 'قليل', ok: 'طبيعي', high: 'كتير' }], energy: ['الطاقة', { high: 'عالية', mid: 'متوسطة', low: 'منخفضة' }],
    sleep: ['النوم', { good: 'منيح', ok: 'مقبول', bad: 'سيء' }], stress: ['الضغط', { low: 'قليل', mid: 'متوسط', high: 'عالي' }] };

  function renderLogin(msg) {
    $('#app').innerHTML = '<form class="login" id="lf"><img class="logo" src="../../assets/img/logo.png" alt="GM"><h1 class="h1" style="text-align:center">لوحة التجريبي</h1><div class="sub">GM COACH BETA</div>' +
      '<label class="field"><span>اسم المستخدم</span><input class="input" name="u" dir="ltr" autocapitalize="none" autocomplete="username" required></label>' +
      '<label class="field"><span>كلمة المرور</span><input class="input" name="p" type="password" dir="ltr" autocomplete="current-password" required></label>' +
      '<button class="btn gold block">دخول</button>' + (msg ? '<p class="red" style="text-align:center">' + esc(msg) + '</p>' : '') + '</form>';
    $('#lf').onsubmit = function (e) { e.preventDefault(); var f = e.target; S.login(f.u.value, f.p.value).then(checkCoach).catch(function (er) { G.toast(G.errText(er)); }); };
  }
  function checkCoach() {
    return S.rest('coaches', 'select=user_id&user_id=eq.' + S.a.uid).then(function (r) {
      if (!r || !r.length) { S.clear(); renderLogin('هالحساب مو حساب مدرب'); return; }
      load();
    }).catch(function () { renderLogin(); });
  }

  function load() {
    $('#app').innerHTML = '<div class="spinner"></div>';
    var from = G.addDays(G.today(), -DAYS);
    Promise.all([
      S.rest('coach_clients', 'select=user_id,username,name,gender,package,end_date,active,is_free&order=name.asc'),
      S.rest('coach_checkins', 'select=client_id,day,data&day=gte.' + from + '&order=day.desc'),
      S.rest('coach_beta_users', 'select=client_id,last_seen,native&order=last_seen.desc'),
      S.rest('coach_food_ai', 'select=client_id,created_at,has_photo&created_at=gte.' + from + 'T00:00:00Z&order=created_at.desc').catch(function () { return []; }),
      S.rest('coach_push_sent', 'select=client_id,kind,status,created_at&kind=like.beta*&created_at=gte.' + from + 'T00:00:00Z&order=created_at.desc&limit=200').catch(function () { return []; })
    ]).then(function (r) {
      D = { clients: {}, list: r[0] || [], checkins: r[1] || [], beta: r[2] || [], ai: r[3] || [], push: r[4] || [], ex: {} };
      D.list.forEach(function (c) { D.clients[c.user_id] = c; });
      var ids = [];
      D.checkins.forEach(function (c) { var d = c.data || {}; (d.prs || []).forEach(function (x) { if (ids.indexOf(+x) < 0) ids.push(+x); });
        Object.keys(d.swaps || {}).forEach(function (k) { var v = +d.swaps[k]; if (v && ids.indexOf(v) < 0) ids.push(v); }); });
      return ids.length ? S.rest('coach_exercises', 'select=id,name_ar&id=in.(' + ids.join(',') + ')') : [];
    }).then(function (ex) { (ex || []).forEach(function (e) { D.ex[e.id] = e.name_ar; }); render(); })
      .catch(function (e) { $('#app').innerHTML = '<div class="wrap"><div class="card">ما قدرت حمّل البيانات: ' + esc(G.errText(e)) + ' <button class="btn sm" id="rt">جرّب كمان</button></div></div>'; $('#rt').onclick = load; });
  }

  function name(id) { var c = D.clients[id]; return c ? c.name : 'مشترك'; }
  function events() {
    var ev = [];
    D.checkins.forEach(function (row) {
      var d = row.data || {}, base = { client: row.client_id, day: row.day };
      (d.offplan || []).forEach(function (o) {
        ev.push(Object.assign({ type: 'off', at: o.at || row.day, what: esc(o.desc || 'أكل برّا النظام') + ' • <b>' + Math.round(o.min || 0) + '–' + Math.round(o.max || 0) + '</b> سعرة',
          det: (o.p || o.c || o.f ? 'بروتين ' + Math.round(o.p || 0) + 'غ · كارب ' + Math.round(o.c || 0) + 'غ · دهون ' + Math.round(o.f || 0) + 'غ' : '') + (o.src === 'ai' ? ' · تقدير بالذكاء الاصطناعي' : o.src ? ' · من القائمة' : '') }, base));
      });
      if (d.weekly && (d.weekly.at || Object.keys(d.weekly).length)) {
        var w = d.weekly, parts = Object.keys(WQ).filter(function (k) { return w[k]; }).map(function (k) { return WQ[k][0] + ': ' + (WQ[k][1][w[k]] || w[k]); });
        ev.push(Object.assign({ type: 'wk', at: row.day, what: 'تشيك أسبوعي' + (d.weight ? ' • وزن ' + esc(d.weight) + ' كغ' : '') + (d.waist ? ' • خصر ' + esc(d.waist) + ' سم' : ''),
          det: [parts.join(' · '), w.win ? 'أحسن شي: ' + w.win : '', w.hard ? 'أصعب شي: ' + w.hard : '', w.q ? 'سؤال: ' + w.q : ''].filter(Boolean).map(esc).join('\n') }, base));
      }
      if (d.postpone != null) ev.push(Object.assign({ type: 'pp', at: row.day, what: 'أجّل تمرين اليوم لبكرا (يوم ' + (+d.postpone + 1) + ' بالخطة)', det: '' }, base));
      if (d.useOrig) ev.push(Object.assign({ type: 'pp', at: row.day, what: 'اختار تمرينه الأصلي بدل المأجّل', det: '' }, base));
      Object.keys(d.swaps || {}).forEach(function (k) { ev.push(Object.assign({ type: 'sw', at: row.day, what: 'بدّل تمرين لليوم ← ' + esc(D.ex[+d.swaps[k]] || ('تمرين #' + d.swaps[k])), det: 'اليوم ' + (+k.split('-')[0] + 1) + '، التمرين رقم ' + (+k.split('-')[1] + 1) }, base)); });
      (d.prs || []).forEach(function (x) { ev.push(Object.assign({ type: 'pr', at: row.day, what: '🏆 رقم قياسي جديد: ' + esc(D.ex[+x] || ('تمرين #' + x)), det: '' }, base)); });
    });
    return ev.sort(function (a, b) { return String(b.at) < String(a.at) ? -1 : String(b.at) > String(a.at) ? 1 : 0; });
  }
  var TAGS = { off: ['t-off', 'أكل برّا النظام'], wk: ['t-wk', 'تشيك أسبوعي'], pp: ['t-pp', 'تأجيل'], sw: ['t-sw', 'بديل تمرين'], pr: ['t-pr', 'رقم قياسي'] };
  function when(at, day) { var s = String(at || day); if (s.length > 10) { var d = new Date(s); return day + ' ' + G.pad(d.getHours()) + ':' + G.pad(d.getMinutes()); } return s; }

  function render() {
    var ev = events(), wk = G.addDays(G.today(), -6), last7 = ev.filter(function (e) { return e.day >= wk; });
    var cnt = function (t) { return last7.filter(function (e) { return e.type === t; }).length; };
    var shown = ev.filter(function (e) { return (filter === 'all' || e.type === filter) && (!who || e.client === who); });
    var users = D.beta.map(function (b) { return b.client_id; });
    var h = '<div class="wrap wide"><div class="top"><div class="brand"><img src="../../assets/img/logo.png" alt="GM"><div><b>لوحة التجريبي<span class="betatag">BETA</span></b><small>GM COACH</small></div></div>' +
      '<div style="display:flex;gap:6px"><a class="btn sm ghost" href="../../admin/">اللوحة الأساسية</a><button class="btn sm ghost" id="rf">تحديث</button></div></div>' +
      '<p class="muted" style="margin:-4px 0 12px;font-size:13px">هون بتشوف الأشياء الجديدة يلي بتسجلها النسخة التجريبية بس. الخطط والمشتركين بتعدّلهم من اللوحة الأساسية متل العادة. آخر ' + DAYS + ' يوم.</p>' +
      '<div class="kpis"><div class="kpi"><b>' + users.length + '</b><span>مشترك فاتح التجريبي</span></div><div class="kpi"><b>' + cnt('off') + '</b><span>أكلة برّا النظام (7 أيام)</span></div>' +
      '<div class="kpi"><b>' + cnt('wk') + '</b><span>تشيك أسبوعي (7 أيام)</span></div><div class="kpi"><b>' + cnt('pr') + '</b><span>رقم قياسي (7 أيام)</span></div></div>' +
      '<div class="filters">' + [['all', 'الكل'], ['off', 'الأكل برّا النظام'], ['wk', 'التشيك الأسبوعي'], ['pp', 'التأجيلات'], ['sw', 'البدائل'], ['pr', 'الأرقام القياسية']].map(function (f) {
        return '<button data-f="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<div class="filters"><select class="input" id="who" style="max-width:280px"><option value="">كل المشتركين</option>' + D.list.map(function (c) {
        return '<option value="' + esc(c.user_id) + '"' + (who === c.user_id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>';
    h += shown.length ? shown.slice(0, 300).map(function (e) {
      return '<div class="ev"><div class="h"><span class="who"><span class="tag ' + TAGS[e.type][0] + '">' + TAGS[e.type][1] + '</span>' + esc(name(e.client)) + '</span><span class="when" dir="ltr">' + esc(when(e.at, e.day)) + '</span></div>' +
        '<div class="what">' + e.what + '</div>' + (e.det ? '<div class="det">' + e.det + '</div>' : '') + '</div>';
    }).join('') : '<div class="card muted">لسا ما في شي هون. أول ما حدا يستعمل الميزات الجديدة بالتجريبي بيبيّن.</div>';
    // who uses the beta
    h += '<div class="card" style="margin-top:14px"><b>مين عم يستعمل التجريبي</b><table class="t" style="margin-top:6px"><tr><th>المشترك</th><th>آخر فتحة</th><th>من وين</th></tr>' +
      (D.beta.length ? D.beta.map(function (b) { var d = new Date(b.last_seen); return '<tr><td>' + esc(name(b.client_id)) + '</td><td dir="ltr">' + G.dstr(d) + ' ' + G.pad(d.getHours()) + ':' + G.pad(d.getMinutes()) + '</td><td>' + (b.native ? 'تطبيق APK' : 'المتصفح / آيفون') + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="muted">ولا حدا لسا</td></tr>') + '</table></div>';
    // AI usage + beta notifications
    var aiP = D.ai.filter(function (a) { return a.has_photo; }).length;
    h += '<div class="card"><b>تقدير الأكل بالذكاء الاصطناعي</b><div class="muted" style="font-size:13px;margin-top:4px">' + D.ai.length + ' تقدير بآخر ' + DAYS + ' يوم (' + aiP + ' منهم بصورة). التكلفة تقريباً سنت لسنتين للتقدير.</div></div>';
    h += '<div class="card"><b>إشعارات التجريبي المرسلة</b>' + (D.push.length ? '<table class="t" style="margin-top:6px"><tr><th>المشترك</th><th>النوع</th><th>الحالة</th><th>الوقت</th></tr>' + D.push.slice(0, 50).map(function (p) {
      var d = new Date(p.created_at); return '<tr><td>' + esc(name(p.client_id)) + '</td><td>' + (p.kind === 'beta_weekly' ? 'ملخص أسبوعي' : 'يومي') + '</td><td>' + ({ sent: 'وصل ✓', no_device: 'عبر التطبيق APK', failed: 'فشل', expired: 'منتهي' }[p.status] || esc(p.status)) + '</td><td dir="ltr">' + G.dstr(d) + ' ' + G.pad(d.getHours()) + ':' + G.pad(d.getMinutes()) + '</td></tr>'; }).join('') + '</table>' : '<div class="muted" style="font-size:13px;margin-top:4px">لسا ما انبعت شي.</div>') + '</div></div>';
    $('#app').innerHTML = h;
    $$('[data-f]').forEach(function (b) { b.onclick = function () { filter = b.getAttribute('data-f'); render(); }; });
    $('#who').onchange = function () { who = this.value; render(); };
    $('#rf').onclick = load;
  }

  if (S.a) checkCoach(); else renderLogin();
})();
