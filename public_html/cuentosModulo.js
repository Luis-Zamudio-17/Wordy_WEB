/* ======================================================================
   cuentosModulo.js  -  Modulo CUENTA CUENTOS (Wordy)
   Ubicacion: public_html/cuentosModulo.js   (junto a app.js y script.js)

   Se carga en cuentosNiveles.html (mapa) y cuentoLeer.html (cuento + trivia + resultado).
   Habla con la API de Spring Boot (repo wordy-backend):  /api/cuentos/...

   Que hace:
     1) MAPA     : pide a la API el estado de cada nivel (bloqueado / disponible /
                   completado, leido de PROGRESO_CUENTO) y abre o cierra los nodos.
     2) LECTOR   : narra el cuento escena por escena (audio .mp3 sincronizado con
                   el texto), se detiene en cada hueco, valida la palabra con
                   el servidor y continua. Al terminar abre la trivia.
     3) TRIVIA   : exige responder todo; el servidor califica y GUARDA el avance.
   La respuesta correcta NUNCA llega al navegador antes de tiempo.
   Errores de audio/imagen: aviso + reintento (+ voz del navegador de respaldo).
   ====================================================================== */
(function () {
  'use strict';

  var raiz = document.getElementById('cc-modulo');
  if (!raiz) { return; }
  var vista = raiz.getAttribute('data-vista');

  /* ---------------------------------------------------------------- API
     Misma direccion que script.js (login). Si algun dia cambia, se puede definir
     window.WORDY_API_BASE antes de cargar este archivo.                       */
  var API = (window.WORDY_API_BASE ||
    'https://wordy-api-marvin-athheedkfubbh8ez.mexicocentral-01.azurewebsites.net/api') + '/cuentos';

  /** Sesion guardada por el login (script.js): { usuario, id_usuario, id_rol, ... } */
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

  var avisoEl = $('cc-aviso');
  var avisoTimer = null;
  /** Mensaje flotante: tipo = 'info' | 'error' | 'ok' */
  function aviso(texto, tipo, ms) {
    if (!avisoEl) { return; }
    avisoEl.textContent = texto;
    avisoEl.className = 'cc-aviso cc-aviso-' + (tipo || 'info');
    avisoEl.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { avisoEl.hidden = true; }, ms || 4200);
  }

  /** Imagen con reintento: 2 reintentos y despues un recuadro que dice que archivo falta. */
  function protegerImagen(img) {
    if (!img) { return; }
    var ruta = img.getAttribute('src') || '';
    var intentos = 0;
    function fallar() {
      if (intentos < 2) {
        intentos++;
        aviso('No pudimos cargar la ilustración. Reintentando…', 'error');
        setTimeout(function () {
          img.src = ruta + (ruta.indexOf('?') < 0 ? '?' : '&') + 'r=' + Date.now();
        }, 900);
      } else {
        var ph = document.createElement('div');
        ph.className = 'cc-img-faltante';
        var icono = document.createElement('span');
        icono.textContent = '🖼️';
        var pie = document.createElement('small');
        pie.appendChild(document.createTextNode('Aquí va la ilustración:'));
        pie.appendChild(document.createElement('br'));
        var cod = document.createElement('code');
        cod.textContent = ruta;
        pie.appendChild(cod);
        ph.appendChild(icono);
        ph.appendChild(pie);
        if (img.parentNode) { img.parentNode.replaceChild(ph, img); }
      }
    }
    img.addEventListener('error', fallar);
    // si el error ocurrio antes de que se registrara el listener
    if (img.complete && img.naturalWidth === 0 && ruta) { fallar(); }
  }

  /** Pone una imagen en su <img>; si no hay ruta, oculta su contenedor. */
  function ponerImagen(img, ruta) {
    if (!img) { return; }
    if (!ruta) { if (img.parentNode) { img.parentNode.hidden = true; } return; }
    img.src = ruta;
    protegerImagen(img);
  }

  /** Sin sesion no se puede guardar avance: app.js ya manda al login; esto es solo el respaldo. */
  function exigirSesion() {
    if (idUsuario()) { return true; }
    window.location.replace('index.html');
    return false;
  }

  /* ====================================================================== MAPA */
  function iniciarMapa() {
    var nodos = raiz.querySelectorAll('.node');
    var cajaError = $('cc-mapa-error');
    var textoError = $('cc-mapa-error-texto');
    var ayuda = $('cc-ayuda-mapa');

    function pintar(niveles) {
      var porNivel = {};
      niveles.forEach(function (n) { porNivel[n.nivel] = n; });
      Array.prototype.forEach.call(nodos, function (nodo) {
        var n = porNivel[nodo.getAttribute('data-nivel')];
        var est = n ? n.estado : 'bloqueado';
        var bloq = (est === 'bloqueado');
        nodo.setAttribute('data-estado', est);
        nodo.classList.toggle('locked', bloq);
        nodo.classList.toggle('active', !bloq);
        nodo.classList.toggle('done', est === 'completado');
        nodo.setAttribute('aria-disabled', bloq ? 'true' : 'false');
        nodo.setAttribute('href', bloq ? '#' : 'cuentoLeer.html?nivel=' + nodo.getAttribute('data-nivel'));
        var nombre = n ? n.titulo : 'Nivel ' + nodo.getAttribute('data-nivel');
        nodo.title = nombre + (est === 'completado' ? ' (completado)' : '');
        nodo.setAttribute('aria-label', 'Nivel ' + nodo.getAttribute('data-nivel') + ': ' + nombre + (bloq ? ' (bloqueado)' : ''));
        if (bloq) { nodo.setAttribute('tabindex', '-1'); } else { nodo.removeAttribute('tabindex'); }
      });
    }

    function mostrarError(texto) {
      textoError.textContent = texto;
      cajaError.hidden = false;
      if (ayuda) { ayuda.hidden = true; }
    }

    function cargar() {
      cajaError.hidden = true;
      if (ayuda) { ayuda.hidden = false; }
      llamar('/mapa?idUsuario=' + encodeURIComponent(idUsuario())).then(function (r) {
        if (r.estado !== 200 || !r.datos.ok) {
          mostrarError(r.datos.error || 'No pudimos cargar tus cuentos. Revisa la conexión e intenta de nuevo.');
          return;
        }
        if (!r.datos.hayContenido) { mostrarError('No hay contenido disponible por ahora.'); return; }
        pintar(r.datos.niveles);
        if (r.datos.perfilNino === false) {
          aviso('Tu cuenta aún no tiene perfil de niño: podrás leer el nivel 1, pero no se guardará tu avance.', 'info', 7000);
        }
      }).catch(function () {
        mostrarError('No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.');
      });
    }

    // Captura el clic antes que cualquier otro script para frenar los niveles bloqueados.
    raiz.addEventListener('click', function (e) {
      var n = e.target && e.target.closest ? e.target.closest('.node') : null;
      if (n && n.getAttribute('data-estado') === 'bloqueado') {
        e.preventDefault();
        e.stopPropagation();
        aviso('¡Completa el cuento anterior para desbloquear este nivel!', 'info');
      }
    }, true);
    $('cc-mapa-reintentar').addEventListener('click', cargar);

    if (exigirSesion()) { cargar(); }
  }

  /* ==================================================================== LECTOR */
  function iniciarLector() {
    var nivel = parseInt(new URLSearchParams(window.location.search).get('nivel'), 10);

    function mostrarError(texto) {
      $('cc-cargando').hidden = true;
      $('cc-lector').hidden = true;
      $('cc-error-texto').textContent = texto;
      $('cc-error').hidden = false;
    }

    if (!exigirSesion()) { return; }
    if (!(nivel >= 1 && nivel <= 99)) { mostrarError('No hay contenido disponible para este nivel.'); return; }

    llamar('/nivel/' + nivel + '?idUsuario=' + encodeURIComponent(idUsuario())).then(function (r) {
      if (r.estado !== 200 || !r.datos.ok || !r.datos.cuento) {
        mostrarError(r.datos.error || 'No se pudo cargar el cuento, intenta de nuevo.');
        return;
      }
      $('cc-cargando').hidden = true;
      $('cc-lector').hidden = false;
      if (r.datos.aviso) {
        var b = $('cc-banner');
        b.textContent = r.datos.aviso;
        b.hidden = false;
      }
      arrancarLector(r.datos.cuento, r.datos.preguntas || [], r.datos.ticket);
    }).catch(function () {
      mostrarError('No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.');
    });
  }

  function arrancarLector(cuento, preguntas, ticket) {
    var lector = $('cc-lector');
    var btnPlay = $('cc-play');
    var btnRevisar = $('cc-revisar');
    var faseCuento = $('cc-fase-cuento');
    var formQuiz = $('cc-form-quiz');
    var elTexto = $('cc-texto');
    var elOpc = $('cc-opciones');
    var elMsg = $('cc-mensaje');
    var elFrase = $('cc-frase');
    var elImgBox = $('cc-escena');

    $('cc-subtitulo').textContent = cuento.tituloNivel;
    document.title = 'Wordy | ' + cuento.tituloNivel;
    var altImg = 'Ilustración de ' + cuento.titulo;
    $('cc-img').alt = altImg;
    elImgBox.setAttribute('data-alt', altImg);
    $('cc-img-quiz').alt = altImg;
    ponerImagen($('cc-img'), cuento.ilustracionInicial);
    ponerImagen($('cc-img-quiz'), cuento.portada);

    var modoQuiz = false;
    var datos = cuento;

    /* ------------------------------------------------------------ ESTADO */
    var estado = {
      i: 0,                   // escena actual
      reproduciendo: false,
      bloqueado: false,       // esperando que el nino elija una palabra
      terminado: false,
      token: 0,               // invalida eventos viejos (pausa / cambio de escena)
      enviando: false,
      enviandoQuiz: false
    };
    var fallosHueco = {};          // escena -> errores
    var palabraResuelta = {};      // escena -> palabra correcta (la devuelve el servidor)
    var temporizador = null;
    var vigilante = null;          // revisa el segundo en que termina una escena (audio unico por cuento)
    var srcActual = '';            // ultimo mp3 cargado (si es el mismo no se vuelve a descargar)

    var audio = new Audio();       // UN solo elemento Audio: asi el navegador deja seguir reproduciendo
    audio.preload = 'auto';        // sin pedir permiso otra vez en cada segmento

    /* --------------------------------------------------------------- TRIVIA */
    var stats = { total: 0, primerIntento: 0, intentos: 0, jugado: false };

    // Dibuja las preguntas (los textos se insertan con textContent: nunca como HTML).
    var lista = $('cc-quiz-lista');
    preguntas.forEach(function (q, qi) {
      var g = document.createElement('div');
      g.className = 'cc-pregunta';
      g.setAttribute('data-id', q.id);
      var t = document.createElement('p');
      t.className = 'cc-pregunta-t';
      t.textContent = (qi + 1) + '. ' + q.enunciado;
      g.appendChild(t);
      var ops = document.createElement('div');
      ops.className = 'cc-pregunta-ops';
      q.opciones.forEach(function (o, oi) {
        var lab = document.createElement('label');
        lab.className = 'cc-quiz-op cc-c' + (oi % 4);
        var inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'p' + q.id;
        inp.value = o.id;
        var sp = document.createElement('span');
        sp.textContent = String.fromCharCode(97 + oi) + ') ' + o.texto;
        lab.appendChild(inp);
        lab.appendChild(sp);
        ops.appendChild(lab);
      });
      g.appendChild(ops);
      lista.appendChild(g);
    });

    function preguntasSinResponder() {
      var faltan = [];
      var grupos = formQuiz.querySelectorAll('.cc-pregunta');
      Array.prototype.forEach.call(grupos, function (g) {
        var marcada = g.querySelector('input[type=radio]:checked');
        g.classList.toggle('cc-sin-responder', !marcada);
        if (!marcada) { faltan.push(g); }
      });
      return faltan;
    }

    formQuiz.addEventListener('change', function (e) {
      var g = e.target && e.target.closest ? e.target.closest('.cc-pregunta') : null;
      if (g) { g.classList.remove('cc-sin-responder'); }
    });

    function enviarTrivia() {
      if (estado.enviandoQuiz) { return; }
      var faltan = preguntasSinResponder();
      if (faltan.length) {
        aviso('Completa la actividad antes de enviar.', 'error');
        faltan[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      var respuestas = {};
      Array.prototype.forEach.call(formQuiz.querySelectorAll('.cc-pregunta'), function (g) {
        respuestas[g.getAttribute('data-id')] = parseInt(g.querySelector('input[type=radio]:checked').value, 10);
      });
      estado.enviandoQuiz = true;
      btnRevisar.classList.add('cc-deshabilitado');
      llamar('/finalizar', {
        idUsuario: idUsuario(),
        idCuento: cuento.id,
        ticket: ticket || '',
        hAciertos: stats.primerIntento,
        hIntentos: stats.intentos,
        respuestas: respuestas
      }).then(function (r) {
        estado.enviandoQuiz = false;
        if (r.estado === 200 && r.datos.ok) { mostrarResultado(r.datos); return; }
        btnRevisar.classList.remove('cc-deshabilitado');
        aviso(r.datos.error || 'Error en la evaluación, intenta de nuevo.', 'error');
      }).catch(function () {
        estado.enviandoQuiz = false;
        btnRevisar.classList.remove('cc-deshabilitado');
        aviso('No pudimos enviar tus respuestas. Revisa tu internet e intenta de nuevo.', 'error');
      });
    }

    function mostrarResultado(res) {
      detenerTodo();
      lector.hidden = true;
      $('cc-res-subtitulo').textContent = res.tituloNivel;
      var est = $('cc-res-estrellas');
      est.setAttribute('aria-label', res.estrellas + ' de 3 estrellas');
      est.innerHTML = '';
      for (var s = 1; s <= 3; s++) {
        var sp = document.createElement('span');
        sp.className = 'cc-estrella' + (s <= res.estrellas ? ' llena' : '');
        sp.textContent = '★';
        est.appendChild(sp);
      }
      $('cc-res-titulo').textContent = res.aciertos === res.total ? '¡Lo hiciste perfecto!'
        : (res.aciertos * 2 >= res.total ? '¡Muy bien, súper lector!' : '¡Buen intento, sigue practicando!');
      var sub = $('cc-res-sub');
      sub.innerHTML = '';
      sub.appendChild(document.createTextNode('Acertaste '));
      var b1 = document.createElement('b'); b1.textContent = res.aciertos; sub.appendChild(b1);
      sub.appendChild(document.createTextNode(' de '));
      var b2 = document.createElement('b'); b2.textContent = res.total; sub.appendChild(b2);
      sub.appendChild(document.createTextNode(' preguntas. ¡Completaste el cuento!'));

      var ul = $('cc-res-lista');
      ul.innerHTML = '';
      res.detalle.forEach(function (d, i) {
        var li = document.createElement('li');
        li.className = d.acerto ? 'ok' : 'mal';
        var ic = document.createElement('span');
        ic.className = 'cc-res-icono';
        ic.setAttribute('aria-hidden', 'true');
        ic.textContent = d.acerto ? '✔' : '✖';
        var cuerpo = document.createElement('span');
        var tt = document.createElement('b');
        tt.textContent = (i + 1) + '. ' + d.enunciado;
        cuerpo.appendChild(tt);
        cuerpo.appendChild(document.createElement('br'));
        if (d.acerto) {
          cuerpo.appendChild(document.createTextNode('¡Correcto! ' + d.correcta));
        } else {
          cuerpo.appendChild(document.createTextNode('Elegiste “' + d.elegida + '”. La respuesta era: '));
          var bc = document.createElement('b'); bc.textContent = d.correcta; cuerpo.appendChild(bc);
          cuerpo.appendChild(document.createTextNode('. ¡Tú puedes!'));
        }
        li.appendChild(ic);
        li.appendChild(cuerpo);
        ul.appendChild(li);
      });
      $('cc-res-guardado').textContent = res.mensaje || '';

      var acc = $('cc-res-acciones');
      acc.innerHTML = '';
      function boton(texto, href, extra) {
        var a = document.createElement('a');
        a.className = 'cc-btn3d cc-btn-chico' + (extra ? ' ' + extra : '');
        a.href = href;
        a.textContent = texto;
        acc.appendChild(a);
      }
      if (res.siguienteNivel) { boton('Siguiente cuento', 'cuentoLeer.html?nivel=' + res.siguienteNivel); }
      boton('Ver el mapa', 'cuentosNiveles.html', 'cc-btn-teal');
      boton('Leer otra vez', 'cuentoLeer.html?nivel=' + res.nivel, 'cc-btn-morado');

      $('cc-resultado-vista').hidden = false;
      window.scrollTo(0, 0);
    }

    function entrarModoQuiz() {
      detenerTodo();
      modoQuiz = true;
      lector.classList.add('cc-modo-quiz');
      faseCuento.hidden = true;
      formQuiz.hidden = false;
      btnRevisar.classList.remove('cc-deshabilitado', 'cc-pulso');
      btnRevisar.setAttribute('aria-disabled', 'false');
      lector.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    btnRevisar.addEventListener('click', function () {
      if (modoQuiz) { enviarTrivia(); return; }
      if (!estado.terminado) {
        aviso('Primero escucha el cuento completo para poder revisar.', 'info');
        return;
      }
      entrarModoQuiz();
    });

    /* ------------------------------------------------------ VALIDACIONES */
    if (!datos || !datos.escenas || !datos.escenas.length) {
      aviso('No se pudo cargar el cuento, intenta de nuevo.', 'error', 9000);
      return;
    }
    var segs = datos.escenas;       // cada escena: texto, audio, [inicio, fin], [ilustracion], [hueco]
    var PUNTUACION = '.,;:!?”»)…';

    /** Une dos trozos de texto cuidando el espacio (no lo pone antes de un signo de puntuacion). */
    function unir(a, b) {
      if (!a) { return b; }
      return a + (b && PUNTUACION.indexOf(b.charAt(0)) >= 0 ? '' : ' ') + b;
    }

    /* ----------------------------------------------- DIBUJAR EL TEXTO */
    var spanSeg = [];
    var spanHueco = [];
    segs.forEach(function (s, i) {
      if (i > 0 && PUNTUACION.indexOf(s.texto.charAt(0)) < 0) {
        elTexto.appendChild(document.createTextNode(' '));
      }
      var sp = document.createElement('span');
      sp.className = 'cc-seg';
      sp.textContent = s.texto;
      elTexto.appendChild(sp);
      spanSeg[i] = sp;

      if (s.hueco) {
        stats.total++;
        elTexto.appendChild(document.createTextNode(' '));
        var h = document.createElement('span');
        h.className = 'cc-hueco';
        h.textContent = '*****';
        elTexto.appendChild(h);
        spanHueco[i] = h;
      }
    });

    function actualizarPlay() {
      btnPlay.classList.toggle('cc-reproduciendo', estado.reproduciendo);
      btnPlay.setAttribute('aria-label', estado.reproduciendo ? 'Pausar el cuento' : 'Escuchar el cuento');
      btnPlay.disabled = estado.terminado;
    }

    function mensaje(texto, tipo) {
      elMsg.textContent = texto;
      elMsg.className = 'cc-mensaje' + (tipo ? ' cc-mensaje-' + tipo : '');
    }

    function marcar(i) {
      spanSeg.forEach(function (s) { s.classList.remove('cc-leyendo'); });
      if (spanSeg[i]) {
        spanSeg[i].classList.add('cc-leyendo');
        spanSeg[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    function desmarcar() { spanSeg.forEach(function (s) { s.classList.remove('cc-leyendo'); }); }

    /* --------------------------------------------------- NARRACION (audio) */
    function detenerTodo() {
      estado.token++;
      clearTimeout(temporizador);
      clearInterval(vigilante);
      try { audio.pause(); } catch (e1) { /* nada */ }
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e2) { /* nada */ }
      }
      estado.reproduciendo = false;
    }

    function pausar() {
      detenerTodo();
      actualizarPlay();
    }

    /** Texto que lee la voz del navegador: la palabra del hueco anterior + el segmento. */
    function textoParaVoz(i) {
      var previa = (i > 0 && palabraResuelta[i - 1]) ? palabraResuelta[i - 1] : '';
      return unir(previa, segs[i].texto).replace(/\s+/g, ' ');
    }

    function hablar(i) {
      detenerTodo();
      var t = estado.token;
      estado.i = i;
      estado.reproduciendo = true;
      actualizarPlay();
      marcar(i);
      mostrarIlustracion(i);
      if (!segs[i].audio) { hablarConVoz(i, t); } else { cargarAudio(i, 0, t); }
    }

    /**
     * Reproduce el audio de la escena.
     *  - Forma A: un .mp3 por escena (url_audio de la escena) -> suena completo.
     *  - Forma B: un .mp3 por cuento + tramo (inicio/fin en segundos) -> salta a "inicio"
     *             y se corta al llegar a "fin".
     * Si falla: aviso + 1 reintento + voz del navegador.
     */
    function cargarAudio(i, intento, t) {
      var s = segs[i];
      var tramo = (typeof s.inicio === 'number' && typeof s.fin === 'number');
      audio.onended = function () { if (t === estado.token) { finSegmento(i); } };
      audio.onerror = function () {
        if (t !== estado.token) { return; }
        srcActual = '';
        if (intento < 1) {
          aviso('No pudimos cargar el audio. Reintentando…', 'error');
          temporizador = setTimeout(function () {
            if (t === estado.token) { cargarAudio(i, intento + 1, t); }
          }, 900);
        } else {
          if (window.console) { console.warn('Audio no disponible: ' + s.audio); }
          aviso('No encontramos el audio. Usaremos la voz del navegador para leerlo.', 'info');
          hablarConVoz(i, t);
        }
      };

      function vigilar() {
        clearInterval(vigilante);
        vigilante = setInterval(function () {
          if (t !== estado.token) { clearInterval(vigilante); return; }
          if (audio.currentTime >= s.fin - 0.03) {
            clearInterval(vigilante);
            try { audio.pause(); } catch (e3) { /* nada */ }
            finSegmento(i);
          }
        }, 80);
      }

      function arrancar() {
        if (t !== estado.token) { return; }
        if (tramo) {
          try { audio.currentTime = s.inicio; } catch (e4) { /* nada */ }
          vigilar();
        }
        var p = audio.play();
        if (p && p.catch) {
          p.catch(function (err) {
            // El navegador exige un clic del usuario antes de reproducir audio.
            if (err && err.name === 'NotAllowedError' && t === estado.token) {
              clearInterval(vigilante);
              estado.reproduciendo = false;
              actualizarPlay();
              aviso('Pulsa ▶ para escuchar el cuento.', 'info');
            }
            // Otros errores (archivo faltante o formato) los atiende audio.onerror
          });
        }
      }

      var ruta = s.audio + (intento ? (s.audio.indexOf('?') < 0 ? '?' : '&') + 'r=' + Date.now() : '');
      if (srcActual === ruta && audio.readyState >= 1) {
        arrancar();                                   // mismo mp3 ya cargado: solo se salta al tramo
      } else {
        srcActual = ruta;
        audio.src = ruta;
        if (tramo) {
          audio.onloadedmetadata = function () { audio.onloadedmetadata = null; arrancar(); };
        } else {
          arrancar();
        }
      }
    }

    /** Respaldo: voz sintetizada del navegador (no necesita archivos). */
    function hablarConVoz(i, t) {
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        lecturaSilenciosa(i, t);
        return;
      }
      var u = new SpeechSynthesisUtterance(textoParaVoz(i));
      u.lang = 'es-MX';
      u.rate = 0.9;
      u.pitch = 1.05;
      var voces = window.speechSynthesis.getVoices() || [];
      for (var k = 0; k < voces.length; k++) {
        if (voces[k].lang && voces[k].lang.toLowerCase().indexOf('es') === 0) { u.voice = voces[k]; break; }
      }
      u.onend = function () { if (t === estado.token) { finSegmento(i); } };
      u.onerror = function () { if (t === estado.token) { lecturaSilenciosa(i, t); } };
      window.__ccVoz = u;      // evita que el navegador lo elimine antes de terminar
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) { window.speechSynthesis.cancel(); }
      window.speechSynthesis.speak(u);
    }

    /** Ultimo recurso: se muestra el texto y se avanza solo despues de un tiempo de lectura. */
    function lecturaSilenciosa(i, t) {
      var ms = Math.max(2500, textoParaVoz(i).length * 55);
      temporizador = setTimeout(function () { if (t === estado.token) { finSegmento(i); } }, ms);
    }

    /* ------------------------------------------------ FIN DE SEGMENTO / HUECOS */
    function finSegmento(i) {
      estado.reproduciendo = false;
      if (segs[i].hueco) { pedirPalabra(i); return; }
      siguiente(i);
    }

    function siguiente(i) {
      if (i + 1 >= segs.length) { terminarCuento(); return; }
      hablar(i + 1);
    }

    /** Muestra la frase del hueco: "antes ____ despues". Si ya hay palabra, la escribe en el espacio. */
    function mostrarFrase(i, palabra) {
      if (!elFrase) { return; }
      var h = segs[i].hueco;
      elFrase.innerHTML = '';
      elFrase.appendChild(document.createTextNode(h.antes + ' '));
      var b = document.createElement('span');
      b.className = 'cc-blanco' + (palabra ? ' resuelto' : '');
      b.textContent = palabra || '____';
      elFrase.appendChild(b);
      elFrase.appendChild(document.createTextNode((h.despues && PUNTUACION.indexOf(h.despues.charAt(0)) < 0 ? ' ' : '') + h.despues));
      elFrase.hidden = false;
    }

    /** Cambia la ilustracion cuando la escena trae una propia (si no, se queda la anterior). */
    var ilustracionActual = (function () { var im = $('cc-img'); return im ? im.getAttribute('src') : ''; })();
    function mostrarIlustracion(i) {
      var ruta = segs[i].ilustracion;
      var fig = elImgBox;
      if (!ruta || !fig || ruta === ilustracionActual) { return; }
      ilustracionActual = ruta;
      var nueva = document.createElement('img');
      nueva.id = 'cc-img';
      nueva.alt = fig.getAttribute('data-alt') || '';
      nueva.src = ruta;
      fig.innerHTML = '';
      fig.appendChild(nueva);
      protegerImagen(nueva);
    }

    function pedirPalabra(i) {
      estado.bloqueado = true;           // la narracion queda en pausa hasta acertar
      actualizarPlay();
      desmarcar();
      spanSeg[i].classList.add('cc-leyendo');
      var h = spanHueco[i];
      h.textContent = '_____';
      h.classList.add('activo');

      mensaje('¿Qué palabra completa la historia?', 'pregunta');
      mostrarFrase(i, null);
      elOpc.innerHTML = '';
      segs[i].hueco.opciones.forEach(function (txt, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cc-op cc-op-' + (k % 4);
        var letra = document.createElement('span');
        letra.className = 'cc-op-letra';
        letra.textContent = String.fromCharCode(97 + k) + ')';
        var tx = document.createElement('span');
        tx.className = 'cc-op-texto';
        tx.textContent = txt;
        b.appendChild(letra);
        b.appendChild(tx);
        b.addEventListener('click', function () { elegir(i, txt, b); });
        elOpc.appendChild(b);
      });
      elOpc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function bloquearOpciones(si) {
      Array.prototype.forEach.call(elOpc.querySelectorAll('.cc-op'), function (b) {
        b.disabled = si || b.classList.contains('incorrecta');
      });
    }

    function validarEnServidor(idHueco, texto) {
      return llamar('/validar', { idHueco: idHueco, respuesta: texto }).then(function (r) {
        if (r.estado === 200) { return r.datos; }
        return { ok: false, error: r.datos.error || 'No se pudo revisar la respuesta' };
      });
    }

    function elegir(i, texto, boton) {
      if (estado.enviando) { return; }
      estado.enviando = true;
      bloquearOpciones(true);
      stats.intentos++;
      stats.jugado = true;
      var previos = fallosHueco[i] || 0;

      validarEnServidor(segs[i].hueco.id, texto).then(function (r) {
        estado.enviando = false;
        if (r.ok) {
          if (!previos) { stats.primerIntento++; }
          resolver(i, r.palabra);
        } else if (r.error) {
          bloquearOpciones(false);
          aviso(r.error + '. Intenta de nuevo.', 'error');
        } else {
          fallosHueco[i] = previos + 1;
          boton.classList.add('incorrecta');
          bloquearOpciones(false);
          mensaje('¡Casi! Inténtalo otra vez, tú puedes.', 'error');
        }
      }).catch(function () {
        estado.enviando = false;
        bloquearOpciones(false);
        aviso('No pudimos revisar tu respuesta. Intenta de nuevo.', 'error');
      });
    }

    function resolver(i, palabra) {
      var h = spanHueco[i];
      h.textContent = palabra;
      h.classList.remove('activo');
      h.classList.add('resuelto');
      palabraResuelta[i] = palabra;
      mostrarFrase(i, palabra);
      elOpc.innerHTML = '';
      mensaje('¡Muy bien! 🌟 Sigamos con el cuento…', 'ok');
      setTimeout(function () {
        estado.bloqueado = false;
        siguiente(i);          // la narracion se reanuda unicamente despues de responder
      }, 1100);
    }

    function terminarCuento() {
      estado.terminado = true;
      estado.reproduciendo = false;
      desmarcar();
      actualizarPlay();
      mensaje('¡Terminaste el cuento! 🎉 Ahora pulsa “Revisar” (arriba a la derecha) para responder las preguntas.', 'ok');
      btnRevisar.classList.remove('cc-deshabilitado');
      btnRevisar.classList.add('cc-pulso');
      btnRevisar.setAttribute('aria-disabled', 'false');
      btnRevisar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ---------------------------------------------------------- CONTROLES */
    btnPlay.addEventListener('click', function () {
      if (estado.terminado) { return; }
      if (estado.bloqueado) { aviso('Elige la palabra correcta para seguir escuchando.', 'info'); return; }
      if (estado.reproduciendo) { pausar(); } else { hablar(estado.i); }   // al reanudar se repite el segmento actual
    });

    window.addEventListener('pagehide', detenerTodo);
    actualizarPlay();
  }

  /* ================================================================== ARRANQUE */
  if (vista === 'mapa')  { iniciarMapa(); }
  if (vista === 'leer')  { iniciarLector(); }
})();
