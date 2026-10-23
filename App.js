
(() => {
  const $ = id => document.getElementById(id);
  const money = n => '৳ ' + new Intl.NumberFormat('bn-BD',{
    maximumFractionDigits:2
  }).format(Number(n || 0));

  let db = null;
  let session = null;

  function msg(id, text, error=false) {
    $(id).textContent = text;
    $(id).style.color = error ? '#b42332' : '#08784f';
  }

  function safe(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }

  async function loadTransactions() {
    if (!db) {
      msg('accountStatus','Supabase সংযোগ চালু করা হয়নি। config.js পরীক্ষা করুন।',true);
      return;
    }

    const {data,error} = await db.from('transactions')
      .select('transaction_date,description,kind,amount')
      .order('transaction_date',{ascending:false})
      .limit(500);

    if (error) {
      msg('accountStatus','হিসাব লোড হয়নি। Supabase SQL ও RLS পরীক্ষা করুন।',true);
      console.error(error);
      return;
    }

    let income=0, expense=0;
    for (const t of data || []) {
      if (t.kind === 'income') income += Number(t.amount);
      else expense += Number(t.amount);
    }

    $('totalIn').textContent = money(income);
    $('totalOut').textContent = money(expense);
    $('balance').textContent = money(income-expense);
    msg('accountStatus',`মোট ${data.length}টি সাম্প্রতিক লেনদেন`);

    $('transactions').innerHTML = data.length
      ? data.map(t => `<tr>
          <td>${safe(t.transaction_date)}</td>
          <td>${safe(t.description)}</td>
          <td>${t.kind==='income'?'জমা / আয়':'খরচ'}</td>
          <td>${t.kind==='income'?'+':'−'} ${money(t.amount)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4">এখনো কোনো লেনদেন নেই।</td></tr>';
  }

  async function checkRole() {
    $('adminForm').hidden = true;
    if (!db || !session) return;

    const {data,error} = await db.from('user_roles')
      .select('role')
      .eq('user_id',session.user.id)
      .maybeSingle();

    if (error) {
      msg('roleStatus','অনুমতি যাচাই করা যায়নি।',true);
      return;
    }

    if (data && ['finance_admin','super_admin'].includes(data.role)) {
      $('adminForm').hidden = false;
      msg('roleStatus','অনুমোদিত হিসাব পরিচালনাকারী।');
    } else {
      msg('roleStatus','আপনার অ্যাকাউন্টে হিসাব পরিবর্তনের অনুমতি নেই।');
    }
  }

  function updateLogin() {
    $('loginBtn').hidden = !!session;
    $('logoutBtn').hidden = !session;
    $('admin').hidden = !session;

    if (session) {
      msg('loginStatus','লগইন হয়েছে: '+session.user.email);
    } else {
      msg('loginStatus','হিসাব পরিচালনার জন্য অনুমোদিত অ্যাকাউন্ট দিয়ে লগইন করুন।');
    }
  }

  async function login() {
    if (!db) {
      msg('loginStatus','আগে config.js-এ Supabase URL ও public key বসান।',true);
      return;
    }
    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) {
      msg('loginStatus','ইমেইল ও পাসওয়ার্ড লিখুন।',true);
      return;
    }

    $('loginBtn').disabled = true;
    const {data,error} = await db.auth.signInWithPassword({email,password});
    $('loginBtn').disabled = false;

    if (error) {
      msg('loginStatus','লগইন ব্যর্থ। ইমেইল, পাসওয়ার্ড ও Auth সেটিংস পরীক্ষা করুন।',true);
      return;
    }

    session = data.session;
    updateLogin();
    await checkRole();
  }

  async function logout() {
    if (db) await db.auth.signOut();
    session = null;
    updateLogin();
    $('admin').hidden = true;
  }

  async function addTransaction() {
    if (!db || !session) return;

    const description = $('txDesc').value.trim();
    const amount = Number($('txAmount').value);
    const kind = $('txType').value;
    const date = $('txDate').value ||
      new Date().toISOString().slice(0,10);

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      msg('adminStatus','বিবরণ ও শূন্যের চেয়ে বেশি পরিমাণ দিন।',true);
      return;
    }

    $('saveTx').disabled = true;
    const {error} = await db.from('transactions').insert({
      transaction_date:date,
      description,
      amount,
      kind,
      created_by:session.user.id
    });
    $('saveTx').disabled = false;

    if (error) {
      msg('adminStatus','লেনদেন যোগ হয়নি। আপনার অনুমতি ও ডেটাবেস পরীক্ষা করুন।',true);
      console.error(error);
      return;
    }

    $('txDesc').value = '';
    $('txAmount').value = '';
    msg('adminStatus','লেনদেন সফলভাবে যোগ হয়েছে।');
    await loadTransactions();
  }

  async function start() {
    if (!window.supabase ||
        !window.SUPABASE_URL ||
        !window.SUPABASE_ANON_KEY ||
        window.SUPABASE_URL.includes('আপনার-') ||
        window.SUPABASE_ANON_KEY.includes('আপনার-')) {
      updateLogin();
      msg('accountStatus','প্রথমে config.js-এ Supabase সংযোগ বসান।');
      $('transactions').innerHTML =
        '<tr><td colspan="4">সংযোগের পর লেনদেন এখানে দেখা যাবে।</td></tr>';
      return;
    }

    db = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY
    );

    const {data} = await db.auth.getSession();
    session = data.session;
    updateLogin();
    await checkRole();
    await loadTransactions();

    db.auth.onAuthStateChange((_event,newSession) => {
      session = newSession;
      setTimeout(async () => {
        updateLogin();
        await checkRole();
      },0);
    });
  }

  $('loginBtn').addEventListener('click',login);
  $('logoutBtn').addEventListener('click',logout);
  $('saveTx').addEventListener('click',addTransaction);
  $('password').addEventListener('keydown',e => {
    if (e.key === 'Enter') login();
  });

  start();
})();
