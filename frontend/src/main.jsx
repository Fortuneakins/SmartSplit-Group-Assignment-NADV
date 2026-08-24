import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const money = (n) => `R${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortId = (id) => id ? `${id.slice(0, 6)}…${id.slice(-4)}` : '—';

async function api(path, options = {}) {
  const token = localStorage.getItem('smartsplit_token');
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function Icon({ name, size = 20 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z"/><path d="M8 9h8M8 13h6"/></>,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 15h.01"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    x: <><path d="M6 6l12 12M18 6L6 18"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"/></>,
    bolt: <><path d="m13 2-9 12h7l-1 8 9-12h-7z"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    chevron: <><path d="m9 18 6-6-6-6"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Logo() {
  return <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div><div><strong>SmartSplit</strong><small>SETTLE SMARTER</small></div></div>;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;

  return (
    <div className={`toast ${toast.type || 'success'}`}>
      <Icon
        name={toast.type === 'error' ? 'x' : 'check'}
        size={17}
      />

      <span>{toast.message}</span>

      <button onClick={onClose}>×</button>
    </div>
  );
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem('smartsplit_token', data.token);
      localStorage.setItem('smartsplit_user', JSON.stringify(data.user));
      onAuth(data.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="auth-page">
    <div className="auth-visual">
      <div className="visual-grid"></div><Logo/>
      <div className="visual-copy"><div className="eyebrow">GROUP EXPENSES, REIMAGINED</div><h1>Stop chasing IOUs.<br/><em>Start settling smarter.</em></h1><p>Track shared expenses, understand balances, and let SmartSplit calculate the minimum payment plan.</p></div>
      <div className="visual-stat"><div><strong>1</strong><span>gateway</span></div><div><strong>3</strong><span>services</span></div><div><strong>0</strong><span>payment chaos</span></div></div>
    </div>
    <div className="auth-panel"><div className="auth-box"><div className="mobile-brand"><Logo/></div><div className="auth-kicker">WELCOME TO SMARTSPLIT</div><h2>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2><p className="muted">{mode === 'login' ? 'Sign in to continue managing your groups.' : 'Set up your account and start splitting expenses.'}</p>
      <form onSubmit={submit}>
        {mode === 'register' && <label>Full name<input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} placeholder="e.g. Fortune Akinlaja"/></label>}
        <label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/></label>
        <label>Password<input required minLength={8} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Minimum 8 characters"/></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <Icon name="arrow" size={18}/></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? 'New to SmartSplit?' : 'Already have an account?'} <button onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></div>
      <div className="auth-note"><Icon name="shield" size={16}/> JWT-secured through the SmartSplit API Gateway</div>
    </div></div>
  </div>;
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('smartsplit_user') || 'null'));
  const [toast, setToast] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const notify = (message, type='success') => { setToast({message,type}); setTimeout(()=>setToast(null), 4000); };
  const loadGroups = async () => {
    setLoading(true);
    try { const data = await api('/api/groups'); setGroups(data); if (!selectedGroup && data[0]) setSelectedGroup(data[0]); else if (selectedGroup) setSelectedGroup(data.find(g=>g.id===selectedGroup.id) || data[0] || null); }
    catch (e) { notify(e.message, 'error'); if (/401|403/.test(e.message)) logout(); } finally { setLoading(false); }
  };
  useEffect(()=>{ if(user) loadGroups(); }, [user]);
  const logout = () => { localStorage.removeItem('smartsplit_token'); localStorage.removeItem('smartsplit_user'); setUser(null); setGroups([]); setSelectedGroup(null); };
  if (!user) return <Auth onAuth={u=>{setUser(u);notify('Welcome to SmartSplit');}}/>;
  return <Shell toast={toast} user={user} groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} page={page} setPage={p=>{setPage(p);setMobileOpen(false)}} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} logout={logout} loadGroups={loadGroups} loading={loading} notify={notify} />;
}

function Shell({ toast, user, groups, selectedGroup, setSelectedGroup, page, setPage, mobileOpen, setMobileOpen, logout, loadGroups, loading, notify }) {
  return <div className="app-shell"><aside className={`sidebar ${mobileOpen?'open':''}`}><div className="side-top"><Logo/><button className="close-mobile" onClick={()=>setMobileOpen(false)}><Icon name="x"/></button></div><nav>
    <div className="nav-label">WORKSPACE</div>
   <NavItem
  icon="grid"
  label="Overview"
  active={page === 'dashboard'}
  onClick={() => setPage('dashboard')}
/>

<NavItem
  icon="receipt"
  label="Expenses"
  active={page === 'expenses'}
  onClick={() => setPage('expenses')}
/>

<NavItem
  icon="wallet"
  label="Balances & Settle"
  active={page === 'settlement'}
  onClick={() => setPage('settlement')}
/>

<NavItem
  icon="users"
  label="Members"
  active={page === 'members'}
  onClick={() => setPage('members')}
/>

<NavItem
  icon="users"
  label="Groups"
  active={page === 'groups'}
  onClick={() => setPage('groups')}
/>
 <div className="nav-label group-label">YOUR GROUPS</div>
    {groups.length === 0 && <div className="empty-nav">No groups yet</div>}
    {groups.slice(0,5).map(g=><button key={g.id} className={`group-nav ${selectedGroup?.id===g.id?'active':''}`} onClick={()=>{setSelectedGroup(g);setPage('dashboard')}}><span className="group-dot"></span>{g.name}</button>)}
  </nav><div className="side-bottom"><div className="system-status"><span></span><div><strong>System online</strong><small>API Gateway · :3000</small></div></div><button className="logout" onClick={logout}><Icon name="logout" size={17}/> Sign out</button></div></aside>
  <main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobileOpen(true)}><Icon name="menu"/></button><div className="crumb"><span>SmartSplit</span><b>/</b><strong>{pageTitle(page)}</strong></div><div className="top-actions"><div className="gateway-pill"><span></span> Gateway connected</div><div className="avatar">{initials(user.fullName)}</div><div className="top-user"><strong>{user.fullName}</strong><small>{user.email}</small></div></div></header><div className="content">{(!selectedGroup && page !== 'groups') ? <Welcome groups={groups} onCreate={()=>setPage('groups')} /> : <PageRouter page={selectedGroup ? page : 'groups'} user={user} group={selectedGroup} groups={groups} setSelectedGroup={setSelectedGroup} onGroups={loadGroups} notify={notify} loading={loading} setPage={setPage}/>}</div></main><Toast toast={toast} onClose={()=>{}}/></div>;
}

function pageTitle(p){return {dashboard:'Overview',expenses:'Expenses',settlement:'Balances & Settle',members:'Members',groups:'Groups'}[p] || 'Overview'}
function initials(name=''){return name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase() || 'SS'}
function NavItem({icon,label,active,onClick}){return <button className={`nav-item ${active?'active':''}`} onClick={onClick}><Icon name={icon}/><span>{label}</span>{active&&<i></i>}</button>}

function Welcome({groups,onCreate}){return <section className="welcome"><div className="hero-card"><div><div className="eyebrow">SMARTSPLIT WORKSPACE</div><h1>Your shared money,<br/><span>finally under control.</span></h1><p>Create your first group to start tracking expenses, calculating balances and generating an optimised settlement plan.</p><button className="primary" onClick={onCreate}><Icon name="plus" size={18}/> Create your first group</button></div><div className="hero-art"><div className="art-ring"></div><div className="art-card"><small>SETTLEMENT</small><strong>R1,250.00</strong><span>Optimised in 2 payments</span></div></div></div></section>}

function PageRouter({page,user,group,groups,setSelectedGroup,onGroups,notify,setPage}){
  if(page==='expenses') return <Expenses group={group} user={user} notify={notify}/>;
  if(page==='settlement') return <Settlement group={group} notify={notify}/>;
  if(page==='members') return <Members group={group} user={user} notify={notify}/>;
  if(page==='groups') return <Groups groups={groups} onGroups={onGroups} setSelectedGroup={setSelectedGroup} notify={notify}/>;
  return <Dashboard group={group} user={user} notify={notify} setPage={setPage}/>;
}

function Dashboard({group,user,notify,setPage}){
  const [data,setData]=useState({expenses:[],balances:[],settlements:[],members:[]});
  const [busy,setBusy]=useState(true);
  useEffect(()=>{let alive=true;(async()=>{try{const [expenses,balances,settlements,members]=await Promise.all([api(`/api/groups/${group.id}/expenses`),api(`/api/groups/${group.id}/balances`),api(`/api/groups/${group.id}/settlements`),api(`/api/groups/${group.id}/members`)]);const nameById=Object.fromEntries(members.map(m=>[m.id,m.fullName]));const enriched=expenses.map(e=>({...e,paidByName:nameById[e.paid_by]||'Unknown'}));if(alive)setData({expenses:enriched,balances,settlements,members})}catch(e){if(alive)notify(e.message,'error')}finally{if(alive)setBusy(false)}})();return()=>{alive=false}},[group.id]);
  const mine=data.balances.find(b=>b.userId===user.id)?.balance||0; const total=data.expenses.reduce((s,e)=>s+Number(e.amount),0); const latest=data.expenses.slice(0,5);
  return <div><SectionHeading eyebrow="GROUP OVERVIEW" title={group.name} subtitle="A live view of your shared expenses, balances and settlement activity." action={<button className="secondary" onClick={()=>location.reload()}><Icon name="refresh" size={16}/> Refresh</button>}/>
    <div className="metric-grid"><Metric label="Group spending" value={money(total)} caption={`${data.expenses.length} expense${data.expenses.length===1?'':'s'} logged`} icon="receipt"/><Metric label="Your balance" value={money(mine)} caption={mine>0?'You are owed':'You owe'} tone={mine>0?'positive':mine<0?'negative':''} icon="wallet"/><Metric label="Members" value={data.balances.length} caption="Active in this group" icon="users"/><Metric label="Settlements" value={data.settlements.length} caption="Optimised payment plans" icon="bolt"/></div>
    <div className="dashboard-grid"><Card title="Recent expenses" subtitle="Latest activity in this group" action={<button className="link-btn" onClick={()=>setPage&&setPage('expenses')}>View all <Icon name="chevron" size={15}/></button>}><ExpenseTable expenses={latest} empty={busy?'Loading…':'No expenses yet.'}/></Card><Card title="Your group balance" subtitle="Net position by member"><BalanceMini balances={data.balances} userId={user.id}/></Card></div>
    <div className="architecture-callout"><div className="callout-icon"><Icon name="shield" size={21}/></div><div><strong>Built for the NADV 744 demonstration</strong><p>Client requests enter through the API Gateway, which verifies JWT authentication and routes traffic to the User, Expense and Settlement services.</p></div><span className="live-tag"><i></i> LIVE</span></div>
  </div>
}

function Expenses({group,user,notify}){
  const [expenses,setExpenses]=useState([]); const [members,setMembers]=useState([]); const [open,setOpen]=useState(false); const [editing,setEditing]=useState(null); const [search,setSearch]=useState(''); const [busy,setBusy]=useState(true);
  const load=async()=>{setBusy(true);try{const [e,m]=await Promise.all([api(`/api/groups/${group.id}/expenses`),api(`/api/groups/${group.id}/members`)]);setExpenses(e);setMembers(m)}catch(err){notify(err.message,'error')}finally{setBusy(false)}};
  useEffect(()=>{load()},[group.id]);
  const removeExpense=async(expense)=>{if(!window.confirm(`Delete "${expense.description}"? This cannot be undone.`))return;try{await api(`/api/groups/${group.id}/expenses/${expense.id}`,{method:'DELETE'});await load();notify('Expense deleted')}catch(err){notify(err.message,'error')}};
  const filtered=expenses.filter(e=>e.description.toLowerCase().includes(search.toLowerCase()));
  return <div><SectionHeading eyebrow="EXPENSE LEDGER" title="Expenses" subtitle={`Everything logged for ${group.name}.`} action={<button className="primary" onClick={()=>{setEditing(null);setOpen(true)}}><Icon name="plus" size={17}/> Add expense</button>}/><div className="toolbar"><div className="search"><Icon name="search" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search expenses…"/></div><div className="count-pill">{expenses.length} total</div></div><Card><ExpenseTable expenses={filtered} detailed onEdit={e=>{setEditing(e);setOpen(true)}} onDelete={removeExpense} empty={busy?'Loading…':'No expenses match your search.'}/></Card>{open&&<ExpenseModal group={group} members={members} user={user} initialExpense={editing} onClose={()=>{setOpen(false);setEditing(null)}} onSaved={async()=>{setOpen(false);setEditing(null);await load();notify(editing?'Expense updated successfully':'Expense added successfully')}} notify={notify}/>}</div>
}

function ExpenseModal({group,members,user,initialExpense,onClose,onSaved,notify}){
  const editing=Boolean(initialExpense); const initialSelected=initialExpense?.splits?.map(s=>s.userId)||members.map(m=>m.id);
  const [description,setDescription]=useState(initialExpense?.description||''); const [amount,setAmount]=useState(initialExpense?.amount!=null?String(initialExpense.amount):''); const [splitType,setSplitType]=useState(initialExpense?.split_type||initialExpense?.splitType||'equal'); const [paidBy,setPaidBy]=useState(initialExpense?.paid_by||initialExpense?.paidBy||user.id); const [selected,setSelected]=useState(initialSelected);
  const [inputs,setInputs]=useState(()=>{if(!initialExpense?.splits)return{};const total=Number(initialExpense.amount||0);return Object.fromEntries(initialExpense.splits.map(s=>[s.userId,(initialExpense.split_type||initialExpense.splitType)==='percentage'?(Number(s.amountOwed)/total*100).toFixed(2):String(s.amountOwed)]))}); const [busy,setBusy]=useState(false);
  const toggle=(id)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const submit=async(e)=>{e.preventDefault();if(selected.length===0){notify('Select at least one member','error');return}setBusy(true);try{const body={description,amount:Number(amount),splitType,paidBy,memberIds:selected};if(splitType!=='equal')body.splitInput=Object.fromEntries(selected.map(id=>[id,Number(inputs[id]||0)]));await api(editing?`/api/groups/${group.id}/expenses/${initialExpense.id}`:`/api/groups/${group.id}/expenses`,{method:editing?'PUT':'POST',body:JSON.stringify(body)});await onSaved()}catch(err){notify(err.message,'error')}finally{setBusy(false)}};
  const inputLabel=splitType==='exact'?'Amount owed':'Percentage';
  return <Modal title={editing?'Edit shared expense':'Add shared expense'} subtitle={editing?'Correct the bill or change how it is split.':'Record the bill and choose how the group should split it.'} onClose={onClose}><form onSubmit={submit} className="modal-form"><div className="form-row"><label>Description<input required value={description} onChange={e=>setDescription(e.target.value)} placeholder="e.g. Dinner at The Hussar Grill"/></label><label>Amount (ZAR)<input required min="0.01" step="0.01" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="450.00"/></label></div><label>Paid by<select value={paidBy} onChange={e=>setPaidBy(e.target.value)}>{members.map(m=><option key={m.id} value={m.id}>{m.fullName} — {m.email}</option>)}</select></label><div><div className="field-title">Split method</div><div className="split-tabs">{['equal','exact','percentage'].map(t=><button type="button" key={t} className={splitType===t?'active':''} onClick={()=>setSplitType(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div></div><div><div className="field-title">Members included</div><div className="member-select">{members.map(m=><div className={`member-option ${selected.includes(m.id)?'selected':''}`} key={m.id} onClick={()=>toggle(m.id)}><span className="check-circle">{selected.includes(m.id)&&<Icon name="check" size={12}/>}</span><span>{m.fullName}<small>{m.email}</small></span>{splitType!=='equal'&&selected.includes(m.id)&&<input required type="number" min="0" step="0.01" value={inputs[m.id]??''} onClick={e=>e.stopPropagation()} onChange={e=>setInputs({...inputs,[m.id]:e.target.value})} placeholder={inputLabel}/>}</div>)}</div></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?(editing?'Updating…':'Saving…'):(editing?'Update expense':'Save expense')} <Icon name="arrow" size={16}/></button></div></form></Modal>
}

function Members({group,user,notify}){const [members,setMembers]=useState([]);const [email,setEmail]=useState('');const [busy,setBusy]=useState(false);const load=async()=>{try{setMembers(await api(`/api/groups/${group.id}/members`))}catch(e){notify(e.message,'error')}};useEffect(()=>{load()},[group.id]);const add=async(e)=>{e.preventDefault();setBusy(true);try{await api(`/api/groups/${group.id}/members`,{method:'POST',body:JSON.stringify({email})});setEmail('');await load();notify('Member added to the group')}catch(err){notify(err.message,'error')}finally{setBusy(false)}};return <div><SectionHeading eyebrow="GROUP MEMBERS" title="Members" subtitle="People who participate in this group's expenses."/><div className="members-layout"><Card title={`${members.length} member${members.length===1?'':'s'}`} subtitle="Registered SmartSplit users"><div className="member-list">{members.map((m,i)=><div className="member-row" key={m.id}><div className="avatar large">{initials(m.fullName)}</div><div><strong>{m.fullName}</strong><small>{m.email}</small></div><span className="member-id">{m.id===user.id?'You':shortId(m.id)}</span></div>)}</div></Card><Card title="Add a member" subtitle="The person must already have a SmartSplit account"><form className="add-member" onSubmit={add}><label>Email address<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="member@example.com"/></label><button className="primary" disabled={busy}>{busy?'Adding…':'Add member'} <Icon name="plus" size={16}/></button></form><div className="tip"><Icon name="bolt" size={16}/><span>Tip: create accounts for all demo participants first, then add them by email.</span></div></Card></div></div>}

function Settlement({group,notify}){const [balances,setBalances]=useState([]);const [history,setHistory]=useState([]);const [result,setResult]=useState(null);const [busy,setBusy]=useState(true);const load=async()=>{setBusy(true);try{const [b,h]=await Promise.all([api(`/api/groups/${group.id}/balances`),api(`/api/groups/${group.id}/settlements`)]);setBalances(b);setHistory(h)}catch(e){notify(e.message,'error')}finally{setBusy(false)}};useEffect(()=>{load()},[group.id]);const settle=async()=>{try{const r=await api(`/api/groups/${group.id}/settle`,{method:'POST'});setResult(r);await load();notify('Settlement optimised and saved')}catch(e){notify(e.message,'error')}};const creditors=balances.filter(b=>b.balance>0).reduce((s,b)=>s+b.balance,0);const debtors=balances.filter(b=>b.balance<0).reduce((s,b)=>s+Math.abs(b.balance),0);return <div><SectionHeading eyebrow="SETTLEMENT ENGINE" title="Balances & Settle" subtitle="Turn group balances into the minimum practical set of payments." action={<button className="primary" onClick={settle} disabled={busy}><Icon name="bolt" size={17}/> Optimise settlement</button>}/><div className="settlement-banner"><div className="settle-visual"><div className="settle-icon"><Icon name="bolt" size={27}/></div><div><strong>Minimum-transactions optimisation</strong><p>SmartSplit calculates net balances and produces a payment plan designed to minimise the number of transfers.</p></div></div><div className="algorithm"><span>ALGORITHM</span><strong>{result?.algorithm || history[0]?.algorithm || 'min-transactions'}</strong></div></div><div className="balance-grid"><Card title="Who is owed" subtitle="Positive net balance"><BalanceList balances={balances.filter(b=>b.balance>0)} positive/></Card><Card title="Who owes" subtitle="Negative net balance"><BalanceList balances={balances.filter(b=>b.balance<0)} /></Card></div>{result&&<Card title="Latest settlement" subtitle={`Saved ${new Date(result.created_at||Date.now()).toLocaleString('en-ZA')}`}><div className="payment-plan">{result.payments.length===0?<div className="zero-state"><Icon name="check" size={22}/><strong>Everyone is settled.</strong><span>No payments are required.</span></div>:result.payments.map((p,i)=><div className="payment-row" key={i}><div className="payment-person"><span className="avatar small">{initials(p.fromName)}</span><strong>{p.fromName}</strong></div><Icon name="arrow" size={19}/><div className="payment-person"><span className="avatar small">{initials(p.toName)}</span><strong>{p.toName}</strong></div><strong className="payment-amount">{money(p.amount)}</strong></div>)}</div></Card>}<Card title="Settlement history" subtitle="Persisted optimisation results"><div className="history-list">{history.length===0?<div className="empty-state">No settlements generated yet.</div>:history.map(h=><div className="history-row" key={h.id}><div><strong>Settlement {shortId(h.id)}</strong><small>{new Date(h.created_at).toLocaleString('en-ZA')}</small></div><span>{h.total_payments} payment{h.total_payments===1?'':'s'}</span><b>{h.algorithm}</b></div>)}</div></Card><div className="balance-foot"><span>Total positive balance <strong>{money(creditors)}</strong></span><span>Total debt <strong>{money(debtors)}</strong></span></div></div>}

function Groups({
  groups,
  onGroups,
  setSelectedGroup,
  notify,
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();

    setBusy(true);

    try {
      const g = await api('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      setName('');
      await onGroups();
      setSelectedGroup(g);

      notify('Group created successfully');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteGroup = async (group) => {
    const confirmed = window.confirm(
      `Delete "${group.name}"?\n\nThis will permanently delete the group, its members, expenses and settlement history. This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await api(`/api/groups/${group.id}`, {
        method: 'DELETE',
      });

      setSelectedGroup(null);
      await onGroups();

      notify(`"${group.name}" deleted successfully`);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const leaveGroup = async (group) => {
    const confirmed = window.confirm(
      `Leave "${group.name}"?`
    );

    if (!confirmed) return;

    try {
      await api(`/api/groups/${group.id}/leave`, {
        method: 'DELETE',
      });

      setSelectedGroup(null);
      await onGroups();

      notify(`You left "${group.name}"`);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <div>
      <SectionHeading
        eyebrow="WORKSPACE"
        title="Groups"
        subtitle="Create, switch between and manage your groups."
      />

      <div className="groups-layout">

        <Card
          title="Create a group"
          subtitle="You will automatically become its first member"
        >
          <form className="create-group" onSubmit={create}>
            <label>
              Group name

              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Cape Town Weekend"
              />
            </label>

            <button
              className="primary"
              disabled={busy}
            >
              {busy ? 'Creating…' : 'Create group'}
              <Icon name="plus" size={16} />
            </button>
          </form>
        </Card>

        <div className="group-cards">

          {groups.length === 0 ? (
            <div className="empty-state">
              You don't belong to any groups yet.
            </div>
          ) : (
            groups.map(g => (
              <div
                className="group-card"
                key={g.id}
              >
                <button
                  className="group-card-main"
                  onClick={() => {
                    setSelectedGroup(g);
                  }}
                >
                  <span className="group-icon">
                    {g.name.slice(0, 1).toUpperCase()}
                  </span>

                  <span>
                    <strong>{g.name}</strong>

                    <small>
                      Created{' '}
                      {new Date(g.created_at).toLocaleDateString('en-ZA')}
                    </small>
                  </span>

                  <Icon name="chevron" size={18} />
                </button>

                <div className="group-card-actions">

                  {g.created_by ===
                  JSON.parse(
                    localStorage.getItem('smartsplit_user') || '{}'
                  ).id ? (
                    <button
                      className="icon-action danger"
                      title="Delete group"
                      onClick={() => deleteGroup(g)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  ) : (
                    <button
                      className="icon-action danger"
                      title="Leave group"
                      onClick={() => leaveGroup(g)}
                    >
                      <Icon name="logout" size={16} />
                    </button>
                  )}

                </div>
              </div>
            ))
          )}

        </div>
      </div>
    </div>
  );
}
function ExpenseTable({expenses,empty,detailed,onEdit,onDelete}){if(!expenses?.length)return <div className="empty-state">{empty}</div>;return <div className="table-wrap"><table><thead><tr><th>Expense</th><th>Paid by</th><th>Split</th><th>Amount</th><th>Date</th>{detailed&&<th>Actions</th>}</tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td><strong>{e.description}</strong><small>{shortId(e.id)}</small></td><td>{e.paidByName||shortId(e.paid_by)}</td><td><span className="type-pill">{e.splitType||e.split_type}</span></td><td><strong>{money(e.amount)}</strong></td><td>{new Date(e.createdAt||e.created_at).toLocaleDateString('en-ZA')}</td>{detailed&&<td><div className="row-actions"><button className="icon-action" title="Edit expense" onClick={()=>onEdit?.(e)}><Icon name="edit" size={15}/></button><button className="icon-action danger" title="Delete expense" onClick={()=>onDelete?.(e)}><Icon name="trash" size={15}/></button></div></td>}</tr>)}</tbody></table></div>}
function BalanceMini({balances,userId}){if(!balances?.length)return <div className="empty-state">No balances yet.</div>;return <div className="mini-balances">{balances.slice(0,6).map(b=><div className="mini-row" key={b.userId}><div className="avatar small">{initials(b.fullName)}</div><span><strong>{b.userId===userId?'You':b.fullName}</strong><small>{b.balance>0?'gets back':b.balance<0?'owes':'settled'}</small></span><b className={b.balance>0?'positive':b.balance<0?'negative':''}>{b.balance>0?'+':''}{money(b.balance)}</b></div>)}</div>}
function BalanceList({balances,positive}){if(!balances.length)return <div className="empty-state">Nobody here yet.</div>;return <div className="balance-list">{balances.map(b=><div className="balance-row" key={b.userId}><div className="avatar small">{initials(b.fullName)}</div><span><strong>{b.fullName}</strong><small>{positive?'is owed':'owes the group'}</small></span><b className={positive?'positive':'negative'}>{positive?'+':''}{money(b.balance)}</b></div>)}</div>}
function Metric({label,value,caption,tone,icon}){return <div className="metric"><div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon name={icon} size={17}/></div></div><strong className={tone}>{value}</strong><small>{caption}</small></div>}
function SectionHeading({eyebrow,title,subtitle,action}){return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="heading-action">{action}</div>}</div>}
function Card({title,subtitle,action,children}){return <section className="card">{(title||action)&&<div className="card-head"><div>{title&&<h3>{title}</h3>}{subtitle&&<p>{subtitle}</p>}</div>{action}</div>}{children}</section>}
function Modal({title,subtitle,onClose,children}){return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose}><Icon name="x"/></button></div>{children}</div></div>}

createRoot(document.getElementById('root')).render(<App/>);