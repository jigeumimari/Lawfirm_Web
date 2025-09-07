/* --- Users submit: label-based, form-agnostic --- */
function textOf(n){ return (n?.textContent||'').trim().toLowerCase(); }
function valueByLabel(container, keys){
  const labs = Array.from(container.querySelectorAll('label'));
  for (const lab of labs){
    const t = textOf(lab.querySelector('span, .label, .field-label, .form-label, label'));
    if (!t) continue;
    if (keys.some(k => t.includes(k))) {
      const ctl = lab.querySelector('input, select, textarea');
      if (ctl && typeof ctl.value !== 'undefined') return ctl.value;
    }
  }
  return '';
}

async function submitUserStrong(e){
  e?.preventDefault();
  const dlg = document.querySelector('#userDialog') || document;
  // First, try explicit selectors
  let full_name = (document.querySelector('#userFullName, #newUserFullName, .user-full-name, input[name="full_name"]')?.value||'').trim();
  let email     = (document.querySelector('#userEmail, #newUserEmail, .user-email, input[type="email"], input[name="email"]')?.value||'').trim().toLowerCase();
  let password  = (document.querySelector('#userPassword, #tempPassword, .user-password, input[type="password"], input[name="password"]')?.value||'');
  let role      = (document.querySelector('#userRole, .user-role, select[name="role"]')?.value||'') || 'client';
  let status    = (document.querySelector('#userStatus, .user-status, select[name="status"]')?.value||'') || 'active';

  // Fallback: by label text inside the dialog
  if (!full_name) full_name = valueByLabel(dlg, ['full name','name']);
  if (!email)     email     = valueByLabel(dlg, ['email']);
  if (!password)  password  = valueByLabel(dlg, ['temp password','password']);
  if (!role)      role      = valueByLabel(dlg, ['role']) || 'client';
  if (!status)    status    = valueByLabel(dlg, ['status']) || 'active';

  if (!full_name || !email || !password){
    console.warn('User form missing fields',{full_name,email,password});
    toast('Fill name, email, password');
    return;
  }

  try{
    await api('users.php', { method:'POST', body:{ full_name, email, password, role, status } });
    toast('User created');
    document.querySelector('#userDialog [type="reset"]')?.click();
    document.querySelector('#userDialog')?.close?.();
    refreshUsers?.();
  }catch(err){
    console.error(err);
    toast(err.message || 'Failed to create user');
  }
}

/* Attach fallback listener as well */
window.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#userForm');
  const btn  = document.querySelector('#userDialog .btn.primary, #userDialog button[type="submit"]');
  if (form && !form.__userSubmitWired){
    form.addEventListener('submit', submitUserStrong);
    form.__userSubmitWired = true;
  }
  if (btn && !btn.__userSubmitWired){
    btn.addEventListener('click', submitUserStrong);
    btn.__userSubmitWired = true;
  }
});
