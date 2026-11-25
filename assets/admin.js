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
  var NATIVE = window.GMNative || null;   // Android dashboard APK bridge: polls coach_inbox natively
  function nativeOn() { try { return !!(NATIVE && NATIVE.hasSession && NATIVE.hasSession()); } catch (e) { return false; } }
  window.GMA = { render: function () { G.toast('الإشعارات تفعّلت ✓'); try { NATIVE.notify('إشعار تجربة ✅', 'إشعارات لوحة التحكم شغالة عالتابلت.'); } catch (e) {} route(); }, fail: function () { G.toast('ما زبط، تأكد من كلمة المرور'); } };

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
      var nu = f.u.value, np = f.p.value;
      S.login(nu, np).then(function () { if (NATIVE && NATIVE.login) try { NATIVE.login(nu, np); } catch (e) {} }).then(checkCoach).catch(function (er) { G.toast(G.errText(er)); });
    };
  }
  function checkCoach() {
    return S.rest('coaches', 'select=user_id&user_id=eq.' + S.a.uid).then(function (r) {
      if (!r || !r.length) { S.clear(); renderLogin('هالحساب مو حساب مدرب'); return; }
      route();
      if ('Notification' in window && Notification.permission === 'granted') coachPush(false);
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
    if (page === 'inbox') return inboxPage(h[1] || 'me');
    if (page === 'gym') return gymPage(h[1]);
    return clientsPage();
  }
  window.addEventListener('hashchange', function () {
    if (dirty && !confirm('في تعديلات ما انحفظت. بدك تطلع بدون حفظ؟')) { dirty = false; return; }
    dirty = false; route();
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  function shell(active, body) {
    $('#app').innerHTML = '<div class="wrap wide"><div class="top"><div class="brand"><img src="../assets/img/logo.png" alt="GM"><div><b>لوحة التحكم</b><small>GM COACH</small></div></div>' +
      '<div style="display:flex;gap:6px">' + (NATIVE ? '<button class="btn sm' + (nativeOn() ? ' gold' : ' ghost') + '" id="ntf-n">🔔 ' + (nativeOn() ? 'مفعّلة' : 'فعّل الإشعارات') + '</button>' : 'Notification' in window && 'PushManager' in window ? '<button class="btn sm' + (Notification.permission === 'granted' ? ' gold' : ' ghost') + '" id="ntf" title="الإشعارات">🔔 ' + (Notification.permission === 'granted' ? 'مفعّلة' : 'فعّل الإشعارات') + '</button>' : '<button class="btn sm ghost" id="ntf-x">🔔 الإشعارات</button>') +
      '<button class="btn sm ghost" id="lo">خروج</button></div></div><nav class="nav">' +
      [['clients', 'المشتركين'], ['gym', '🏋️ الجيم'], ['ex', 'مكتبة التمارين'], ['tpl', 'القوالب'], ['inbox', 'الإشعارات <span class="nbadge" id="nbadge"></span>']].map(function (n) { return '<a href="#' + n[0] + '" class="' + (active === n[0] ? 'on' : '') + '">' + n[1] + '</a>'; }).join('') +
      '</nav><div id="main">' + body + '</div></div>';
    $('#lo').onclick = function () { S.clear(); if (NATIVE && NATIVE.logout) try { NATIVE.logout(); } catch (e) {} renderLogin(); };
    var nn = $('#ntf-n'); if (nn) nn.onclick = function () {
      if (nativeOn()) { try { NATIVE.requestPermission(); NATIVE.notify('إشعار تجربة ✅', 'إشعارات لوحة التحكم شغالة عالتابلت.'); } catch (e) {} return G.toast('مفعّلة ✓ بيوصلك الملخص الليلي وتنبيهات التجديد (ممكن يتأخر لربع ساعة)'); }
      G.sheet('<h3 class="h3">فعّل إشعارات التابلت</h3><p class="muted" style="font-size:13.5px">دخّل كلمة مرور حساب المدرب مرة وحدة، فالتطبيق بيفحص إشعاراتك لحاله كل ربع ساعة تقريباً حتى لو كان مسكّر.</p>' +
        '<form id="nlf"><label class="field"><span>اسم المستخدم</span><input class="input" name="u" dir="ltr" autocapitalize="none" value="coach" required></label><label class="field"><span>كلمة المرور</span><input class="input" name="p" type="password" dir="ltr" required></label><button class="btn gold block">فعّل</button></form>', function () {
        $('#nlf').onsubmit = function (e) { e.preventDefault(); try { NATIVE.login(e.target.u.value, e.target.p.value); } catch (x) {} G.closeSheet(); G.toast('لحظة...'); };
      });
    };
    unread();
    var nx = $('#ntf-x'); if (nx) nx.onclick = function () { G.toast(/iPhone|iPad/.test(navigator.userAgent) ? 'عالآيفون: افتح اللوحة من Safari، كبسة المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية»، وافتحها من الأيقونة الجديدة وكبس هالزر' : 'هالمتصفح ما بيدعم الإشعارات. افتح coach.georgemousa.com/admin من Chrome (مو من تطبيق APK)'); };
    var nb = $('#ntf'); if (nb) nb.onclick = function () {
      if (Notification.permission === 'denied') return G.toast('الإشعارات ممنوعة من إعدادات المتصفح لهالموقع، فعّلها من هنيك');
      Notification.requestPermission().then(function (p) {
        if (p !== 'granted') return G.toast('ما انسمح بالإشعارات');
        nb.disabled = true;
        return coachPush(true).then(function (ok) { nb.disabled = false; G.toast(ok ? 'تفعّلت ✓ رح يوصلك إشعار تجربة' : 'ما زبط التفعيل، جرّب من Chrome'); route(); });
      });
    };
  }
  function b64u(k) { var p = '='.repeat((4 - k.length % 4) % 4), r = atob((k + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function coachPush(test) {
    if (!('PushManager' in window) || !navigator.serviceWorker || Notification.permission !== 'granted' || !S.a) return Promise.resolve(false);
    return Promise.all([navigator.serviceWorker.register('sw.js', { scope: './' }).then(function () { return navigator.serviceWorker.ready; }), S.api('/functions/v1/coach-push')]).then(function (r) {
      var reg = r[0], key = r[1] && r[1].publicKey; if (!key) return false;
      return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) }); })
        .then(function (sub) { var j = sub.toJSON(); return S.upsert('coach_coach_subs', { endpoint: j.endpoint, coach_id: S.a.uid, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }, 'endpoint'); })
        .then(function () { return test ? S.api('/functions/v1/coach-push', { method: 'POST', body: { kind: 'coach_test' } }) : null; }).then(function () { return true; });
    }).catch(function () { return false; });
  }
  function loading(active) { shell(active, '<div class="spinner"></div>'); }
  function fail(e) { $('#main').innerHTML = '<div class="empty">' + esc(G.errText(e)) + '</div>'; }

  /* ---------- gym mode: George trains a private client on the tablet and logs for them ---------- */
  var GYM = null, gymTm = null, gymSave = {};
  function gN(x) { return parseFloat(String(x == null ? '' : x).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; }).replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x6F0; }).replace(/[٫,]/, '.')) || 0; }
  function gTimed(it) { return /\d\s*ث|ثاني|ثوان|دقيق|sec|min/i.test(String(it.reps || '')); }
  function gRest(it) { var s = String(it.rest || ''), m = s.match(/\d+(\.\d+)?/); if (!m) return 90; var v = parseFloat(m[0]); return /د|min/i.test(s) && v < 10 ? Math.round(v * 60) : v; }
  function gScore(s, timed) { if (!s) return 0; var w = gN(s.w), r = gN(s.r), t = gN(s.t); return timed ? t : w > 0 ? w * (1 + r / 30) : r; }
  function gSet(s, timed) { if (!s) return ''; return timed ? (s.t ? gN(s.t) + 'ث' : '') : (s.w || s.r ? (gN(s.w) ? gN(s.w) + '×' : '') + (gN(s.r) || '-') : ''); }
  function gPh(v, d) { return v && gN(v) ? String(gN(v)) : (v || d); }
  function gDays(P) { return (P && P.data && P.data.days) || []; }
  function gIdx(P, ck, t) {
    var ds = gDays(P), d = P && P.data, r = d && d.rotation && d.rotation.start && (d.rotation.weekdays || []).length ? d.rotation : null;
    var y = ck[G.addDays(t, -1)], c = ck[t] || {};
    if (y && y.postpone != null && ds[+y.postpone] && !c.useOrig) return +y.postpone;
    var wd = G.parseD(t).getDay();
    if (r) { if (t < r.start || r.weekdays.indexOf(wd) < 0) return -1; var n = 0, dd = r.start; for (var k = 0; k < 4000 && dd < t; k++) { if (r.weekdays.indexOf(G.parseD(dd).getDay()) >= 0) n++; dd = G.addDays(dd, 1); } return n % ds.length; }
    for (var i = 0; i < ds.length; i++) if ((ds[i].weekdays || []).indexOf(wd) >= 0) return i;
    return -1;
  }
  function gymPage(uid) {
    if (gymTm) { clearInterval(gymTm); gymTm = null; }
    loading('gym');
    if (!uid) return gymList();
    var t = G.today();
    Promise.all([S.rest('coach_clients', 'select=*&user_id=eq.' + uid), S.rest('coach_programs', 'select=*&kind=eq.training&client_id=eq.' + uid),
      S.rest('coach_checkins', 'select=day,data&client_id=eq.' + uid + '&day=gte.' + G.addDays(t, -1)),
      S.rest('coach_logs', 'select=day,exercise_id,sets&client_id=eq.' + uid + '&order=day.desc&limit=800'), loadEx()]).then(function (r) {
      var c = (r[0] || [])[0]; if (!c) return fail(new Error('المشترك مو موجود'));
      var ck = {}; (r[2] || []).forEach(function (x) { ck[x.day] = x.data || {}; });
      var P = (r[1] || [])[0] || null, di = gIdx(P, ck, t);
      GYM = { c: c, P: P, ck: ck, logs: r[3] || [], di: di, swaps: ((ck[t] || {}).swaps) || {}, done: {} };
      if (GYM.di < 0 && gDays(P).length) GYM.di = 0, GYM.rest = true;
      gymRender();
    }).catch(fail);
  }
  function gymList() {
    var t = G.today();
    Promise.all([S.rest('coach_clients', 'select=user_id,name,package,active,gender&active=eq.true&order=name.asc'), S.rest('coach_programs', 'select=client_id,data&kind=eq.training&client_id=not.is.null'),
      S.rest('coach_checkins', 'select=client_id,day,data&day=gte.' + G.addDays(t, -1))]).then(function (r) {
      var pr = {}, ck = {}; (r[1] || []).forEach(function (p) { pr[p.client_id] = p; });
      (r[2] || []).forEach(function (x) { (ck[x.client_id] = ck[x.client_id] || {})[x.day] = x.data || {}; });
      var row = function (c) { var P = pr[c.user_id], i = P ? gIdx(P, ck[c.user_id] || {}, t) : -1, d = gDays(P)[i];
        return '<a class="cl" href="#gym/' + c.user_id + '"><div><div class="nm">' + esc(c.name) + '</div><div class="sub">' + (!P ? 'ما في خطة تدريب' : d ? 'اليوم: ' + esc(d.title || ('اليوم ' + (i + 1))) : 'اليوم راحة حسب الخطة') + '</div></div><span class="btn sm gold">ابدأ ▶</span></a>'; };
      var cl = r[0] || [], pv = cl.filter(isPriv), ot = cl.filter(function (c) { return !isPriv(c); });
      $('#main').innerHTML = '<h2 class="h2">🏋️ وضع الجيم</h2><p class="muted" style="margin-top:-4px">اختار المشترك اللي معك هلق. بتسجّل أوزانه عنه وبتنحفظ بسجلّه وبيشوفها بتطبيقه.</p>' +
        '<h3 class="h3" style="margin:14px 0 8px">البرايفت</h3><div style="display:grid;gap:8px">' + (pv.length ? pv.map(row).join('') : '<div class="empty">ما في مشتركين برايفت فعّالين.</div>') + '</div>' +
        (ot.length ? '<details style="margin-top:16px"><summary class="muted" style="cursor:pointer">باقي المشتركين (' + ot.length + ')</summary><div style="display:grid;gap:8px;margin-top:8px">' + ot.map(row).join('') + '</div></details>' : '');
    }).catch(fail);
  }
  function gLast(exId) { var t = G.today(); for (var i = 0; i < GYM.logs.length; i++) { var l = GYM.logs[i]; if (l.exercise_id === exId && l.day < t && (l.sets || []).some(function (s) { return s && (s.w || s.r || s.t); })) return l; } return null; }
  function gToday(exId) { var t = G.today(); for (var i = 0; i < GYM.logs.length; i++) { var l = GYM.logs[i]; if (l.exercise_id === exId && l.day === t) return l.sets || []; } return []; }
  function gBest(exId, timed) { var t = G.today(), b = 0; GYM.logs.forEach(function (l) { if (l.exercise_id === exId && l.day < t) (l.sets || []).forEach(function (s) { var v = gScore(s, timed); if (v > b) b = v; }); }); return b; }
  function gEx(it, i) { var sw = GYM.swaps[GYM.di + '-' + i]; return (sw && exById(+sw)) || exById(it.ex) || { id: it.ex, name_ar: it.name || 'تمرين' }; }
  function gymRender() {
    var c = GYM.c, ds = gDays(GYM.P), d = ds[GYM.di], g = c.gender === 'female' ? 'female' : 'male';
    var h = '<div class="row" style="align-items:center;gap:8px;flex-wrap:wrap"><a class="btn sm ghost" href="#gym">→ المشتركين</a><h2 class="h2" style="margin:0;flex:1">' + esc(c.name) + '</h2><a class="btn sm ghost" href="#client/' + c.user_id + '/training">الخطة</a></div>';
    if (!ds.length) { $('#main').innerHTML = h + '<div class="empty">ما في خطة تدريب لهالمشترك.</div>'; return; }
    h += (GYM.rest ? '<p class="muted">اليوم مو يوم تمرين حسب خطته. اختار اليوم اللي بدك ياه:</p>' : '') +
      '<div class="chips" style="margin-top:10px">' + ds.map(function (x, i) { return '<button class="chip' + (i === GYM.di ? ' on' : '') + '" data-gd="' + i + '">' + esc(x.title || ('اليوم ' + (i + 1))) + '</button>'; }).join('') + '</div>';
    if (d.notes) h += '<p class="muted" style="font-size:13.5px">' + esc(d.notes) + '</p>';
    (d.items || []).forEach(function (it, i) {
      var e = gEx(it, i), timed = gTimed(it), last = gLast(e.id), tod = gToday(e.id), n = Math.max(parseInt(it.sets, 10) || 3, tod.length), img = g === 'female' ? (e.image_female || e.image_male) : (e.image_male || e.image_female);
      var ls = last ? last.sets.filter(function (s) { return s && (s.w || s.r || s.t); }) : [];
      h += '<div class="gx" data-gi="' + i + '" data-ex="' + e.id + '" data-timed="' + (timed ? 1 : 0) + '" data-rest="' + gRest(it) + '">' +
        '<div class="gh">' + (img ? '<img src="' + esc(G.media(img)) + '" alt="" loading="lazy">' : '<div class="gimg0">' + (i + 1) + '</div>') +
        '<div style="flex:1;min-width:0"><div class="gnm">' + (i + 1) + '. ' + esc(e.name_ar) + (GYM.swaps[GYM.di + '-' + i] ? ' <small class="gold">(بديل)</small>' : '') + '</div>' +
        '<div class="muted" style="font-size:13px">' + esc((it.sets || '-') + ' × ' + (it.reps || '-')) + ' · راحة ' + esc(it.rest || gRest(it) + 'ث') + (it.note ? ' · ' + esc(it.note) : '') + '</div>' +
        '<div class="glast">' + (ls.length ? 'آخر مرة (' + esc(last.day.slice(5).replace('-', '/')) + '): <b dir="ltr">' + ls.map(function (s) { return gSet(s, timed); }).join(' · ') + '</b>' : 'أول مرة بهالتمرين') + '</div></div>' +
        '<button class="btn sm ghost" data-gsw="' + i + '" title="بدّل التمرين">🔄</button></div><div class="gsets">';
      for (var k = 0; k < n; k++) {
        var s = tod[k] || {}, p = ls[k] || ls[ls.length - 1] || {}, ok = !!(s.w || s.r || s.t);
        h += '<div class="gs' + (ok ? ' ok' : '') + '" data-k="' + k + '"><span class="gk">' + (k + 1) + '</span>' +
          (timed ? '<input class="input" inputmode="decimal" data-f="t" value="' + esc(s.t || '') + '" placeholder="' + esc(gPh(p.t, 'ثواني')) + '"><span class="muted">ث</span>'
            : '<input class="input" inputmode="decimal" data-f="w" value="' + esc(s.w || '') + '" placeholder="' + esc(gPh(p.w, 'كغ')) + '"><span class="muted">×</span><input class="input" inputmode="numeric" data-f="r" value="' + esc(s.r || '') + '" placeholder="' + esc(gPh(p.r, 'عدّات')) + '">') +
          '<button class="gok" data-gok aria-label="خلصت الجولة">✓</button></div>';
      }
      h += '</div><button class="btn sm ghost" data-gadd style="margin-top:6px">+ جولة</button></div>';
    });
    h += '<label class="field" style="margin-top:14px"><span>ملاحظة عن الجلسة (بتنحفظ بملاحظاتك الخاصة عن المشترك)</span><textarea class="input" id="gnote" placeholder="مثلاً: ركبته وجعته بالسكوات، خففنا الوزن"></textarea></label>' +
      '<button class="btn gold block" id="gend" style="margin-top:10px">✓ خلّصت الجلسة</button><div style="height:90px"></div>' +
      '<div class="gtm" id="gtm" hidden><b id="gtv">0:00</b><span class="muted" id="gtl"></span><button class="btn sm ghost" id="gt15">+15ث</button><button class="btn sm ghost" id="gtx">✕</button></div>';
    $('#main').innerHTML = h;
    $$('[data-gd]').forEach(function (b) { b.onclick = function () { GYM.di = +b.getAttribute('data-gd'); GYM.rest = false; gymRender(); }; });
    $$('.gx').forEach(function (box) {
      $$('input', box).forEach(function (inp) { inp.oninput = function () { gQueue(box); }; });
      $$('[data-gok]', box).forEach(function (b) { b.onclick = function () {
        var row = b.closest('.gs'); $$('input', row).forEach(function (inp) { if (!inp.value.trim() && inp.placeholder && /\d/.test(inp.placeholder)) inp.value = inp.placeholder; });
        row.classList.add('ok'); gSaveNow(box); gTimer(+box.getAttribute('data-rest'), $('.gnm', box).textContent);
        var nx = row.nextElementSibling && $('input', row.nextElementSibling); if (nx) nx.focus({ preventScroll: true });
      }; });
      $('[data-gadd]', box).onclick = function () { var sets = $('.gsets', box), last = sets.lastElementChild, cl = last.cloneNode(true), k = sets.children.length; cl.setAttribute('data-k', k); cl.classList.remove('ok'); $('.gk', cl).textContent = k + 1; $$('input', cl).forEach(function (x) { x.value = ''; }); sets.appendChild(cl); gymRender.bindRow(box, cl); };
      $('[data-gsw]', box).onclick = function () { gSwap(+box.getAttribute('data-gi'), +box.getAttribute('data-ex')); };
    });
    $('#gend').onclick = gEnd;
  }
  gymRender.bindRow = function (box, row) {
    $$('input', row).forEach(function (inp) { inp.oninput = function () { gQueue(box); }; });
    $('[data-gok]', row).onclick = function () { $$('input', row).forEach(function (inp) { if (!inp.value.trim() && inp.placeholder && /\d/.test(inp.placeholder)) inp.value = inp.placeholder; }); row.classList.add('ok'); gSaveNow(box); gTimer(+box.getAttribute('data-rest'), $('.gnm', box).textContent); };
  };
  function gQueue(box) { var id = box.getAttribute('data-ex'); clearTimeout(gymSave[id]); gymSave[id] = setTimeout(function () { gSaveNow(box, true); }, 900); }
  function gSaveNow(box, quiet) {
    var id = +box.getAttribute('data-ex'), timed = box.getAttribute('data-timed') === '1', t = G.today(); clearTimeout(gymSave[id]);
    var sets = $$('.gs', box).map(function (row) { var s = {}; $$('input', row).forEach(function (inp) { var v = inp.value.trim(); if (v) s[inp.getAttribute('data-f')] = v; }); return s; });
    while (sets.length && !Object.keys(sets[sets.length - 1]).length) sets.pop();
    var prev = gBest(id, timed), now = 0; sets.forEach(function (s) { var v = gScore(s, timed); if (v > now) now = v; });
    GYM.logs = GYM.logs.filter(function (l) { return !(l.day === t && l.exercise_id === id); }); GYM.logs.unshift({ day: t, exercise_id: id, sets: sets });
    S.upsert('coach_logs', { client_id: GYM.c.user_id, day: t, exercise_id: id, sets: sets, updated_at: new Date().toISOString() }, 'client_id,day,exercise_id')
      .then(function () { if (!quiet) G.toast('انحفظ ✓'); }).catch(function () { G.toast('ما انحفظ، تأكد من الإنترنت'); });
    if (!quiet && prev > 0 && now > prev * 1.001 && !GYM.done[id]) { GYM.done[id] = 1; setTimeout(function () { G.toast('🏆 رقم قياسي جديد لـ ' + GYM.c.name.split(' ')[0] + '!'); }, 900); }
  }
  function gTimer(sec, label) {
    var box = $('#gtm'); if (!box) return; var end = Date.now() + sec * 1000; box.hidden = false; $('#gtl').textContent = 'راحة · ' + label.replace(/^\d+\.\s*/, '');
    if (gymTm) clearInterval(gymTm);
    var tick = function () { var l = Math.max(0, Math.round((end - Date.now()) / 1000)); $('#gtv').textContent = Math.floor(l / 60) + ':' + G.pad(l % 60);
      box.classList.toggle('end', l <= 5);
      if (!l) { clearInterval(gymTm); gymTm = null; gBeep(); if (navigator.vibrate) try { navigator.vibrate([300, 150, 300]); } catch (e) {} setTimeout(function () { box.hidden = true; }, 3000); } };
    tick(); gymTm = setInterval(tick, 300);
    $('#gt15').onclick = function () { end += 15000; if (!gymTm) { box.hidden = false; gymTm = setInterval(tick, 300); } };
    $('#gtx').onclick = function () { clearInterval(gymTm); gymTm = null; box.hidden = true; };
  }
  function gBeep() { try { var A = window.AudioContext || window.webkitAudioContext, a = new A(); [0, .35, .7].forEach(function (d) { var o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.25, a.currentTime + d); o.start(a.currentTime + d); o.stop(a.currentTime + d + .2); }); } catch (e) {} }
  function gCheckin(patch) {
    var t = G.today(), uid = GYM.c.user_id;
    return S.rest('coach_checkins', 'select=data&client_id=eq.' + uid + '&day=eq.' + t).then(function (r) {
      var d = (r && r[0] && r[0].data) || {}; patch(d);
      return S.upsert('coach_checkins', { client_id: uid, day: t, data: d, updated_at: new Date().toISOString() }, 'client_id,day');
    });
  }
  function gSwap(i, cur) {
    var e = exById(cur) || {}, list = (EX || []).filter(function (x) { return x.id !== cur; });
    var same = e.pattern ? list.filter(function (x) { return x.pattern === e.pattern; }) : [];
    var draw = function (q) { var L = q ? list.filter(function (x) { return (x.name_ar + ' ' + (x.name_en || '')).toLowerCase().indexOf(q.toLowerCase()) >= 0; }) : same.length ? same : list.filter(function (x) { return x.muscle === e.muscle; }); L = L.slice(0, 40);
      return L.map(function (x) { return '<button class="btn ghost block" style="text-align:right;margin-bottom:6px" data-pick="' + x.id + '">' + esc(x.name_ar) + ' <small class="muted">' + esc(x.equipment || '') + '</small></button>'; }).join('') || '<div class="empty">ما في نتائج.</div>'; };
    G.sheet('<h3 class="h3">بدّل «' + esc(e.name_ar || 'التمرين') + '» لليوم بس</h3><p class="muted" style="font-size:13px">مثلاً إذا الجهاز مشغول. الخطة الأصلية ما بتتغيّر، والمشترك بيشوف البديل بتطبيقه اليوم.</p>' +
      (same.length ? '<p class="muted" style="font-size:12.5px;margin:0 0 8px">بدائل بنفس الحركة. بدك شي تاني؟ دوّر بالاسم.</p>' : '') + '<input class="input" id="gq" placeholder="دوّر على تمرين تاني..." style="margin-bottom:10px">' + (GYM.swaps[GYM.di + '-' + i] ? '<button class="btn sm danger" id="gsr" style="margin-bottom:10px">رجّع التمرين الأصلي</button>' : '') + '<div id="gl">' + draw('') + '</div>', function () {
      var bind = function () { $$('[data-pick]').forEach(function (b) { b.onclick = function () { set(+b.getAttribute('data-pick')); }; }); };
      var set = function (id) { if (id) GYM.swaps[GYM.di + '-' + i] = id; else delete GYM.swaps[GYM.di + '-' + i]; G.closeSheet(); gymRender();
        gCheckin(function (d) { d.swaps = d.swaps || {}; if (id) d.swaps[GYM.di + '-' + i] = id; else delete d.swaps[GYM.di + '-' + i]; }).catch(function () { G.toast('ما انحفظ التبديل'); }); };
      $('#gq').oninput = function () { $('#gl').innerHTML = draw($('#gq').value.trim()); bind(); };
      var r = $('#gsr'); if (r) r.onclick = function () { set(0); };
      bind();
    });
  }
  function gEnd() {
    $$('.gx').forEach(function (box) { if ($$('input', box).some(function (x) { return x.value.trim(); })) gSaveNow(box, true); });
    var note = $('#gnote').value.trim(), uid = GYM.c.user_id, t = G.today(), sets = 0, exs = 0;
    GYM.logs.forEach(function (l) { if (l.day === t) { var n = (l.sets || []).filter(function (s) { return s && (s.w || s.r || s.t); }).length; if (n) { exs++; sets += n; } } });
    var b = $('#gend'); b.disabled = true;
    var jobs = [gCheckin(function (d) { d.train = 'yes'; d.gym = { by: 'coach', day: GYM.di }; })];
    if (note) jobs.push(S.rest('coach_private_notes', 'select=note&client_id=eq.' + uid).then(function (r) {
      var old = (r && r[0] && r[0].note) || ''; return S.upsert('coach_private_notes', { client_id: uid, note: '🏋️ ' + t + ': ' + note + (old ? '\n' + old : ''), updated_at: new Date().toISOString() }, 'client_id');
    }));
    Promise.all(jobs).then(function () { if (gymTm) clearInterval(gymTm); gymTm = null; G.toast('انحفظت الجلسة ✓ ' + exs + ' تمارين، ' + sets + ' جولة'); location.hash = '#gym'; })
      .catch(function (e) { b.disabled = false; G.toast(G.errText(e)); });
  }

  /* ---------- clients list ---------- */
  function score(c) {
    var s = 0, n = 0;
    if (c.train) { n++; s += c.train === 'no' ? 0 : 1; }
    if (c.food) { n++; s += (+c.food) / 100; }
    if (c.sleep) { n++; s += +c.sleep >= 7 ? 1 : +c.sleep >= 6 ? .5 : 0; }
    if (c.water) { n++; s += Math.min(1, (parseFloat(c.water) || 0) / 3); }
    return n ? Math.round(s / n * 100) : 0;
  }
  var CF = 'all';
  function isPriv(c) { return /^apex/.test(c.package || ''); }
  function isFree(c) { return !!c.is_free || c.package === 'free'; }
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
        return { c: c, html: '<a class="cl ' + lvl + '" href="#client/' + c.user_id + '"><div><div class="nm">' + esc(c.name) + ' <span class="tg ' + (isPriv(c) ? 'pv' : 'on') + '">' + (isPriv(c) ? 'برايفت' : 'أونلاين') + '</span><span class="tg ' + (isFree(c) ? 'fr' : 'pd') + '">' + (isFree(c) ? 'مجاني' : 'مدفوع') + '</span></div><div class="sub">' + esc(PKG[c.package] || c.package || '') +
          (left !== null ? ' · ' + (left < 0 ? '<span class="red">منتهي</span>' : 'باقي ' + left + ' يوم') : '') + ' · ' + (lastDay ? 'آخر تشيك ' + (gap === 0 ? 'اليوم' : 'من ' + gap + ' يوم') : 'ما في تشيكات') + '</div><div class="dots">' + dots + '</div></div>' +
          '<div class="sc ' + (adh >= 75 ? 'green' : adh >= 50 ? 'gold' : 'red') + '">' + adh + '%<small>التزام 7 أيام</small></div></a>' };
      });
      var inactive = cl.filter(function (c) { return !c.active; });
      $('#main').innerHTML = '<div class="kpis"><div class="kpi"><b>' + act.length + '</b><span>مشترك فعّال</span></div><div class="kpi"><b>' + (act.length ? Math.round(sum / act.length) : 0) + '%</b><span>متوسط الالتزام</span></div>' +
        '<div class="kpi"><b class="gold">' + soon + '</b><span>بينتهي خلال 7 أيام</span></div><div class="kpi"><b class="red">' + quiet + '</b><span>غايب يومين أو أكتر</span></div></div>' +
        '<div class="row" style="margin-bottom:12px"><button class="btn gold" id="add" style="flex:none">+ مشترك جديد</button><span></span></div>' +
        '<div class="chips" id="cfil"></div><div class="list" id="clist"></div>' +
        (inactive.length ? '<h3 class="muted" style="margin-top:20px">غير فعّالين</h3><div class="list">' + inactive.map(function (c) { return '<a class="cl" href="#client/' + c.user_id + '"><div class="nm muted">' + esc(c.name) + '</div></a>'; }).join('') + '</div>' : '');
      var FIL = [['all', 'الكل', function () { return true; }], ['priv', 'برايفت', isPriv], ['online', 'أونلاين', function (c) { return !isPriv(c); }], ['paid', 'مدفوع', function (c) { return !isFree(c); }], ['free', 'مجاني', isFree]];
      function draw() {
        var cur = FIL.filter(function (f) { return f[0] === CF; })[0] || FIL[0];
        $('#cfil').innerHTML = FIL.map(function (f) { return '<button class="chip' + (f[0] === cur[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + ' (' + rows.filter(function (x) { return f[2](x.c); }).length + ')</button>'; }).join('');
        var vis = rows.filter(function (x) { return cur[2](x.c); });
        $('#clist').innerHTML = vis.length ? vis.map(function (x) { return x.html; }).join('') : '<div class="empty">' + (rows.length ? 'ما في مشتركين بهالتصنيف.' : 'ما في مشتركين لسا. ضيف أول مشترك.') + '</div>';
        [].forEach.call($('#cfil').querySelectorAll('button'), function (b) { b.onclick = function () { CF = b.getAttribute('data-f'); draw(); }; });
      }
      draw();
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
      '<label class="field"><span><input type="checkbox" name="is_free"' + (c.is_free ? ' checked' : '') + '> مشترك مجاني (ما بيدفع)</span></label>' +
      (isNew ? '' : '<label class="field"><span><input type="checkbox" name="active"' + (c.active ? ' checked' : '') + '> فعّال</span></label>') +
      '<button class="btn gold block">' + (isNew ? 'إنشاء الحساب' : 'حفظ') + '</button></form>', function (b) {
      var f = $('#cf', b); f.gender.value = c.gender || 'male'; f.package.value = c.package || 'm3';
      function autoEnd() { var d = PKG_DAYS[f.package.value]; if (d && f.start_date.value) f.end_date.value = G.addDays(f.start_date.value, d); }
      if (isNew) { autoEnd(); f.package.onchange = autoEnd; f.start_date.onchange = autoEnd; }
      f.onsubmit = function (e) {
        e.preventDefault(); var btn = f.querySelector('button'); btn.disabled = true;
        var v = { name: f.name.value.trim(), gender: f.gender.value, package: f.package.value, start_date: f.start_date.value || null, end_date: f.end_date.value || null, phone: f.phone.value.replace(/\D/g, '') || null, goal: f.goal.value.trim() || null };
        var p, fr = f.is_free.checked;
        if (isNew) { v.action = 'create_client'; v.username = f.username.value.trim().toLowerCase(); v.password = f.password.value; p = S.fn('coach-admin', v).then(function (r) { var done = function () { creds(v, r.user_id, v.password, r.existed); }; return fr ? S.rest('coach_clients', 'user_id=eq.' + r.user_id, { method: 'PATCH', body: { is_free: true } }).then(done, done) : done(); }); }
        else { v.active = f.active.checked; v.is_free = fr; p = S.rest('coach_clients', 'user_id=eq.' + c.user_id, { method: 'PATCH', body: v }).then(function () { G.closeSheet(); route(); }); }
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
        '<div class="row" style="flex:none;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm" id="ed">تعديل</button><button class="btn sm" id="pw">كلمة مرور جديدة</button><button class="btn sm" id="rs" style="color:#ff6b6b;border-color:rgba(255,107,107,.45)">تصفير التقدم</button>' + (c.phone ? '<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(c.phone) + '">واتساب</a>' : '') + '</div></div></div>' +
        '<div class="sub-tabs">' + [['training', 'التدريب'], ['nutrition', 'التغذية'], ['progress', 'المتابعة'], ['photos', 'الصور'], ['notes', 'ملاحظاتي']].map(function (t) {
          return '<a class="chip' + (sub === t[0] ? ' on' : '') + '" style="text-decoration:none;color:inherit" href="#client/' + uid + '/' + t[0] + '">' + t[1] + '</a>';
        }).join('') + '</div><div id="sub"><div class="spinner"></div></div>';
      $('#ed').onclick = function () { clientForm(c); };
      $('#rs').onclick = function () {
        if (!confirm('تصفير تقدم ' + c.name + '؟\n\nرح ينحذف كل شي سجّله: التشيكات اليومية، الأوزان المسجلة بالتمارين، والوزن والخصر.\nالحساب والخطط بيضلوا متل ما هنن.\n\nهالخطوة ما بتتراجع.')) return;
        var ph = confirm('بدك تحذف صور التقدم تبعه كمان؟\n\nموافق = احذف الصور\nإلغاء = خلّي الصور');
        var btn = $('#rs'); btn.disabled = true;
        var jobs = [S.rest('coach_checkins', 'client_id=eq.' + uid, { method: 'DELETE' }), S.rest('coach_logs', 'client_id=eq.' + uid, { method: 'DELETE' })];
        if (ph) jobs.push(S.rest('coach_photos', 'select=path&client_id=eq.' + uid).then(function (rows) {
          return Promise.all((rows || []).map(function (x) { return S.api('/storage/v1/object/coach-photos/' + x.path, { method: 'DELETE' }).catch(function () {}); }));
        }).then(function () { return S.rest('coach_photos', 'client_id=eq.' + uid, { method: 'DELETE' }); }));
        Promise.all(jobs).then(function () { G.toast('تصفّر تقدم ' + c.name + ' ✓'); route(); })
          .catch(function (e) { btn.disabled = false; G.toast(G.errText(e)); });
      };
      $('#pw').onclick = function () {
        var pw = genPw();
        if (!confirm('تغيير كلمة مرور ' + c.name + ' إلى: ' + pw + ' ؟')) return;
        S.fn('coach-admin', { action: 'reset_password', user_id: uid, password: pw }).then(function () { creds(c, uid, pw); }).catch(function (e) { G.toast(G.errText(e)); });
      };
      if (sub === 'training' || sub === 'nutrition') loadProgram(uid, sub, c);
      else if (sub === 'progress') progressTab(c);
      else if (sub === 'photos') { $('#sub').innerHTML = '<div class="card"><b>صور التقدم</b><div id="photos" style="margin-top:10px"></div></div>'; G.photosUI(S, uid, $('#photos'), { coach: true }); }
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
  /* alternatives group: exercises with the same "pattern" replace each other when a machine is busy */
  function patOpts(e) {
    var by = {}; (EX || []).forEach(function (x) { if (x.pattern) (by[x.pattern] = by[x.pattern] || []).push(x); });
    var keys = Object.keys(by).sort(function (a, b) { var ma = by[a][0].muscle || '', mb = by[b][0].muscle || ''; return ma === mb ? a.localeCompare(b) : ma.localeCompare(mb); });
    return '<option value="">بدون مجموعة (بيطلعله كل تمارين العضلة)</option>' + keys.map(function (k) {
      var n = by[k].filter(function (x) { return x.id !== e.id; }).map(function (x) { return x.name_ar; });
      return '<option value="' + esc(k) + '"' + (e.pattern === k ? ' selected' : '') + '>' + esc((by[k][0].muscle || '') + ': ' + n.slice(0, 3).join('، ') + (n.length > 3 ? ' +' + (n.length - 3) : '')) + '</option>';
    }).join('') + '<option value="+">+ مجموعة جديدة</option>';
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
      '<label class="field" style="margin-top:10px"><span>مجموعة البدائل (التمارين اللي بتطلع كبديل إذا الجهاز مشغول)</span><select class="input" name="pattern">' + patOpts(e) + '</select></label>' +
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
          video_male: f.video_male.value.trim() || null, video_female: f.video_female.value.trim() || null, tips: f.tips.value.trim() || null, pattern: f.pattern.value === '+' ? 'p' + Date.now().toString(36) : (f.pattern.value || null), updated_at: new Date().toISOString() };
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

  /* ---------- notifications inbox ---------- */
  function unread() {
    S.rest('coach_inbox', 'select=id&read=eq.false&limit=99').then(function (r) { var b = $('#nbadge'); if (b) b.textContent = r && r.length ? r.length : ''; }).catch(function () {});
  }
  function dmTime(ts) {
    var d = new Date(Date.parse(ts) + 3 * 3600e3), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ' · ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }
  var NK = { morning: 'تذكير تمرين', photos: 'صور التقدّم', night: 'تذكير التقرير', test: 'تجربة', coach_daily: 'ملخّص اليوم', coach_weekly: 'ملخّص الأسبوع' };
  var NST = { sent: ['وصل ✓', 'green'], failed: ['فشل', 'red'], expired: ['الجهاز لغى الاشتراك', 'red'], no_device: ['ما مفعّل إشعارات', 'muted'] };
  function nKind(r) { return r.kind === 'morning' && /صور/.test(r.title || '') ? 'photos' : r.kind; }
  function inboxPage(tab) {
    loading('inbox');
    var tabs = '<div class="chips">' + [['me', 'إشعاراتي'], ['clients', 'المرسلة للمشتركين'], ['devices', 'مين مفعّل']].map(function (t) { return '<a class="chip' + (t[0] === tab ? ' on' : '') + '" href="#inbox/' + t[0] + '">' + t[1] + '</a>'; }).join('') + '</div>';
    if (tab === 'me') return S.rest('coach_inbox', 'select=*&order=created_at.desc&limit=100').then(function (r) {
      r = r || [];
      $('#main').innerHTML = tabs + '<p class="muted" style="margin-top:0">كل الملخّصات يلي بتوصلك: ملخّص كل ليلة 11، الأسبوعي الأحد 10 الصبح، وتنبيهات التجديد. للمدفوعين بس.</p><div class="list">' +
        (r.length ? r.map(function (x) {
          return '<div class="cl' + (x.read ? '' : ' warn') + '" style="display:block"><div class="nm">' + (x.read ? '' : '<span class="tg pd">جديد</span> ') + esc(x.title) + '</div><div class="sub" style="white-space:pre-line;margin-top:4px">' + esc(x.body) + '</div><div class="muted" style="font-size:12px;margin-top:6px">' + dmTime(x.created_at) + '</div></div>';
        }).join('') : '<div class="empty">لسا ما وصل شي. أول ملخّص الليلة الساعة 11:05.</div>') + '</div>';
      var ids = r.filter(function (x) { return !x.read; }).map(function (x) { return x.id; });
      if (ids.length) S.rest('coach_inbox', 'id=in.(' + ids.join(',') + ')', { method: 'PATCH', body: { read: true } }).then(function () { var b = $('#nbadge'); if (b) b.textContent = ''; }).catch(function () {});
    }).catch(fail);
    return Promise.all([S.rest('coach_clients', 'select=user_id,name,active,package,is_free,end_date&order=name.asc'), S.rest('coach_push_subs', 'select=client_id,ua,created_at'),
      tab === 'clients' ? S.rest('coach_push_sent', 'select=*&order=created_at.desc&limit=400') : Promise.resolve([])]).then(function (r) {
      var cl = r[0] || [], subs = r[1] || [], byId = {}; cl.forEach(function (c) { byId[c.user_id] = c; });
      if (tab === 'devices') {
        var act = cl.filter(function (c) { return c.active; }), has = {};
        subs.forEach(function (x) { (has[x.client_id] = has[x.client_id] || []).push(x); });
        var on = act.filter(function (c) { return has[c.user_id]; }), off = act.filter(function (c) { return !has[c.user_id]; });
        var dev = function (u) { u = u || ''; return /iPhone|iPad/.test(u) ? 'آيفون' : /Android/.test(u) ? 'أندرويد' : /Windows|Mac/.test(u) ? 'كمبيوتر' : 'جهاز'; };
        var row = function (c, ok) { return '<a class="cl" href="#client/' + c.user_id + '"><div><div class="nm">' + esc(c.name) + ' <span class="tg ' + (isFree(c) ? 'fr' : 'pd') + '">' + (isFree(c) ? 'مجاني' : 'مدفوع') + '</span></div><div class="sub">' +
          (ok ? has[c.user_id].map(function (x) { return dev(x.ua) + ' من ' + String(x.created_at).slice(0, 10); }).join('، ') : 'ما فعّل الإشعارات') + '</div></div><div class="sc ' + (ok ? 'green' : 'red') + '">' + (ok ? '✓' : '✗') + '</div></a>'; };
        $('#main').innerHTML = tabs + '<div class="kpis"><div class="kpi"><b class="green">' + on.length + '</b><span>مفعّلين</span></div><div class="kpi"><b class="red">' + off.length + '</b><span>مو مفعّلين</span></div></div>' +
          '<p class="muted">يلي مو مفعّل ما بيوصله ولا تذكير. لازم يفتح التطبيق من المتصفح (عالآيفون: Safari ثم «إضافة إلى الشاشة الرئيسية») ويقبل الإشعارات. تطبيق الـ APK عالأندرويد ما بيستقبل إشعارات، الأحسن يفتحوا الرابط من Chrome.</p>' +
          (off.length ? '<h3>مو مفعّلين</h3><div class="list">' + off.map(function (c) { return row(c, false); }).join('') + '</div>' : '') +
          (on.length ? '<h3>مفعّلين</h3><div class="list">' + on.map(function (c) { return row(c, true); }).join('') + '</div>' : '');
        return;
      }
      var all = r[2] || [], fc = '', fk = '';
      $('#main').innerHTML = tabs + '<div class="row" style="margin-bottom:10px;gap:8px"><select id="fc" class="input" style="flex:1"><option value="">كل المشتركين</option>' +
        cl.map(function (c) { return '<option value="' + c.user_id + '">' + esc(c.name) + '</option>'; }).join('') + '</select><select id="fk" class="input" style="flex:1"><option value="">كل الأنواع</option>' +
        ['morning', 'photos', 'night', 'test'].map(function (k) { return '<option value="' + k + '">' + NK[k] + '</option>'; }).join('') + '</select></div><div id="sstat" class="muted" style="margin-bottom:8px"></div><div class="list" id="slist"></div>';
      function draw() {
        var v = all.filter(function (x) { return (!fc || x.client_id === fc) && (!fk || nKind(x) === fk); });
        var ok = v.filter(function (x) { return x.status === 'sent'; }).length;
        $('#sstat').textContent = v.length ? v.length + ' إشعار · وصل ' + ok + ' · ما وصل ' + (v.length - ok) : '';
        $('#slist').innerHTML = v.length ? v.map(function (x) {
          var st = NST[x.status] || [x.status, 'muted'], c = byId[x.client_id];
          return '<div class="cl" style="display:block"><div class="row" style="justify-content:space-between;align-items:center"><div class="nm">' + esc(c ? c.name : 'مشترك محذوف') + ' <span class="tg on">' + (NK[nKind(x)] || esc(x.kind)) + '</span></div><b class="' + st[1] + '" style="font-size:12px;flex:none">' + st[0] + '</b></div>' +
            '<div class="sub" style="margin-top:4px">' + esc(x.title) + ' — ' + esc(x.body) + '</div><div class="muted" style="font-size:12px;margin-top:4px">' + dmTime(x.created_at) + '</div></div>';
        }).join('') : '<div class="empty">' + (all.length ? 'ما في إشعارات بهالفلتر.' : 'لسا ما انبعت شي من وقت ما فعّلنا السجل. أول دفعة بكرا 7 الصبح.') + '</div>';
      }
      $('#fc').onchange = function () { fc = this.value; draw(); }; $('#fk').onchange = function () { fk = this.value; draw(); };
      draw();
    }).catch(fail);
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
        return '<tr><td dir="ltr">' + esc(x.day.slice(5)) + '</td><td>' + esc((LBL.train[d.train] || '-')) + '</td><td>' + esc(LBL.cardio[d.cardio] || '-') + '</td><td>' + esc(d.food ? d.food + '%' : '-') + '</td><td>' + esc(d.sleep || '-') + '</td><td>' + esc(d.water ? d.water + ' ل' : '-') + '</td><td>' + esc(LBL.energy[d.energy] || '-') + '</td><td>' + esc(d.weight || '-') + '</td><td style="text-align:right">' + esc(d.note || '') + '</td></tr>';
      }).join('') + '</table>' : '<p class="muted">ما في تشيكات لسا.</p>') + '</div>';
      var by = {}; logs.forEach(function (l) { (by[l.exercise_id] = by[l.exercise_id] || []).push(l); });
      var ids = Object.keys(by);
      h += '<div class="card"><b>الأوزان بالتمارين</b>' + (ids.length ? ids.map(function (id) {
        var e = exById(+id), a = by[id].slice(0, 6);
        return '<div style="margin-top:10px"><b style="font-size:14px">' + esc(e ? e.name_ar : '#' + id) + '</b>' + a.map(function (l) { return '<div class="muted" style="font-size:12.5px"><span dir="ltr">' + esc(l.day.slice(5)) + '</span>: ' + (l.sets || []).filter(Boolean).map(function (s) { return s.t ? s.t + ' ث' : (s.w || '-') + '×' + (s.r || '-'); }).join(' · ') + '</div>'; }).join('') + '</div>';
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
