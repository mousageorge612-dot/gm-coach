/* GM Coach — shared helpers (client app + coach dashboard). No build step, no libraries. */
(function () {
  'use strict';
  var URL_ = 'https://lwnjdcwlxbanjbkmbvoc.supabase.co';
  var KEY_ = 'sb_publishable_noH86NX1wSd4t6--8_cMbA_AqYIMub1';
  var DOMAIN = '@clients.georgemousa.com';
  var BUCKET = 'coach-media';

  function Session(storeKey) {
    var s = this; s.key = storeKey; s.a = null;
    try { s.a = JSON.parse(localStorage.getItem(storeKey)); } catch (e) {}
  }
  Session.prototype.save = function (j, user) {
    this.a = { token: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000,
      uid: j.user ? j.user.id : (this.a && this.a.uid), user: user || (this.a && this.a.user) };
    try { localStorage.setItem(this.key, JSON.stringify(this.a)); } catch (e) {}
  };
  Session.prototype.clear = function () { this.a = null; try { localStorage.removeItem(this.key); } catch (e) {} };
  Session.prototype.token = function () {
    var s = this;
    if (!s.a) return Promise.reject(new Error('no session'));
    if (Date.now() < s.a.exp) return Promise.resolve(s.a.token);
    return raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.a.refresh } })
      .then(function (j) { s.save(j); return s.a.token; }, function (e) { if (e.status === 400 || e.status === 401) s.clear(); throw e; });
  };
  Session.prototype.login = function (username, password) {
    var s = this, u = String(username || '').trim().toLowerCase();
    var email = u.indexOf('@') > 0 ? u : u + DOMAIN;
    return raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: password } })
      .then(function (j) { s.save(j, u); return s.a; });
  };
  Session.prototype.api = function (path, o) {
    var s = this; o = o || {};
    return s.token().then(function (t) { o.token = t; return raw(path, o); });
  };
  Session.prototype.rest = function (table, query, o) { return this.api('/rest/v1/' + table + (query ? '?' + query : ''), o); };
  Session.prototype.upsert = function (table, rows, conflict) {
    return this.rest(table, conflict ? 'on_conflict=' + conflict : '', { method: 'POST', body: rows,
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' } });
  };
  Session.prototype.fn = function (name, body) { return this.api('/functions/v1/' + name, { method: 'POST', body: body }); };
  Session.prototype.upload = function (path, blob) {
    var s = this;
    return s.token().then(function (t) {
      return fetch(URL_ + '/storage/v1/object/' + BUCKET + '/' + path, { method: 'POST',
        headers: { apikey: KEY_, Authorization: 'Bearer ' + t, 'Content-Type': blob.type || 'image/webp', 'x-upsert': 'true' }, body: blob })
        .then(function (r) { if (!r.ok) return r.text().then(function (x) { throw new Error('upload ' + r.status + ' ' + x); }); return path; });
    });
  };

  function raw(path, o) {
    o = o || {};
    var h = { apikey: KEY_, 'Content-Type': 'application/json' };
    if (o.token) h.Authorization = 'Bearer ' + o.token;
    if (o.headers) for (var k in o.headers) h[k] = o.headers[k];
    return fetch(URL_ + path, { method: o.method || 'GET', headers: h, body: o.body != null ? JSON.stringify(o.body) : undefined, cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
          if (!r.ok) { var er = new Error((j && (j.error_description || j.msg || j.message || j.error)) || 'HTTP ' + r.status); er.status = r.status; er.body = j; throw er; }
          return j;
        });
      });
  }

  function media(path) {
    if (!path) return '';
    if (/^https?:/.test(path)) return path;
    return URL_ + '/storage/v1/object/public/' + BUCKET + '/' + path;
  }

  /* Resize an image File to webp (max side px) before upload. */
  function shrink(file, max) {
    max = max || 1100;
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('encode')); }, 'image/webp', 0.84);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseD(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
  function today() { return dstr(new Date()); }
  function diffDays(a, b) { return Math.round((parseD(b) - parseD(a)) / 864e5); }
  var WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function toast(m) {
    var t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function errText(e) {
    var m = String((e && e.message) || e || '');
    if (/invalid login|invalid_grant|credentials/i.test(m)) return 'اسم المستخدم أو كلمة المرور غلط';
    if (/failed to fetch|network/i.test(m)) return 'ما في اتصال بالإنترنت';
    if (/taken|already/i.test(m)) return 'اسم المستخدم مستعمل';
    if (/weak_password/.test(m)) return 'كلمة المرور لازم تكون 6 أحرف أو أكثر';
    if (/bad_username/.test(m)) return 'اسم المستخدم: أحرف إنكليزية صغيرة وأرقام فقط (3 إلى 24)';
    if (/not_coach/.test(m)) return 'هالحساب مو حساب مدرب';
    return m || 'صار خطأ';
  }
  /* Bottom sheet */
  function sheet(html, onOpen) {
    var sh = $('#sheet');
    if (!sh) {
      sh = document.createElement('div'); sh.id = 'sheet'; sh.className = 'sheet';
      sh.innerHTML = '<div class="sheet-bg" data-close></div><div class="sheet-panel" role="dialog" aria-modal="true"><button class="sheet-x" data-close aria-label="إغلاق">✕</button><div id="sheet-body"></div></div>';
      document.body.appendChild(sh);
      sh.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeSheet(); });
    }
    $('#sheet-body').innerHTML = html; sh.hidden = false; document.body.classList.add('noscroll');
    if (onOpen) onOpen($('#sheet-body'));
  }
  function closeSheet() { var sh = $('#sheet'); if (sh) sh.hidden = true; document.body.classList.remove('noscroll'); }
  function ytId(u) {
    var m = String(u || '').match(/(?:shorts\/|youtu\.be\/|v=|embed\/)([\w-]{11})/); return m ? m[1] : '';
  }

  window.GM = { Session: Session, media: media, shrink: shrink, $: $, $$: $$, esc: esc, dstr: dstr, parseD: parseD, addDays: addDays,
    today: today, diffDays: diffDays, WD: WD, toast: toast, errText: errText, sheet: sheet, closeSheet: closeSheet, ytId: ytId, pad: pad };
})();
