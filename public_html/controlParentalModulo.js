(() => {
  const API_BASE =
    window.WORDY_API_BASE ||
    "https://wordy-api-marvin-athheedkfubbh8ez.mexicocentral-01.azurewebsites.net/api";

  const vistaVinc = document.getElementById("vistaVinc");
  const vistaProg = document.getElementById("vistaProg");

  const formito = document.getElementById("formito");
  const usuito = document.getElementById("usuito");
  const passcito = document.getElementById("passcito");
  const corrito = document.getElementById("corrito");
  const botoncito = document.getElementById("botoncito");
  const mensajeCtrl = document.getElementById("mensajeCtrl");

  const nombreNinoVinculado = document.getElementById("nombreNinoVinculado");

  const tvEstrellasCuentos = document.getElementById("tvEstrellasCuentos");
  const tvIntentosCuentos = document.getElementById("tvIntentosCuentos");
  const tvAciertosCuentos = document.getElementById("tvAciertosCuentos");
  const tvNivelCuentos = document.getElementById("tvNivelCuentos");

  const tvEstrellasPalabras = document.getElementById("tvEstrellasPalabras");
  const tvIntentosPalabras = document.getElementById("tvIntentosPalabras");
  const tvAciertosPalabras = document.getElementById("tvAciertosPalabras");
  const tvNivelPalabras = document.getElementById("tvNivelPalabras");

  const avisoEl = document.getElementById("aviso");
  let avisoTimer = null;

  // ==================== SESIÓN Y ROL ====================
  function leerObjetoSesion() {
    if (typeof obtenerSesion === "function") {
      const s = obtenerSesion();
      if (s) return s;
    }
    const keys = ["wordy_sesion", "sesion", "usuario", "wordy_usuario", "perfil"];
    for (const k of keys) {
      const raw = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return parsed.usuario || parsed.data || parsed.perfil || parsed;
        }
      } catch (_) {
        // Ignorar valores que no sean JSON
      }
    }
    return null;
  }

  function esCuentaEstudiante(sesion) {
    if (!sesion) return false;
    const rol = String(
      sesion.tipo_cuenta ||
        sesion.tipoCuenta ||
        sesion.rol ||
        sesion.tipoUsuario ||
        sesion.tipo_usuario ||
        sesion.tipo ||
        sesion.perfil ||
        ""
    )
      .trim()
      .toLowerCase();

    if (["estudiante", "nino", "niño", "hijo", "alumno", "kid", "child"].includes(rol)) {
      return true;
    }
    if (typeof sesion.esNino === "boolean") return sesion.esNino;
    if (typeof sesion.esTutor === "boolean") return !sesion.esTutor;
    return false;
  }

  function obtenerIdTutor(sesion) {
    if (!sesion) return "";
    const id =
      sesion.id_usuario ??
      sesion.idUsuario ??
      sesion.idTutor ??
      sesion.id_tutor ??
      sesion.id ??
      "";
    return id !== undefined && id !== null && String(id) !== "" ? String(id) : "";
  }

  function aplicarVisibilidadControlParental(sesion) {
    const esEstudiante = esCuentaEstudiante(sesion);

    document
      .querySelectorAll('#menuPanel a[href*="controlParental"], #linkControlParental, [data-solo-tutor="true"]')
      .forEach((el) => {
        el.hidden = esEstudiante;
        el.style.display = esEstudiante ? "none" : "";
      });

    if (esEstudiante && document.body.classList.contains("pagina-control-parental")) {
      vistaVinc?.classList.add("oculto");
      vistaProg?.classList.add("oculto");
      mostrarAviso("El módulo de Control parental solo está disponible para cuentas de tutor.");
      return false;
    }
    return true;
  }

  // ==================== AVISOS Y VALIDACIÓN ====================
  function mostrarAviso(texto) {
    if (!avisoEl) return;
    avisoEl.textContent = texto;
    avisoEl.classList.add("visible");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => {
      avisoEl.classList.remove("visible");
    }, 3200);
  }

  function setMensajeFormulario(texto, tipo = "") {
    if (!mensajeCtrl) return;
    mensajeCtrl.textContent = texto || "";
    mensajeCtrl.classList.remove("error", "ok");
    if (tipo) mensajeCtrl.classList.add(tipo);
  }

  function limpiarErrorCampo(input) {
    input?.closest(".campo")?.classList.remove("invalido");
  }

  function marcarErrorCampo(input, textoError) {
    const campo = input?.closest(".campo");
    const spanError = campo?.querySelector(".error");
    if (spanError && textoError) spanError.textContent = textoError;
    campo?.classList.add("invalido");
    input?.focus();
  }

  // ==================== PETICIONES API ====================
  async function apiGet(ruta) {
    const base = API_BASE.replace(/\/+$/, "");
    const resp = await fetch(`${base}/${ruta.replace(/^\/+/, "")}`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || data.mensaje || `Error ${resp.status}`);
    }
    return data;
  }

  async function apiPost(ruta, cuerpo) {
    const base = API_BASE.replace(/\/+$/, "");
    const resp = await fetch(`${base}/${ruta.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(cuerpo)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || data.mensaje || `Error ${resp.status}`);
    }
    return data;
  }

  // ==================== VINCULACIÓN ====================
  async function cargarVinculados(idTutor) {
    try {
      const query = idTutor ? `?idTutor=${encodeURIComponent(idTutor)}` : "";
      const json = await apiGet(`nino/vinculados${query}`);
      const ninos = Array.isArray(json.ninos) ? json.ninos : [];
      if (ninos.length === 0) {
        vistaProg?.classList.add("oculto");
        vistaVinc?.classList.remove("oculto");
        return;
      }
      mostrarNino(ninos[0]);
    } catch (_) {
      vistaProg?.classList.add("oculto");
      vistaVinc?.classList.remove("oculto");
    }
  }

  function validarFormulario() {
    [usuito, passcito, corrito].forEach(limpiarErrorCampo);
    setMensajeFormulario("");

    const usuario = (usuito?.value || "").trim();
    const contrasena = passcito?.value || "";
    const correo = (corrito?.value || "").trim();

    if (!usuario) {
      marcarErrorCampo(usuito, "Ingresa el usuario del niño.");
      return null;
    }
    if (!contrasena) {
      marcarErrorCampo(passcito, "Ingresa la contraseña del niño.");
      return null;
    }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      marcarErrorCampo(corrito, "Escribe un correo válido (o déjalo vacío).");
      return null;
    }

    return { usuario, contrasena, correo };
  }

  async function intentarVincular(event) {
    event.preventDefault();
    const datos = validarFormulario();
    if (!datos) return;

    const sesion = leerObjetoSesion();
    const idTutor = obtenerIdTutor(sesion);

    botoncito.disabled = true;
    const textoOriginal = botoncito.textContent;
    botoncito.textContent = "Vinculando...";

    try {
      const cuerpo = {
        usuarioNino: datos.usuario,
        contrasenaNino: datos.contrasena,
        correoNino: datos.correo
      };
      if (idTutor) cuerpo.idTutor = idTutor;

      const json = await apiPost("nino/vincular", cuerpo);

      if (!json.ok) {
        setMensajeFormulario(json.error || "No se pudo vincular.", "error");
        return;
      }

      formito.reset();
      setMensajeFormulario("Perfil vinculado", "ok");
      mostrarAviso("Perfil vinculado");
      mostrarNino(json.nino);
    } catch (err) {
      setMensajeFormulario(err.message || "No se encontró ningún niño con ese usuario.", "error");
      mostrarAviso(err.message || "Error al vincular.");
    } finally {
      botoncito.disabled = false;
      botoncito.textContent = textoOriginal;
    }
  }

  // ==================== PROGRESO ====================
  function mostrarNino(nino) {
    if (!nino) return;

    vistaVinc?.classList.add("oculto");
    vistaProg?.classList.remove("oculto");

    const nombre = (nino.nombre || nino.usuario || "Niño vinculado").trim();
    if (nombreNinoVinculado) {
      nombreNinoVinculado.textContent = nombre;
    }

    const idNino = nino.idUsuario ?? nino.id_usuario ?? nino.id ?? "";
    tvEstrellasCuentos.textContent = "…";
    tvEstrellasPalabras.textContent = "…";

    cargarCuentos(idNino);
    cargarPalabras(idNino);
  }

  async function cargarCuentos(idNino) {
    try {
      const json = await apiGet(`cuentos/progreso/${encodeURIComponent(idNino)}`);
      const filas = Array.isArray(json.filas) ? json.filas : [];

      let estrellas = 0;
      let intentos = 0;
      let aciertos = 0;
      let nivel = 0;

      for (const f of filas) {
        estrellas += Number(f.estrellas || 0);
        const a = Number(f.aciertosHuecos || 0) + Number(f.aciertosPreguntas || 0);
        const e = Number(f.erroresHuecos || 0) + Number(f.erroresPreguntas || 0);
        aciertos += a;
        intentos += a + e;
        nivel = Math.max(nivel, Number(f.nivel || 0));
      }

      tvEstrellasCuentos.textContent = String(estrellas);
      tvIntentosCuentos.textContent = String(intentos);
      tvAciertosCuentos.textContent = String(aciertos);
      tvNivelCuentos.textContent = nivel === 0 ? "Aún no hay progreso registrado" : String(nivel);
    } catch (err) {
      tvEstrellasCuentos.textContent = "0";
      tvIntentosCuentos.textContent = "0";
      tvAciertosCuentos.textContent = "0";
      tvNivelCuentos.textContent = err.message || "Sin datos";
    }
  }

  async function cargarPalabras(idNino) {
    try {
      const json = await apiGet(`palabras/progreso/${encodeURIComponent(idNino)}`);

      const aciertos = Number(json.aciertos || 0);
      const errores = Number(json.errores || 0);
      const estrellas = Number(json.estrellas || 0);

      let nivel = 0;
      const niveles = Array.isArray(json.niveles) ? json.niveles : [];
      for (const n of niveles) {
        if (String(n.estado || "") !== "bloqueado") {
          nivel = Math.max(nivel, Number(n.nivel || 0));
        }
      }

      const coleccion = Array.isArray(json.palabrasDesbloqueadas)
        ? json.palabrasDesbloqueadas
        : [];
      const palabras = coleccion.length;

      tvEstrellasPalabras.textContent = String(estrellas);
      tvIntentosPalabras.textContent = String(aciertos + errores);
      tvAciertosPalabras.textContent = String(aciertos);

      if (aciertos + errores === 0) {
        tvNivelPalabras.textContent = "Aún no hay progreso registrado";
      } else {
        tvNivelPalabras.textContent = `${Math.max(1, nivel)} · ${palabras} palabras`;
      }
    } catch (err) {
      tvEstrellasPalabras.textContent = "0";
      tvIntentosPalabras.textContent = "0";
      tvAciertosPalabras.textContent = "0";
      tvNivelPalabras.textContent = err.message || "Sin datos";
    }
  }

  // ==================== INICIALIZACIÓN ====================
  [usuito, passcito, corrito].forEach((input) => {
    input?.addEventListener("input", () => {
      limpiarErrorCampo(input);
      setMensajeFormulario("");
    });
  });

  document.addEventListener("DOMContentLoaded", () => {
    const sesion = leerObjetoSesion();
    const permitido = aplicarVisibilidadControlParental(sesion);
    if (!permitido) return;

    vistaProg?.classList.add("oculto");
    vistaVinc?.classList.remove("oculto");
    formito?.addEventListener("submit", intentarVincular);
    cargarVinculados(obtenerIdTutor(sesion));
  });
})();