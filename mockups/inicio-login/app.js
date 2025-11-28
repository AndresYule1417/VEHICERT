(function(){
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const consent = document.getElementById('consentCheck');
  const btnEmail = document.getElementById('btnLoginEmail');
  const btnGoogle = document.getElementById('btnGoogle');
  const btnWhatsapp = document.getElementById('btnWhatsapp');
  const form = document.getElementById('emailForm');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const emailError = document.getElementById('emailError');
  const passError = document.getElementById('passwordError');
  const recaptchaNotice = document.getElementById('recaptchaNotice');
  const chips = document.querySelectorAll('.chip');
  const pendingBox = document.getElementById('pendingApproval');
  const pendingRoleSpan = document.querySelector('[data-pending-role]');

  let role = 'usuario';
  let failedAttempts = 0;

  function setButtonsEnabled(enabled){
    [btnEmail, btnGoogle, btnWhatsapp].forEach(b=> b.disabled = !enabled);
  }

  consent?.addEventListener('change', ()=> setButtonsEnabled(consent.checked));

  document.addEventListener('click', (e)=>{
    const t = e.target;
    if (t && t.matches('[data-open-modal]')){
      const id = t.getAttribute('data-open-modal');
      const dlg = document.getElementById(id);
      dlg?.showModal();
    }
  });

  chips.forEach(ch => ch.addEventListener('click', ()=>{
    const pressed = ch.getAttribute('aria-pressed') === 'true';
    chips.forEach(c=> c.setAttribute('aria-pressed','false'));
    if (!pressed){
      ch.setAttribute('aria-pressed','true');
      role = ch.dataset.role; // 'usuario' | 'compraventa' | 'concesionario' | 'taller'
    } else {
      role = 'usuario';
    }
    if (role === 'usuario') pendingBox.hidden = true;
  }));

  function simulateAuth0Redirect(provider){
    if (!consent.checked){
      alert('Debes aceptar el consentimiento para continuar.');
      return;
    }
    const roleMsg = role ? ` (perfil: ${role})` : '';
    alert(`Simulando redirección a Auth0 con ${provider}${roleMsg}...`);
    if (role === 'taller' || role === 'concesionario' || role === 'compraventa'){
      pendingRoleSpan.textContent = role;
      pendingBox.hidden = false;
    }
  }

  btnGoogle?.addEventListener('click', ()=> simulateAuth0Redirect('Google'));
  btnWhatsapp?.addEventListener('click', ()=> simulateAuth0Redirect('WhatsApp'));

  form?.addEventListener('submit', (e)=>{
    e.preventDefault();
    emailError.textContent = '';
    passError.textContent = '';

    const email = emailEl.value.trim();
    const pass = passEl.value.trim();

    let ok = true;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      emailError.textContent = 'Ingresa un correo válido.';
      ok = false;
    }
    if (!pass || pass.length < 6){
      passError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      ok = false;
    }
    if (!consent.checked){
      alert('Debes aceptar el consentimiento para continuar.');
      ok = false;
    }

    if (!ok){
      failedAttempts++;
      if (failedAttempts >= 2){
        recaptchaNotice.hidden = false;
      }
      return;
    }

    alert('Simulando autenticación con Auth0 (correo/contraseña)...');
    if (role === 'taller' || role === 'concesionario' || role === 'compraventa'){
      pendingRoleSpan.textContent = role;
      pendingBox.hidden = false;
    }
  });
})();
