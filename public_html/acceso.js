/* Wordy: separación de pantallas por perfil */
(() => {
  const KEY = 'wordy_sesion';
  const homes = { 1: 'controlParental.html', 2: 'administrador.html', 3: 'inicio.html', 4: 'avalamiento.html' };
  const path = location.pathname.split('/').pop().toLowerCase();
  const childPages = new Set([
    'inicio.html','cuentos.html','cuentosniveles.html','cuentoleer.html',
    'aprendepalabras.html','palabrasactividad.html','palabrasjugar.html',
    'palabrasselecciona.html','palabras_nv_1.html','palabras_nv_2.html',
    'palabras_nv_3.html','palabras_nv_4.html','palabras_nv_5.html'
  ]);
  const requiredRole = childPages.has(path) ? 3 :
    path === 'controlparental.html' ? 1 :
    path === 'avalamiento.html' ? 4 :
    path === 'administrador.html' ? 2 : null;

  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(KEY)); } catch (_) {}
  if (!session || !Number(session.id_rol)) {
    if (document.body.hasAttribute('data-requiere-sesion')) location.replace('index.html');
    return;
  }

  const role = Number(session.id_rol);
  if (requiredRole && role !== requiredRole) {
    location.replace(homes[role] || 'index.html');
    return;
  }

  // Navegación contextual: no mostrar módulos ajenos al perfil.
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a').forEach(a => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (role !== 3 && (childPages.has(href) || href === 'cuentos.html' || href.startsWith('palabras'))) a.hidden = true;
      if (role !== 1 && href === 'controlparental.html') a.hidden = true;
      if (role !== 4 && href === 'avalamiento.html') a.hidden = true;
      if (role !== 2 && href === 'administrador.html') a.hidden = true;
    });
    const salir = document.getElementById('adminCerrarSesion');
    if (salir) salir.addEventListener('click', () => {
      sessionStorage.removeItem(KEY);
      location.replace('index.html');
    });
  });
})();
