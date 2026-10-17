(() => {
  const $ = s => document.querySelector(s);
  const cinematicEntry=$('#cinematicEntry');
  $('#enterCommand')?.addEventListener('click',()=>{cinematicEntry?.classList.add('is-leaving');setTimeout(()=>cinematicEntry?.remove(),900);});

  const cfg = window.CIA_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_URL.includes('PASTE_') && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
  const client = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const say = (id, msg, good=false) => { const el=$(id); if(el){el.textContent=msg;el.className='message '+(good?'good':'bad');} };
  const toast = msg => {const el=$('#toast'); if(el){el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500)}};
  if(!client){$('#connectionState').textContent='Supabase غير مُعدّ';say('#authMessage','أولاً ضع رابط Supabase والمفتاح العام في config.js، ثم نفّذ supabase/schema.sql.');}
  else {$('#connectionState').textContent='Supabase configured'; refreshAccount();}

  $('#authForm')?.addEventListener('submit', async e=>{
    e.preventDefault(); if(!client)return say('#authMessage','أكمل إعداد Supabase أولاً.');
    const email=$('#authEmail').value.trim(), password=$('#authPassword').value;
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error)return say('#authMessage',error.message);
    say('#authMessage','تم تسجيل الدخول بنجاح.',true); await refreshAccount();
  });
  $('#signUpBtn')?.addEventListener('click', async()=>{
    if(!client)return say('#authMessage','أكمل إعداد Supabase أولاً.');
    const email=$('#authEmail').value.trim(), password=$('#authPassword').value;
    if(!email || password.length<8)return say('#authMessage','أدخل البريد الإلكتروني وكلمة مرور من 8 أحرف على الأقل.');
    const {data,error}=await client.auth.signUp({email,password});
    if(error)return say('#authMessage',error.message);
    say('#authMessage',data.session?'تم إنشاء الحساب. يمكنك الآن تقديم طلبك.':'تم إنشاء الحساب. افحص بريدك لتأكيده، ثم سجّل الدخول.',true); await refreshAccount();
  });
  $('#applicationForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(!client)return say('#applicationMessage','أكمل إعداد Supabase أولاً.');
    const {data:{user}}=await client.auth.getUser(); if(!user)return say('#applicationMessage','خاصك تسجّل الدخول قبل إرسال الطلب.');
    const payload={user_id:user.id,display_name:$('#appName').value.trim(),discord_name:$('#appDiscord').value.trim(),age:Number($('#appAge').value),availability:$('#appHours').value.trim(),skills:$('#appSkills').value.trim(),reason:$('#appReason').value.trim(),skin_image:$('#appSkin').value.trim(),qcm_score:[$('#qcm1').value==='b',$('#qcm2').value==='b',$('#qcm3').value==='a'].filter(Boolean).length,status:'pending'};
    if(payload.qcm_score<2)return say('#applicationMessage','ما نجحتيش فاختبار القبول (خاص جوج أجوبة صحيحة على الأقل). راجع قوانين RP وعاود حاول.');
    const {error}=await client.from('applications').insert(payload);
    if(error)return say('#applicationMessage',error.code==='23505'?'عندك طلب سابق. انتظر قرار الإدارة.':error.message);
    await client.from('profiles').update({display_name:payload.display_name,skin_image:payload.skin_image}).eq('id',user.id);
    $('#applicationForm').reset(); say('#applicationMessage','تسيفط الطلب بنجاح. غادي تراجعو الإدارة.',true); await refreshAccount();
  });
  $('#logoutBtn')?.addEventListener('click',async()=>{if(client)await client.auth.signOut();await refreshAccount();toast('تم تسجيل الخروج');});
  // Admin entry gate: this is a front-door code, not a replacement for Supabase admin authorization.
  $('#toggleAdminCode')?.addEventListener('click',()=>{const field=$('#adminGateCode');if(field)field.type=field.type==='password'?'text':'password';});
  $('#adminGateForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); const field=$('#adminGateCode'); const message=$('#adminGateMessage');
    if(field.value.trim()!=='1937'){if(message){message.textContent='رمز الوصول غير صحيح.';message.className='message bad';}field.classList.remove('shake');void field.offsetWidth;field.classList.add('shake');return;}
    if(message){message.textContent='الرمز صحيح. جارٍ التحقق من صلاحيات حساب الإدارة…';message.className='message good';}
    if(!client){if(message)message.textContent='الرمز صحيح، لكن لوحة الإدارة تحتاج إعداد Supabase أولاً. راجع config.js و supabase/schema.sql.';return;}
    const {data:{user}}=await client.auth.getUser();
    if(!user){if(message)message.textContent='الرمز صحيح. سجّل الدخول بحساب الإدارة أولاً، ثم عاود فتح البوابة.';$('#authEmail')?.focus();return;}
    const {data:profile,error}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
    if(error||profile?.role!=='admin'){if(message)message.textContent='الحساب الحالي ما عندوش صلاحية الإدارة. استعمل حساب الإدارة المصرّح به.';return;}
    location.href='admin.html';
  });
  async function refreshAccount(){
    const box=$('#accountState'); if(!client){if(box)box.textContent='Supabase غير مُعدّ بعد.';return;}
    const {data:{user}}=await client.auth.getUser();
    if(!user){if(box)box.textContent='سجّل الدخول لعرض حالة حسابك وإرسال طلب الانضمام.';return;}
    const {data:profile}=await client.from('profiles').select('display_name,role,status,badge,rank,skin_image').eq('id',user.id).maybeSingle();
    const {data:apps}=await client.from('applications').select('status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1);
    const status=profile?.status||'pending'; const labels={pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض'};
    if(box){box.innerHTML=`<b>${esc(profile?.display_name||user.email)}</b><p>الحالة: <span class="${status==='approved'?'good':status==='rejected'?'bad':''}">${labels[status]||status}</span></p><p>البريد: ${esc(user.email)}</p>${profile?.role==='admin'?'<p><a class="btn danger" href="admin.html">فتح لوحة الإدارة ↗</a></p>':''}${status==='approved'?`<p>الرتبة: <b>${esc(profile?.rank||'Agent 1')}</b> · البادج: <b>${esc(profile?.badge||'AGENT')}</b></p><p><a class="btn primary" href="members.html">دخول بوابة الأعضاء ↗</a></p>`:''}${apps?.length?`<p class="small-note">آخر طلب: ${new Date(apps[0].created_at).toLocaleString()}</p>`:''}`;}
  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  // Minimal language switch for the main navigation and core headings.
  const translations={en:{nav:['Home','Access','About'],hero:['Command Center','and Covert Operations'],enter:'Enter Portal',learn:'Explore Division',section:'Access Portal',desc:'Create an account or sign in. Internal access requires administrator approval.'},es:{nav:['Inicio','Acceso','Acerca de'],hero:['Centro de mando','y operaciones'],enter:'Entrar al portal',learn:'Explorar división',section:'Portal de acceso',desc:'Crea una cuenta o inicia sesión. El acceso interno requiere aprobación.'}};
  $('#language')?.addEventListener('change',e=>{const lang=e.target.value;document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';if(lang==='ar'){location.reload();return;}const t=translations[lang];if(!t)return;const nav=$('.topbar nav');if(nav)nav.querySelectorAll('a').forEach((a,i)=>a.textContent=t.nav[i]);const h=$('.hero h1');if(h)h.innerHTML=`${t.hero[0]}<br><em>${t.hero[1]}</em>`;const buttons=$('.hero-actions');if(buttons){buttons.querySelectorAll('a')[0].textContent=t.enter;buttons.querySelectorAll('a')[1].textContent=t.learn;}const sh=$('.section-heading');if(sh){sh.querySelector('h2').textContent=t.section;sh.querySelector('p').textContent=t.desc;}});
})();
