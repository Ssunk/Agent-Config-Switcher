export {};
type Profile={id:string;name:string;file_name:string;created_at:string;updated_at:string;last_applied?:string};
type Config={path:string;content:string;model?:string;provider?:string};
type Field={path:string[];section:string;key:string;kind:string;value:string};
type ApplyResult={applied_path:string};
declare global { interface Window { __TAURI__?:{core:{invoke<T>(name:string,args?:Record<string,unknown>):Promise<T>}} } }
const invoke=async<T>(n:string,a?:Record<string,unknown>)=>window.__TAURI__?.core.invoke<T>(n,a)??Promise.reject(new Error('请在 Tauri 应用中运行'));
const app=document.querySelector<HTMLElement>('#app')!;
let config:Config|undefined; let profiles:Profile[]=[]; let selected:Profile|undefined; let fields:Field[]=[]; let view:'home'|'editor'='home'; let message=''; let error=''; let messageTimer:number|undefined; let isNew=false; let activeTab:'fields'|'auth'='fields'; let draftName=''; let authContent=''; let authFields:Field[]=[];
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

function showMessage(text:string){
  if(messageTimer!==undefined)window.clearTimeout(messageTimer);
  message=text;
  error='';
  render();
  messageTimer=window.setTimeout(()=>{
    if(message===text){message='';render();}
    messageTimer=undefined;
  },3000);
}

const svg=(p:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const icon={
  logo:svg('<path d="m12 2 9 4.9v9.9L12 22l-9-5.1V6.9L12 2Z"/><path d="m12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>'),
  reload:svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  plus:svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  folder:svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  file:svg('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"/><path d="M14 2v6h6"/>'),
  edit:svg('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>'),
  trash:svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  back:svg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
  check:svg('<path d="M20 6 9 17l-5-5"/>'),
  zap:svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>'),
  inbox:svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>'),
  okCircle:svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  errCircle:svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
  clock:svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')
};

function shell(content:string){
  const isEditor=view==='editor';
  const topActions=isEditor
    ?`<button id="save" class="btn">${icon.check}保存</button><button id="apply" class="btn primary">${icon.zap}保存并启用</button>`
    :`<button id="reload" class="btn ghost icon" title="重新加载">${icon.reload}</button><button id="newCurrent" class="btn primary">${icon.plus}新建配置</button>`;
  app.innerHTML=`<header class="topbar">
    <div class="brand">${isEditor?`<button id="back" class="btn ghost icon" title="返回">${icon.back}</button>`:''}<div class="brand-logo">${icon.logo}</div><div><div class="brand-name">Codex Provider Switcher</div><div class="brand-sub">TOML 配置管理</div></div></div>
    <div class="top-actions">${topActions}</div>
  </header>
  <main class="page">${content}</main>
  <div class="toast-stack">${message?`<div class="toast success">${icon.okCircle}<span>${esc(message)}</span></div>`:''}${error?`<div class="toast error">${icon.errCircle}<span>${esc(error)}</span></div>`:''}</div>`;
  if(isEditor){
    document.querySelector('#back')?.addEventListener('click',()=>{isNew=false;view='home';render()});
    document.querySelector('#save')?.addEventListener('click',save);
    document.querySelector('#apply')?.addEventListener('click',()=>apply(selected!.id));
  }else{
    document.querySelector('#reload')?.addEventListener('click',load);
    document.querySelector('#newCurrent')?.addEventListener('click',()=>create('current'));
  }
}

function home(){
  const cards=profiles.map(p=>`<article class="card ${p.last_applied?'enabled':''}">
    <div class="avatar">${esc((p.name[0]??'T').toUpperCase())}</div>
    <div class="card-body">
      <div class="card-title"><h3>${esc(p.name)}</h3>${p.last_applied?'<span class="tag">当前启用</span>':''}</div>
      <div class="card-file">${icon.file}<span>${esc(p.file_name)}</span></div>
      <div class="card-meta">${p.last_applied?'最近使用：'+new Date(p.last_applied).toLocaleString():'尚未启用'}</div>
    </div>
    <div class="card-actions">
      <button class="btn ${p.last_applied?'':'primary'}" data-enable="${p.id}" ${p.last_applied?'disabled':''}>${p.last_applied?icon.check+'已启用':icon.zap+'启用'}</button>
      <button class="btn ghost" data-edit="${p.id}">${icon.edit}编辑</button>
      <button class="btn ghost danger icon" data-del="${p.id}" title="${p.last_applied?'请先取消启用再删除':'删除'}" ${p.last_applied?'disabled':''}>${icon.trash}</button>
    </div>
  </article>`).join('');
  shell(`<section class="hero">
    <div class="hero-icon">${icon.zap}</div>
    <div class="hero-text">
      <h1>配置切换</h1>
      <p>选择一个配置并启用，新的 Codex 会话将使用它。</p>
      ${config?.path?`<div class="hero-path">${icon.folder}<span>${esc(config.path)}</span></div>`:''}
    </div>
    <button id="open" class="btn">${icon.folder}打开配置目录</button>
  </section>
  <div class="section-head"><h2>全部配置</h2><span class="count">${profiles.length}</span></div>
  <div class="grid">${cards||`<div class="empty">${icon.inbox}<p>还没有配置，点击右上角「新建配置」开始。</p></div>`}</div>`);
  document.querySelector('#open')?.addEventListener('click',()=>invoke('open_config_directory'));
  document.querySelectorAll<HTMLElement>('[data-edit]').forEach(x=>x.onclick=()=>select(x.dataset.edit!));
  document.querySelectorAll<HTMLElement>('[data-enable]').forEach(x=>x.onclick=()=>apply(x.dataset.enable!));
  document.querySelectorAll<HTMLElement>('[data-del]').forEach(x=>x.onclick=()=>remove(x.dataset.del!));
}

function fieldControl(f:Field,i:number,attr:'field'|'auth'='field'){
  const d=attr==='auth'?`data-auth="${i}"`:`data-field="${i}"`;
  if(f.kind==='boolean')return `<select ${d}><option value="true" ${f.value==='true'?'selected':''}>true</option><option value="false" ${f.value==='false'?'selected':''}>false</option></select>`;
  if(f.kind==='array')return `<textarea class="array-input" ${d}>${esc(f.value)}</textarea>`;
  if(f.key==='model'){const models=['gpt-5.6-sol','claude-fable-5','gpt-5.5','grok-4.5'];if(f.value&&!models.includes(f.value))models.unshift(f.value);return `<select ${d}>${models.map(m=>`<option value="${esc(m)}" ${m===f.value?'selected':''}>${esc(m)}</option>`).join('')}</select>`}
  return `<input type="${f.kind==='integer'||f.kind==='float'?'number':'text'}" ${d} value="${esc(f.value)}">`;
}

function renderFieldsTab():string{
  let last='';return fields.map((f,i)=>{const h=f.section!==last?`<h3>${esc(f.section)}</h3>`:'';last=f.section;return `${h}<label class="field-row"><span class="field-label"><b>${esc(f.key)}</b><small title="${esc(f.path.join('.'))}">${esc(f.path.join('.'))}</small></span>${fieldControl(f,i,'field')}</label>`;}).join('');
}
function renderAuthTab():string{
  let last='';return authFields.map((f,i)=>{const h=f.section!==last?`<h3>${esc(f.section)}</h3>`:'';last=f.section;return `${h}<label class="field-row"><span class="field-label"><b>${esc(f.key)}</b><small title="${esc(f.path.join('.'))}">${esc(f.path.join('.'))}</small></span>${fieldControl(f,i,'auth')}</label>`;}).join('');
}
function readAuthFields(){document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-auth]').forEach(el=>authFields[Number(el.dataset.auth)].value=el.value);}

function editor(){
  const tabContent=activeTab==='fields'
    ?`<div><label class="name-field"><span>配置名称</span><input id="name" type="text" value="${esc(draftName)}"></label><div class="fields">${renderFieldsTab()}</div></div>`
    :`<div class="fields">${renderAuthTab()}</div>`;
  shell(`<section class="editor-card">
    <div class="tabs"><button class="tab ${activeTab==='fields'?'active':''}" data-tab="fields">${icon.edit} 配置字段</button><button class="tab ${activeTab==='auth'?'active':''}" data-tab="auth">${icon.file} auth.json</button></div>
    ${tabContent}
  </section>`);
  document.querySelectorAll<HTMLElement>('.tab').forEach(x=>x.onclick=()=>{
    if(activeTab==='auth')readAuthFields();else{draftName=readName();readFields();}
    activeTab=x.dataset.tab as 'fields'|'auth';
    editor();
  });
}

function filterFields(all:Field[]):Field[]{
  return all.filter(f=>f.path.length===1||(f.path.length>=2&&f.path[0]==='model_providers'&&f.path[1]==='custom'));
}
function render(){view==='home'?home():editor()}
async function load(){try{config=await invoke<Config>('load_codex_config');profiles=await invoke<Profile[]>('list_profiles');message='';error='';render()}catch(e){error=String(e);render()}}
async function resetAll(){try{await invoke('reset_all_enabled');await load();message='所有配置已取消启用';}catch(e){error=String(e);render()}}
async function loadAuth(profileId?:string){try{authContent=await invoke<string>(profileId?'load_profile_auth':'load_auth_json',profileId?{profileId}:undefined);authFields=await invoke<Field[]>('parse_auth_content',{content:authContent})}catch(e){authContent='{}';authFields=[]}}
async function create(kind:'current'|'empty'){try{if(!config){error='尚未加载配置';render();return}
  const content=kind==='current'?config.content:'# Codex config profile\nmodel = \"\"\nmodel_provider = \"\"\n';
  fields=filterFields(await invoke<Field[]>('parse_toml_content',{content}));
  selected={id:'',name:'新配置',file_name:'',created_at:'',updated_at:''};draftName=selected.name;
  isNew=true;view='editor';activeTab='fields';await loadAuth();message='';error='';render()}catch(e){error=String(e);render()}}
async function select(id:string){selected=profiles.find(p=>p.id===id);if(!selected)return;try{draftName=selected.name;fields=filterFields(await invoke<Field[]>('parse_profile_fields',{profileId:id}));view='editor';activeTab='fields';await loadAuth(id);message='';error='';render()}catch(e){error=String(e);render()}}
function readFields(){document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-field]').forEach(el=>fields[Number(el.dataset.field)].value=el.value);return fields}
function readName(){return document.querySelector<HTMLInputElement>('#name')?.value.trim()||draftName||selected?.name||'新配置'}
async function saveEditorSnapshot():Promise<Profile>{
  if(!selected)throw new Error('尚未选择配置');
  const name=readName();
  if(isNew){selected=await invoke<Profile>('create_profile_from_current',{name});isNew=false;}
  await invoke('save_profile_fields',{profileId:selected.id,name,fields:readFields()});
  readAuthFields();
  const newContent=await invoke<string>('save_auth_fields',{content:authContent,fields:authFields});
  await invoke('save_profile_auth',{profileId:selected.id,content:newContent});
  authContent=newContent;
  profiles=await invoke<Profile[]>('list_profiles');
  selected=profiles.find(p=>p.id===selected!.id)??selected;
  draftName=selected.name;
  return selected;
}
async function save(){if(!selected)return;try{await saveEditorSnapshot();view='home';showMessage('配置已保存')}catch(e){error=String(e);render()}}
async function apply(id:string){try{if(view==='editor'){selected=selected?.id===id?selected:profiles.find(p=>p.id===id);if(!selected)return;selected=await saveEditorSnapshot();id=selected.id;}else{selected=profiles.find(p=>p.id===id);if(!selected)return;}await invoke<ApplyResult>('apply_profile',{profileId:id});message=`已启用 ${selected.name}`;view='home';await load()}catch(e){error=String(e);render()}}
async function remove(id:string){const p=profiles.find(x=>x.id===id);if(p?.last_applied){error='无法删除：该配置当前已启用，请先启用其他配置后再删除';render();return}if(!confirm(`删除配置「${p?.name??''}」？`))return;try{await invoke('delete_profile',{profileId:id});await load()}catch(e){error=String(e);render()}}
load();
