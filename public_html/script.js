
/* ==========================================================
   WORDY - Validación de formularios (login y registro)
   Conexión con API publicada en Azure
   ========================================================== */

const MODO_DEMO = false;

const API_BASE = 'https://wordy-api-marvin-athheedkfubbh8ez.mexicocentral-01.azurewebsites.net/api';

const CLAVE_SESION = 'wordy_sesion';
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function marcar(campoEl, valido) {
  const contenedor = campoEl.closest('.campo');

  if (contenedor) {
    contenedor.classList.toggle('invalido', !valido);
  }

  return valido;
}

function validarCampo(el) {
  const valor = el.value.trim();

  switch (el.name) {
    case 'tipo_cuenta':
      return marcar(el, valor !== '');

    case 'correo':
      return marcar(el, REGEX_CORREO.test(valor));

    case 'usuario':
      return marcar(
        el,
        el.minLength > 0
          ? valor.length >= el.minLength &&
            valor.length <= el.maxLength
          : valor !== ''
      );

    case 'contrasena':
      return marcar(
        el,
        el.minLength > 0
          ? el.value.length >= el.minLength
          : el.value !== ''
      );

    default:
      return true;
  }
}

function iniciarFormulario(form) {
  if (!form) return;

  const mensaje = form.querySelector('#mensaje');
  const campos = form.querySelectorAll('input, select');

  // Validación mientras el usuario escribe
  campos.forEach(el => {
    el.addEventListener('input', () => {
      if (el.closest('.campo')?.classList.contains('invalido')) {
        validarCampo(el);
      }
    });

    el.addEventListener('change', () => {
      if (el.closest('.campo')?.classList.contains('invalido')) {
        validarCampo(el);
      }
    });
  });

  form.addEventListener('submit', async evento => {
    // Evita que el navegador envíe el formulario por su cuenta
    evento.preventDefault();

    if (!mensaje) {
      console.error('No se encontró el elemento #mensaje.');
      return;
    }

    // Validar todos los campos antes de llamar a Azure
    let todoValido = true;

    campos.forEach(el => {
      if (!validarCampo(el)) {
        todoValido = false;
      }
    });

    if (!todoValido) {
      mensaje.className = 'mensaje error';
      mensaje.textContent = 'Revisa los campos marcados.';
      return;
    }

    // LOGIN
    if (form.id === 'formLogin') {
      mensaje.className = 'mensaje ok';
      mensaje.textContent = 'Conectando con Wordy...';

      const datos = {
        usuario: form.querySelector('[name="usuario"]').value.trim(),
        contrasena: form.querySelector('[name="contrasena"]').value
      };

      try {
        const response = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(datos)
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
          mensaje.className = 'mensaje error';
          mensaje.textContent =
            result.error || 'No se pudo iniciar sesión.';
          return;
        }

        const tipoSeleccionado = form.querySelector('[name="tipo_cuenta"]').value;
        const rolEsperado = ({ estudiante: 3, tutor: 1, psicopedagogo: 4, administrador: 2 })[tipoSeleccionado];
        if (rolEsperado && Number(result.id_rol) !== rolEsperado) {
          mensaje.className = 'mensaje error';
          mensaje.textContent = 'El tipo de cuenta seleccionado no coincide con el perfil registrado.';
          return;
        }

        // Guardar sesión
        const tipoCuenta = form.querySelector('[name="tipo_cuenta"]');

        sessionStorage.setItem(
          CLAVE_SESION,
          JSON.stringify({
            usuario: result.usuario,
            id_usuario: result.id_usuario,
            id_rol: result.id_rol,
            tipo_cuenta: tipoCuenta ? tipoCuenta.value : ''
          })
        );

        mensaje.className = 'mensaje ok';
        mensaje.textContent = '✔ Entrando...';

        const destinos = { 1: 'controlParental.html', 2: 'administrador.html', 3: 'inicio.html', 4: 'avalamiento.html' };
        window.location.href = destinos[Number(result.id_rol)] || 'index.html';

      } catch (error) {
        console.error('Error en login:', error);

        mensaje.className = 'mensaje error';
        mensaje.textContent =
          'No se pudo conectar con Wordy. Revisa tu conexión o la configuración CORS de la API.';
      }

      return;
    }

    // REGISTRO
    if (form.id === 'formRegistro') {
      const botonRegistro = document.querySelector('button[form="formRegistro"]');
      const usuario = form.querySelector('[name="usuario"]')?.value.trim() || '';
      const nombreCampo = form.querySelector('[name="nombre"]'); // El formulario actual no solicita nombre.
      const correo = form.querySelector('[name="correo"]')?.value.trim() || '';

      mensaje.className = 'mensaje ok';
      mensaje.textContent = 'Creando cuenta...';
      if (botonRegistro) {
        botonRegistro.disabled = true;
        botonRegistro.textContent = 'Creando cuenta...';
      }

      const datos = {
        // Si no existe campo nombre, el backend también puede usar el usuario como nombre.
        nombre: nombreCampo?.value.trim() || usuario,
        correo,
        usuario,
        contrasena: form.querySelector('[name="contrasena"]')?.value || '',
        tipo_cuenta: form.querySelector('[name="tipo_cuenta"]')?.value || ''
      };

      const controlador = new AbortController();
      const temporizador = setTimeout(() => controlador.abort(), 25000);

      try {
        const response = await fetch(`${API_BASE}/registro`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(datos),
          signal: controlador.signal
        });

        const textoRespuesta = await response.text();
        let result = {};
        try {
          result = textoRespuesta ? JSON.parse(textoRespuesta) : {};
        } catch (_) {
          throw new Error(`El servidor respondió con un formato inesperado (HTTP ${response.status}).`);
        }

        if (!response.ok || !result.ok) {
          mensaje.className = 'mensaje error';
          mensaje.textContent = result.error || `No se pudo registrar la cuenta (HTTP ${response.status}).`;
          return;
        }

        mensaje.className = 'mensaje ok';
        mensaje.textContent = '✔ Cuenta creada. Redirigiendo al login...';

        setTimeout(() => {
          window.location.href = 'index.html';
        }, 2000);

      } catch (error) {
        console.error('Error en registro:', error);
        mensaje.className = 'mensaje error';
        mensaje.textContent = error.name === 'AbortError'
          ? 'La solicitud tardó demasiado. El servidor no respondió; inténtalo de nuevo.'
          : (error.message || 'No se pudo conectar con Wordy. Revisa tu conexión o la configuración CORS de la API.');
      } finally {
        clearTimeout(temporizador);
        if (botonRegistro && !mensaje.textContent.includes('Cuenta creada')) {
          botonRegistro.disabled = false;
          botonRegistro.textContent = 'Registrar';
        }
      }
    }
  });
}

iniciarFormulario(document.getElementById('formLogin'));
iniciarFormulario(document.getElementById('formRegistro'));
