/* ======================================================================
   palabrasModulo.js  -  Módulo APRENDE PALABRAS (Wordy)
   Ubicación: public_html/palabrasModulo.js   (junto a app.js y cuentosModulo.js)

   Se carga en:
     palabrasSelecciona.html  (data-vista="mapa")        mapa de 5 niveles
     palabrasJugar.html       (data-vista="jugar")       Ejercicios prácticos / Relacionar con imágenes
     palabras_nv_1..5.html    (data-vista="diccionario") Diccionario del gusanito ("Mis palabras") + repaso

   Habla con la API de Spring Boot (repo wordy-backend):  /api/palabras/...
   Las respuestas correctas NUNCA llegan al navegador: cada respuesta se valida en el servidor,
   que además guarda el intento, el avance y desbloquea la palabra (casos de uso 7, 8 y 9).
   ====================================================================== */
(function () {
  'use strict';

  var raiz = document.getElementById('pa-modulo');
  if (!raiz) { return; }
  var vista = raiz.getAttribute('data-vista');

  /* ---------------------------------------------------------------- API */
  var API = (window.WORDY_API_BASE ||
    'https://wordy-api-marvin-athheedkfubbh8ez.mexicocentral-01.azurewebsites.net/api') + '/palabras';

  function sesion() {
    try { return JSON.parse(sessionStorage.getItem('wordy_sesion')); } catch (e) { return null; }
  }
  function idUsuario() {
    var s = sesion();
    return s && s.id_usuario ? s.id_usuario : null;
  }

  /** Llama a la API y siempre devuelve { estado, datos }; solo lanza error si no hay red. */
  function llamar(ruta, cuerpo) {
    var opciones = cuerpo === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) };
    return fetch(API + ruta, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { estado: r.status, datos: d || {} };
      });
    });
  }

  /* ---------------------------------------------------------------- utilidades */
  function $(id) { return document.getElementById(id); }
  function param(nombre) { return new URLSearchParams(window.location.search).get(nombre); }

  function crear(etiqueta, clase, texto) {
    var el = document.createElement(etiqueta);
    if (clase) { el.className = clase; }
    if (texto !== undefined && texto !== null) { el.textContent = texto; }
    return el;
  }

  var avisoEl = $('pa-aviso');
  var avisoTimer = null;
  /** Mensaje flotante: tipo = 'info' | 'error' | 'ok' */
  function aviso(texto, tipo, ms) {
    if (!avisoEl) { return; }
    avisoEl.textContent = texto;
    avisoEl.className = 'pa-aviso' + (tipo && tipo !== 'info' ? ' pa-aviso-' + tipo : '');
    avisoEl.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { avisoEl.hidden = true; }, ms || 3800);
  }

  function exigirSesion() {
    if (idUsuario()) { return true; }
    window.location.replace('index.html');
    return false;
  }

  /** Sonidos de acierto / error hechos con el navegador (no necesitan archivos .mp3). */
  var ctxAudio = null;
  function sonido(bien) {
    try {
      ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
      var notas = bien ? [523, 659, 784] : [220, 175];
      notas.forEach(function (f, i) {
        var o = ctxAudio.createOscillator();
        var g = ctxAudio.createGain();
        var t = ctxAudio.currentTime + i * 0.12;
        o.type = bien ? 'triangle' : 'sawtooth';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(bien ? 0.25 : 0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g);
        g.connect(ctxAudio.destination);
        o.start(t);
        o.stop(t + 0.2);
      });
    } catch (e) { /* sin audio: no pasa nada */ }
  }

  /** "Mira y escucha": lee en voz alta con la voz del navegador (o el .mp3 si la BD trae url_audio). */
  function hablar(texto, urlAudio) {
    if (urlAudio) {
      var a = new Audio(urlAudio);
      a.play().catch(function () { hablar(texto, null); });
      return;
    }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      aviso('Tu navegador no puede leer en voz alta.', 'info');
      return;
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-MX';
    u.rate = 0.9;
    var voces = window.speechSynthesis.getVoices() || [];
    for (var k = 0; k < voces.length; k++) {
      if (voces[k].lang && voces[k].lang.toLowerCase().indexOf('es') === 0) { u.voice = voces[k]; break; }
    }
    window.speechSynthesis.speak(u);
  }

  /** Imagen de la palabra; si no hay url (o no carga) se muestra el emoji. */
  function figura(imagen, emoji, alt) {
    var caja = crear('div', 'pa-figura');
    function ponerEmoji() {
      caja.innerHTML = '';
      var s = crear('span', null, emoji || '📘');
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', alt || 'Imagen');
      caja.appendChild(s);
    }
    if (imagen) {
      var img = document.createElement('img');
      img.alt = alt || 'Imagen';
      img.loading = 'lazy';
      img.onerror = ponerEmoji;
      img.src = imagen;
      caja.appendChild(img);
    } else {
      ponerEmoji();
    }
    return caja;
  }

  var NOMBRE_ACTIVIDAD = { practica: 'Ejercicios prácticos', imagenes: 'Relacionar con imágenes' };
  function actividadValida(a) { return a === 'practica' || a === 'imagenes' ? a : 'practica'; }

  /* ====================================================================== MAPA */
  function iniciarMapa() {
    var actividad = actividadValida(param('actividad'));
    var nodos = raiz.querySelectorAll('.node');
    var cajaError = $('pa-mapa-error');
    $('pa-mapa-actividad').textContent = NOMBRE_ACTIVIDAD[actividad];
    document.title = 'Wordy | ' + NOMBRE_ACTIVIDAD[actividad];

    function pintar(niveles) {
      var porNivel = {};
      niveles.forEach(function (n) { porNivel[n.nivel] = n; });
      var actualMarcado = false;
      Array.prototype.forEach.call(nodos, function (nodo) {
        var num = nodo.getAttribute('data-nivel');
        var n = porNivel[num];
        var est = n ? n[actividad] : 'bloqueado';
        var abierto = est === 'disponible' || est === 'completado';
        nodo.setAttribute('data-estado', est);
        nodo.classList.toggle('locked', !abierto);
        nodo.classList.toggle('active', abierto);
        nodo.classList.toggle('pa-hecho', est === 'completado');
        nodo.classList.remove('pa-actual');
        if (est === 'disponible' && !actualMarcado) { nodo.classList.add('pa-actual'); actualMarcado = true; }
        nodo.setAttribute('href', abierto ? 'palabrasJugar.html?actividad=' + actividad + '&nivel=' + num : '#');
        nodo.setAttribute('aria-disabled', abierto ? 'false' : 'true');
        var etiqueta = 'Nivel ' + num + (est === 'completado' ? ' (completado)' : abierto ? '' : ' (bloqueado)');
        if (n) { etiqueta += ' · ' + n.desbloqueadas + ' de ' + n.palabras + ' palabras descubiertas'; }
        nodo.title = etiqueta;
        nodo.setAttribute('aria-label', etiqueta);
      });
    }

    function cargar() {
      cajaError.hidden = true;
      llamar('/mapa?idUsuario=' + encodeURIComponent(idUsuario())).then(function (r) {
        if (r.estado !== 200 || !r.datos.ok) {
          $('pa-mapa-error-texto').textContent = r.datos.error || 'No pudimos cargar tus niveles. Intenta de nuevo.';
          cajaError.hidden = false;
          return;
        }
        if (!r.datos.hayContenido) {
          $('pa-mapa-error-texto').textContent = 'No hay palabras disponibles por ahora.';
          cajaError.hidden = false;
          return;
        }
        pintar(r.datos.niveles);
        if (r.datos.perfilNino === false) {
          aviso('Tu cuenta aún no tiene perfil de niño: podrás jugar el nivel 1, pero no se guardará tu avance.', 'info', 7000);
        }
      }).catch(function () {
        $('pa-mapa-error-texto').textContent = 'No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.';
        cajaError.hidden = false;
      });
    }

    raiz.addEventListener('click', function (e) {
      var n = e.target && e.target.closest ? e.target.closest('.node') : null;
      if (!n) { return; }
      var est = n.getAttribute('data-estado');
      if (est !== 'disponible' && est !== 'completado') {
        e.preventDefault();
        e.stopPropagation();
        aviso(est === 'sin_contenido' ? 'Este nivel todavía no tiene esta actividad.'
          : '¡Completa el nivel anterior para desbloquear este!', 'info');
      }
    }, true);
    $('pa-mapa-reintentar').addEventListener('click', cargar);
    if (exigirSesion()) { cargar(); }
  }

  /* ===================================================================== JUGAR */
  function iniciarJuego() {
    var nivel = parseInt(param('nivel'), 10);
    var actividad = actividadValida(param('actividad'));
    var urlMapa = 'palabrasSelecciona.html?actividad=' + actividad;
    $('pa-regresar').href = urlMapa;

    function mostrarError(texto) {
      $('pa-cargando').hidden = true;
      $('pa-juego').hidden = true;
      $('pa-error-texto').textContent = texto;
      $('pa-error-mapa').href = urlMapa;
      $('pa-error').hidden = false;
    }

    if (!exigirSesion()) { return; }
    if (!(nivel >= 1 && nivel <= 5)) { mostrarError('Ese nivel no existe.'); return; }
    document.title = 'Wordy | ' + NOMBRE_ACTIVIDAD[actividad] + ' - Nivel ' + nivel;

    llamar('/nivel/' + nivel + '?actividad=' + actividad + '&idUsuario=' + encodeURIComponent(idUsuario()))
      .then(function (r) {
        if (r.estado !== 200 || !r.datos.ok) {
          mostrarError(r.datos.error || 'No se pudo cargar la actividad, intenta de nuevo.');
          return;
        }
        $('pa-cargando').hidden = true;
        $('pa-juego').hidden = false;
        $('pa-nivel-texto').textContent = NOMBRE_ACTIVIDAD[actividad] + ' · Nivel ' + nivel;
        if (r.datos.aviso) {
          $('pa-banner').textContent = r.datos.aviso;
          $('pa-banner').hidden = false;
        }
        var juego = { nivel: nivel, actividad: actividad, ticket: r.datos.ticket, aciertos: 0, total: 0, nuevas: [] };
        if (actividad === 'practica') { arrancarPractica(juego, r.datos.palabras || []); }
        else { arrancarImagenes(juego, r.datos); }
      })
      .catch(function () { mostrarError('No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.'); });
  }

  /** Envía una respuesta al servidor. Devuelve una promesa con { ok, correcta, desbloqueada, palabra, ... }. */
  function validar(cuerpo) {
    cuerpo.idUsuario = idUsuario();
    return llamar('/validar', cuerpo).then(function (r) {
      if (r.estado === 200 && r.datos.ok) { return r.datos; }
      throw new Error(r.datos.error || 'No se pudo revisar tu respuesta');
    });
  }

  function progreso(actual, total, texto) {
    $('pa-progreso-texto').textContent = texto;
    $('pa-progreso-barra').style.width = Math.round(100 * actual / Math.max(1, total)) + '%';
  }

  function mensaje(texto, tipo) {
    var m = $('pa-mensaje');
    m.textContent = texto;
    m.className = 'pa-mensaje' + (tipo ? ' pa-mensaje-' + tipo : '');
  }

  /* -------------------------------------------- Ejercicios prácticos (CU 8 + significado) */
  function arrancarPractica(juego, palabras) {
    var vistaP = $('pa-vista-practica');
    vistaP.hidden = false;
    var btnRevisar = $('pa-revisar');
    var globo = $('pa-globo');
    var i = 0;
    var actual = null;     // estado de la palabra en pantalla

    palabras.forEach(function (t) {
      if (t.silabas) { juego.total++; }
      if (t.significadoPregunta) { juego.total++; }
    });
    if (!palabras.length) { mensaje('Este nivel no tiene palabras todavía.', 'error'); return; }

    /** Dibuja una lista de opciones (botones). formato 'texto' (A, B, C, D) o 'silaba' (a, b, c). */
    function dibujarOpciones(contenedor, opciones, formato, parte) {
      contenedor.innerHTML = '';
      opciones.forEach(function (o, k) {
        var b;
        if (formato === 'texto') {
          var li = crear('li');
          b = crear('button', 'pa-op-texto');
          b.appendChild(crear('span', 'pa-op-letra', String.fromCharCode(65 + k) + ')'));
          b.appendChild(crear('span', null, o.texto));
          li.appendChild(b);
          contenedor.appendChild(li);
        } else {
          b = crear('button', 'pa-btn3d pa-c' + (k % 3));
          b.textContent = String.fromCharCode(97 + k) + ')  ' + o.texto;
          contenedor.appendChild(b);
        }
        b.type = 'button';
        b.setAttribute('data-id', o.id);
        b.addEventListener('click', function () {
          var p = actual[parte];
          if (!p || p.resuelta || actual.enviando) { return; }
          Array.prototype.forEach.call(contenedor.querySelectorAll('button'), function (x) {
            x.classList.remove('pa-elegida', 'pa-mal');
          });
          b.classList.add('pa-elegida');
          p.elegida = o.id;
        });
      });
    }

    function mostrar(n) {
      var t = palabras[n];
      actual = {
        t: t,
        enviando: false,
        fallos: 0,
        sil: t.silabas ? { id: t.silabas.idEjercicio, elegida: null, resuelta: false, intentos: 0, cont: $('pa-silabas') } : null,
        sig: t.significadoPregunta ? { id: t.significadoPregunta.idEjercicio, elegida: null, resuelta: false, intentos: 0, cont: $('pa-opciones-sig') } : null
      };
      progreso(n, palabras.length, 'Palabra ' + (n + 1) + ' de ' + palabras.length);
      mensaje('', null);
      $('pa-descubierta').hidden = true;
      $('pa-siguiente').hidden = true;
      btnRevisar.hidden = false;
      btnRevisar.classList.remove('pa-pulso');
      globo.textContent = '¿Necesitas ayuda? ¡Haz clic en mí y te doy una pista!';

      // Izquierda: ¿Cuál es el significado correcto de la palabra?
      $('pa-bloque-sig').hidden = !actual.sig;
      if (actual.sig) {
        var h = $('pa-sig-enunciado');
        h.innerHTML = '';
        h.appendChild(document.createTextNode((t.significadoPregunta.enunciado || '¿Cuál es el significado correcto de la palabra?').replace(/\?\s*$/, '') + ' '));
        h.appendChild(crear('b', null, '«' + t.significadoPregunta.palabra + '»'));
        h.appendChild(document.createTextNode('?'));
        dibujarOpciones(actual.sig.cont, t.significadoPregunta.opciones, 'texto', 'sig');
      }

      // Derecha: tarjeta amarilla de sílabas
      $('pa-bloque-sil').hidden = !actual.sil;
      if (actual.sil) {
        $('pa-sil-enunciado').textContent = t.silabas.enunciado;
        pintarPatron(t.silabas.patron, null);
        dibujarOpciones(actual.sil.cont, t.silabas.opciones, 'silaba', 'sil');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /** "BA-____" -> el hueco resaltado; si ya se resolvió, se escribe la sílaba. */
    function pintarPatron(patron, silaba) {
      var el = $('pa-patron');
      el.innerHTML = '';
      var partes = String(patron || '').split('____');
      el.appendChild(document.createTextNode(partes[0] || ''));
      var h = crear('span', 'pa-hueco', silaba || '____');
      el.appendChild(h);
      el.appendChild(document.createTextNode(partes.slice(1).join('____')));
    }

    function marcar(p, correcta) {
      var b = p.cont.querySelector('button[data-id="' + p.elegida + '"]');
      if (!b) { return; }
      b.classList.remove('pa-elegida');
      b.classList.add(correcta ? 'pa-bien' : 'pa-mal');
      if (correcta) {
        p.resuelta = true;
        Array.prototype.forEach.call(p.cont.querySelectorAll('button'), function (x) { x.disabled = x !== b; });
      } else {
        p.elegida = null;
      }
    }

    function revisar() {
      if (!actual || actual.enviando) { return; }
      var pendientes = [actual.sil, actual.sig].filter(function (p) { return p && !p.resuelta; });
      if (!pendientes.length) { return; }
      var sinElegir = pendientes.filter(function (p) { return !p.elegida; });
      if (sinElegir.length) {
        aviso(pendientes.length > 1 ? 'Elige una opción en las dos actividades antes de revisar.'
          : 'Elige una opción antes de revisar.', 'info');
        return;
      }
      actual.enviando = true;
      btnRevisar.disabled = true;
      Promise.all(pendientes.map(function (p) {
        return validar({ idEjercicio: p.id, idOpcion: p.elegida, modo: 'juego' }).then(function (res) {
          p.intentos++;
          if (res.correcta && p.intentos === 1) { juego.aciertos++; }
          if (res.desbloqueada && res.palabra && juego.nuevas.indexOf(res.palabra) < 0) { juego.nuevas.push(res.palabra); }
          if (res.correcta && p === actual.sil) {
            var b = p.cont.querySelector('button[data-id="' + p.elegida + '"]');
            pintarPatron(actual.t.silabas.patron, b ? b.textContent.replace(/^[a-z]\)\s*/, '') : null);
          }
          marcar(p, res.correcta);
          return res.correcta;
        });
      })).then(function (resultados) {
        actual.enviando = false;
        btnRevisar.disabled = false;
        if (resultados.every(Boolean) && (!actual.sil || actual.sil.resuelta) && (!actual.sig || actual.sig.resuelta)) {
          palabraTerminada();
        } else {
          sonido(false);
          actual.fallos++;
          mensaje('¡Casi! Revisa lo que quedó en rojo e inténtalo otra vez. ¡Tú puedes!', 'error');
          if (actual.fallos >= 2) { darPista(); }
        }
      }).catch(function (err) {
        actual.enviando = false;
        btnRevisar.disabled = false;
        aviso((err && err.message ? err.message : 'No pudimos revisar tu respuesta') + '. Intenta de nuevo.', 'error');
      });
    }

    function palabraTerminada() {
      sonido(true);
      var t = actual.t;
      var nombre = t.significadoPregunta ? t.significadoPregunta.palabra : '';
      mensaje('¡Muy bien! 🌟 Descubriste una palabra nueva.', 'ok');
      var d = $('pa-descubierta');
      d.innerHTML = '';
      d.appendChild(figura(t.imagen, t.emoji, nombre));
      var txt = crear('div');
      txt.appendChild(crear('b', null, nombre));
      txt.appendChild(crear('div', null, t.significado));
      d.appendChild(txt);
      var bEsc = crear('button', 'pa-escuchar', '🔊');
      bEsc.type = 'button';
      bEsc.setAttribute('aria-label', 'Escuchar la palabra');
      bEsc.addEventListener('click', function () { hablar(nombre + '. ' + t.significado); });
      d.appendChild(bEsc);
      d.hidden = false;
      if (nombre) { hablar(nombre); }
      btnRevisar.hidden = true;
      var sig = $('pa-siguiente');
      sig.textContent = i + 1 < palabras.length ? 'Siguiente palabra ▶' : 'Ver mi resultado ★';
      sig.hidden = false;
      sig.focus();
    }

    function darPista() {
      globo.textContent = 'Pista: ' + (actual.t.pista || 'lee con calma el significado.');
    }

    $('pa-gusano').addEventListener('click', function () { if (actual) { darPista(); } });
    btnRevisar.addEventListener('click', revisar);
    $('pa-siguiente').addEventListener('click', function () {
      i++;
      if (i < palabras.length) { mostrar(i); } else { progreso(1, 1, '¡Terminaste!'); finalizar(juego); }
    });
    mostrar(0);
  }

  /* -------------------------------------------- Relacionar con imágenes (CU 7) */
  function arrancarImagenes(juego, datos) {
    $('pa-vista-imagenes').hidden = false;
    $('pa-img-enunciado').textContent = datos.enunciado || 'Relaciona la palabra con su imagen descriptiva';
    var btnRevisar = $('pa-revisar');
    var cajaImgs = $('pa-imagenes');
    var bandeja = $('pa-chips');
    var casillas = [];
    var elegido = null;      // chip seleccionado (modo tocar)
    var arrastrado = null;   // chip que se está arrastrando
    var enviando = false;
    juego.total = (datos.imagenes || []).length;

    function contarResueltas() {
      return casillas.filter(function (c) { return c.resuelta; }).length;
    }
    function actualizarProgreso() {
      progreso(contarResueltas(), casillas.length, contarResueltas() + ' de ' + casillas.length + ' imágenes relacionadas');
    }

    function seleccionar(chip) {
      if (elegido) { elegido.classList.remove('pa-elegida'); }
      elegido = (elegido === chip) ? null : chip;
      if (elegido) { elegido.classList.add('pa-elegida'); }
    }

    function aBandeja(chip) {
      chip.classList.remove('pa-elegida');
      bandeja.appendChild(chip);
    }

    function colocar(casilla, chip) {
      if (casilla.resuelta || !chip) { return; }
      if (casilla.chip && casilla.chip !== chip) { aBandeja(casilla.chip); }
      casillas.forEach(function (c) { if (c.chip === chip) { c.chip = null; c.slot.textContent = '?'; } });
      casilla.chip = chip;
      casilla.slot.textContent = '';
      chip.classList.remove('pa-elegida');
      casilla.slot.appendChild(chip);
      casilla.el.classList.remove('pa-mal');
      elegido = null;
    }

    function crearChip(texto, k) {
      var chip = crear('button', 'pa-btn3d pa-chip pa-c' + (k % 5), texto);
      chip.type = 'button';
      chip.setAttribute('draggable', 'true');
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        var enCasilla = casillas.filter(function (c) { return c.chip === chip && !c.resuelta; })[0];
        if (enCasilla) {                 // tocar una palabra ya colocada la regresa a la bandeja
          enCasilla.chip = null;
          enCasilla.slot.textContent = '?';
          aBandeja(chip);
          return;
        }
        seleccionar(chip);
      });
      chip.addEventListener('dragstart', function (e) {
        arrastrado = chip;
        try { e.dataTransfer.setData('text/plain', texto); } catch (x) { /* nada */ }
      });
      chip.addEventListener('dragend', function () { arrastrado = null; });
      return chip;
    }

    (datos.imagenes || []).forEach(function (im, k) {
      var el = crear('button', 'pa-casilla');
      el.type = 'button';
      el.setAttribute('aria-label', 'Imagen ' + (k + 1) + ': coloca aquí la palabra');
      el.appendChild(figura(im.imagen, im.emoji, 'Imagen ' + (k + 1)));
      var slot = crear('div', 'pa-casilla-slot', '?');
      el.appendChild(slot);
      var pista = crear('div', 'pa-pista-casilla');
      el.appendChild(pista);
      var c = { id: im.idEjercicio, el: el, slot: slot, pista: pista, chip: null, resuelta: false, intentos: 0 };
      casillas.push(c);
      el.addEventListener('click', function () {
        if (c.resuelta) { return; }
        if (elegido) { colocar(c, elegido); }
        else if (!c.chip) { aviso('Primero toca una palabra y luego su imagen (o arrástrala).', 'info'); }
      });
      el.addEventListener('dragover', function (e) { if (!c.resuelta) { e.preventDefault(); el.classList.add('pa-sobre'); } });
      el.addEventListener('dragleave', function () { el.classList.remove('pa-sobre'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault();
        el.classList.remove('pa-sobre');
        colocar(c, arrastrado);
      });
      cajaImgs.appendChild(el);
    });
    (datos.opciones || []).forEach(function (txt, k) { bandeja.appendChild(crearChip(txt, k)); });
    bandeja.addEventListener('dragover', function (e) { e.preventDefault(); });
    bandeja.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!arrastrado) { return; }
      casillas.forEach(function (c) { if (c.chip === arrastrado && !c.resuelta) { c.chip = null; c.slot.textContent = '?'; } });
      aBandeja(arrastrado);
    });
    actualizarProgreso();

    function revisar() {
      if (enviando) { return; }
      var listas = casillas.filter(function (c) { return c.chip && !c.resuelta; });
      if (!listas.length) { aviso('Coloca al menos una palabra sobre una imagen y luego pulsa Revisar.', 'info'); return; }
      enviando = true;
      btnRevisar.disabled = true;
      Promise.all(listas.map(function (c) {
        var texto = c.chip.textContent;
        return validar({ idEjercicio: c.id, respuesta: texto, modo: 'juego' }).then(function (res) {
          c.intentos++;
          if (res.correcta) {
            if (c.intentos === 1) { juego.aciertos++; }
            if (res.desbloqueada && res.palabra && juego.nuevas.indexOf(res.palabra) < 0) { juego.nuevas.push(res.palabra); }
            c.resuelta = true;
            c.el.classList.remove('pa-mal');
            c.el.classList.add('pa-bien');
            c.chip.disabled = true;
            c.chip.setAttribute('draggable', 'false');
            c.pista.textContent = '';
          } else {
            // Caso de uso 7, flujo alterno: se indica la respuesta correcta y se permite reintentar.
            c.el.classList.add('pa-mal');
            c.pista.textContent = res.respuestaCorrecta ? '¡Casi! Esta imagen es: ' + res.respuestaCorrecta : '¡Casi!';
            aBandeja(c.chip);
            c.chip = null;
            c.slot.textContent = '?';
          }
          return res.correcta;
        });
      })).then(function (r) {
        enviando = false;
        btnRevisar.disabled = false;
        actualizarProgreso();
        if (contarResueltas() === casillas.length) {
          sonido(true);
          mensaje('¡Excelente! Relacionaste todas las imágenes. 🎉', 'ok');
          btnRevisar.hidden = true;
          setTimeout(function () { finalizar(juego); }, 1200);
        } else if (r.every(Boolean)) {
          sonido(true);
          mensaje('¡Muy bien! Sigue con las demás imágenes.', 'ok');
        } else {
          sonido(false);
          mensaje('Algunas no coinciden: mira la pista en rojo e inténtalo otra vez.', 'error');
        }
      }).catch(function (err) {
        enviando = false;
        btnRevisar.disabled = false;
        aviso((err && err.message ? err.message : 'No pudimos revisar tus respuestas') + '. Intenta de nuevo.', 'error');
      });
    }
    btnRevisar.addEventListener('click', revisar);
  }

  /* -------------------------------------------- Resultado del nivel */
  function finalizar(juego) {
    var cuerpo = {
      idUsuario: idUsuario(),
      ticket: juego.ticket || '',
      nivel: juego.nivel,
      actividad: juego.actividad,
      aciertos: juego.aciertos,
      total: juego.total
    };
    llamar('/finalizar', cuerpo).then(function (r) {
      if (r.estado === 200 && r.datos.ok) { mostrarResultado(juego, r.datos); return; }
      reintentarFinal(juego, r.datos.error);
    }).catch(function () { reintentarFinal(juego, null); });
  }

  function reintentarFinal(juego, texto) {
    aviso((texto || 'No pudimos guardar tu resultado') + '. Toca "Reintentar".', 'error', 6000);
    var b = $('pa-siguiente');
    b.textContent = 'Reintentar';
    b.hidden = false;
    b.onclick = function () { b.onclick = null; b.hidden = true; finalizar(juego); };
  }

  function mostrarResultado(juego, res) {
    $('pa-juego').hidden = true;
    var est = $('pa-res-estrellas');
    est.innerHTML = '';
    est.setAttribute('aria-label', res.estrellas + ' de 3 estrellas');
    for (var s = 1; s <= 3; s++) { est.appendChild(crear('span', 'pa-estrella' + (s <= res.estrellas ? ' llena' : ''), '★')); }
    $('pa-res-titulo').textContent = res.aciertos === res.total ? '¡Lo hiciste perfecto!'
      : (res.estrellas >= 2 ? '¡Muy bien, súper explorador!' : '¡Buen intento, sigue practicando!');
    $('pa-res-sub').textContent = 'Acertaste ' + res.aciertos + ' de ' + res.total + ' al primer intento.';
    var lista = $('pa-res-palabras');
    lista.innerHTML = '';
    $('pa-res-nuevas').hidden = !juego.nuevas.length;
    juego.nuevas.forEach(function (p) { lista.appendChild(crear('span', null, '📖 ' + p)); });
    $('pa-res-mensaje').textContent = res.mensaje || '';

    var acc = $('pa-res-acciones');
    acc.innerHTML = '';
    function boton(texto, href, clase) {
      var a = crear('a', 'pa-btn3d ' + clase, texto);
      a.href = href;
      acc.appendChild(a);
    }
    if (res.siguienteNivel) {
      boton('Siguiente nivel ▶', 'palabrasJugar.html?actividad=' + juego.actividad + '&nivel=' + res.siguienteNivel, 'pa-c0');
    }
    boton('Ver el mapa', 'palabrasSelecciona.html?actividad=' + juego.actividad, 'pa-c1');
    boton('Jugar otra vez', 'palabrasJugar.html?actividad=' + juego.actividad + '&nivel=' + juego.nivel, 'pa-c2');
    boton('Mis palabras', 'palabras_nv_' + juego.nivel + '.html', 'pa-c3');
    $('pa-resultado').hidden = false;
    window.scrollTo(0, 0);
  }

  /* =============================================== DICCIONARIO / MIS PALABRAS (CU 9) */
  function iniciarDiccionario() {
    var nivel = parseInt(document.body.getAttribute('data-nivel'), 10) || 1;
    var cont = $('listaPalabras');
    var resumen = $('pa-dic-resumen');

    Array.prototype.forEach.call(document.querySelectorAll('.nivel-mini'), function (a) {
      if (a.getAttribute('data-nivel') === String(nivel)) { a.setAttribute('aria-current', 'page'); }
    });

    function vacio(texto, conBoton) {
      cont.innerHTML = '';
      var caja = crear('div', 'pa-dic-vacio');
      caja.appendChild(crear('p', null, texto));
      if (conBoton) {
        var a = crear('a', 'pa-btn3d pa-c0', '¡Jugar ahora!');
        a.href = 'palabrasActividad.html';
        caja.appendChild(a);
      }
      cont.appendChild(caja);
    }

    function tarjeta(p) {
      var art = crear('article', 'palabra-tarjeta ' + (p.desbloqueada ? 'desbloqueada' : 'bloqueada'));
      if (!p.desbloqueada) {
        art.appendChild(crear('h3', null, '? ? ?'));
        art.appendChild(crear('p', 'palabra-detalle', '🔒 Juega el nivel ' + p.nivel + ' para descubrir esta palabra.'));
        return art;
      }
      art.tabIndex = 0;
      art.appendChild(crear('h3', null, p.palabra));
      var esc = crear('button', 'palabra-icono');
      esc.type = 'button';
      esc.setAttribute('aria-label', 'Escuchar ' + p.palabra);
      esc.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="11"/>'
        + '<path class="relleno" d="M11 9.5v9l7.5-4.5z"/><path d="M20 22l6 6m-3-9 2 2"/></svg>';
      esc.addEventListener('click', function (e) { e.stopPropagation(); hablar(p.palabra + '. ' + p.significado, p.audio); });
      art.appendChild(esc);
      art.appendChild(figura(p.imagen, p.emoji, p.palabra));
      var det = crear('p', 'palabra-detalle', p.significado + (p.ejemplo ? ' Ejemplo: ' + p.ejemplo : ''));
      art.appendChild(det);
      if (p.puedeRepasar) {
        var rep = crear('button', 'pa-btn3d pa-c1 pa-btn-repasar', 'Repasar');
        rep.type = 'button';
        rep.addEventListener('click', function (e) { e.stopPropagation(); abrirRepaso(p, cargar); });
        art.appendChild(rep);
      }
      art.appendChild(crear('span', 'pa-repasos', p.vecesRepasada === 1 ? 'Repasada 1 vez' : 'Repasada ' + (p.vecesRepasada || 0) + ' veces'));
      art.addEventListener('keydown', function (e) { if (e.key === 'Enter') { hablar(p.palabra + '. ' + p.significado, p.audio); } });
      return art;
    }

    function cargar() {
      llamar('/mis-palabras?idUsuario=' + encodeURIComponent(idUsuario())).then(function (r) {
        if (r.estado !== 200 || !r.datos.ok) {
          vacio(r.datos.error || 'No pudimos cargar tus palabras. Intenta de nuevo.', false);
          return;
        }
        var delNivel = (r.datos.palabras || []).filter(function (p) { return p.nivel === nivel; });
        var abiertas = delNivel.filter(function (p) { return p.desbloqueada; }).length;
        if (!r.datos.total) {
          resumen.textContent = '';
          vacio('Aún no has desbloqueado palabras. ¡Sigue jugando!', true);   // CU 9, flujo alterno
          return;
        }
        if (!delNivel.length) { resumen.textContent = ''; vacio('Este nivel todavía no tiene palabras.', false); return; }
        resumen.textContent = 'Has descubierto ' + abiertas + ' de ' + delNivel.length + ' palabras de este nivel · '
          + r.datos.total + ' en total';
        cont.innerHTML = '';
        delNivel.forEach(function (p) { cont.appendChild(tarjeta(p)); });
      }).catch(function () { vacio('No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.', false); });
    }

    if (exigirSesion()) {
      cont.appendChild(crear('p', 'palabras-vacio', 'Cargando tus palabras…'));
      cargar();
    }
  }

  /** Repaso: actividad de 4 opciones sobre una palabra ya desbloqueada. */
  function abrirRepaso(p, alCerrar) {
    var fondo = crear('div', 'pa-modal-fondo');
    var modal = crear('div', 'pa-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Repasar ' + p.palabra);
    var cerrar = crear('button', 'pa-modal-cerrar', '×');
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', 'Cerrar');
    modal.appendChild(cerrar);
    modal.appendChild(crear('h2', null, 'Repasar: ' + p.palabra));
    var cuerpo = crear('div', null);
    cuerpo.appendChild(crear('p', 'pa-cargando', 'Cargando…'));
    modal.appendChild(cuerpo);
    fondo.appendChild(modal);
    document.body.appendChild(fondo);
    var huboRespuesta = false;

    function salir() {
      document.removeEventListener('keydown', teclado);
      fondo.remove();
      if (huboRespuesta && alCerrar) { alCerrar(); }
    }
    function teclado(e) { if (e.key === 'Escape') { salir(); } }
    cerrar.addEventListener('click', salir);
    fondo.addEventListener('click', function (e) { if (e.target === fondo) { salir(); } });
    document.addEventListener('keydown', teclado);
    cerrar.focus();

    llamar('/repaso/' + p.idPalabra + '?idUsuario=' + encodeURIComponent(idUsuario())).then(function (r) {
      cuerpo.innerHTML = '';
      if (r.estado !== 200 || !r.datos.ok) {
        cuerpo.appendChild(crear('p', 'pa-centro', r.datos.error || 'No pudimos cargar el repaso.'));
        return;
      }
      var d = r.datos;
      var h = crear('div', 'pa-pregunta');
      h.appendChild(crear('h2', null, '¿Cuál es el significado correcto de «' + d.palabra + '»?'));
      cuerpo.appendChild(h);
      var ul = crear('ul', 'pa-opciones-texto');
      var msg = crear('p', 'pa-mensaje');
      var enviando = false;
      var fallos = 0;
      d.opciones.forEach(function (o, k) {
        var li = crear('li');
        var b = crear('button', 'pa-op-texto');
        b.type = 'button';
        b.appendChild(crear('span', 'pa-op-letra', String.fromCharCode(65 + k) + ')'));
        b.appendChild(crear('span', null, o.texto));
        b.addEventListener('click', function () {
          if (enviando || b.disabled) { return; }
          enviando = true;
          validar({ idEjercicio: d.idEjercicio, idOpcion: o.id, modo: 'repaso' }).then(function (res) {
            enviando = false;
            huboRespuesta = true;
            if (res.correcta) {
              sonido(true);
              b.classList.add('pa-bien');
              Array.prototype.forEach.call(ul.querySelectorAll('button'), function (x) { x.disabled = true; });
              msg.className = 'pa-mensaje pa-mensaje-ok';
              msg.textContent = '¡Excelente! Ya dominas la palabra «' + d.palabra + '». 🌟';
              hablar(d.palabra);
            } else {
              sonido(false);
              fallos++;
              b.classList.add('pa-mal');
              b.disabled = true;
              msg.className = 'pa-mensaje pa-mensaje-error';
              msg.textContent = fallos >= 2 && d.pista ? 'Pista: ' + d.pista : '¡Casi! Intenta otra vez.';
            }
          }).catch(function (err) {
            enviando = false;
            msg.className = 'pa-mensaje pa-mensaje-error';
            msg.textContent = (err && err.message ? err.message : 'No pudimos revisar tu respuesta') + '. Intenta de nuevo.';
          });
        });
        li.appendChild(b);
        ul.appendChild(li);
      });
      cuerpo.appendChild(ul);
      cuerpo.appendChild(msg);
    }).catch(function () {
      cuerpo.innerHTML = '';
      cuerpo.appendChild(crear('p', 'pa-centro', 'No pudimos conectar con el servidor.'));
    });
  }

  /* ================================================================== ARRANQUE */
  if (vista === 'mapa') { iniciarMapa(); }
  if (vista === 'jugar') { iniciarJuego(); }
  if (vista === 'diccionario') { iniciarDiccionario(); }
})();
