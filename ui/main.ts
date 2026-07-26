export {};

type Product='codex'|'claude';
type Profile={id:string;name:string;file_name:string;created_at:string;updated_at:string;last_applied?:string};
type Config={path:string;content:string;model?:string;provider?:string};
type Field={path:string[];section:string;key:string;kind:string;value:string};
type ApplyResult={applied_path:string};
type EditorTab='fields'|'auth';

declare global { interface Window { __TAURI__?:{core:{invoke<T>(name:string,args?:Record<string,unknown>):Promise<T>}} } }

const invoke=async<T>(name:string,args?:Record<string,unknown>)=>window.__TAURI__?.core.invoke<T>(name,args)??Promise.reject(new Error('请在 Tauri 应用中运行'));
const app=document.querySelector<HTMLElement>('#app')!;
const productInfo={
  codex:{name:'Codex',format:'TOML'},
  claude:{name:'Claude Code',format:'JSON'}
} as const;

let product:Product='codex';
let config:Config|undefined;
let profiles:Profile[]=[];
let selected:Profile|undefined;
let fields:Field[]=[];
let view:'home'|'editor'='home';
let message='';
let error='';
let messageTimer:number|undefined;
let isNew=false;
let activeTab:EditorTab='fields';
let draftName='';
let authContent='';
let authFields:Field[]=[];

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

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

const svg=(path:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
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
  errCircle:svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>')
};

function shell(content:string){
  const isEditor=view==='editor';
  const info=productInfo[product];
  const topActions=isEditor
    ?`<button id="save" class="btn">${icon.check}保存</button><button id="apply" class="btn primary">${icon.zap}保存并启用</button>`
    :`<button id="reload" class="btn ghost icon" title="重新加载">${icon.reload}</button><button id="newCurrent" class="btn primary">${icon.plus}新建配置</button>`;
  app.innerHTML=`<header class="topbar">
    <div class="brand">${isEditor?`<button id="back" class="btn ghost icon" title="返回">${icon.back}</button>`:''}<div class="brand-logo">${icon.logo}</div><div><div class="brand-name">Agent Config Switcher</div><div class="brand-sub">${info.name} ${info.format} 配置管理</div></div></div>
    <div class="product-switch" role="tablist" aria-label="配置类型"><button class="product-option ${product==='codex'?'active':''}" data-product="codex">Codex</button><button class="product-option ${product==='claude'?'active':''}" data-product="claude">Claude Code</button></div>
    <div class="top-actions">${topActions}</div>
  </header>
  <main class="page">${content}</main>
  <div class="toast-stack">${message?`<div class="toast success">${icon.okCircle}<span>${esc(message)}</span></div>`:''}${error?`<div class="toast error">${icon.errCircle}<span>${esc(error)}</span></div>`:''}</div>`;
  document.querySelectorAll<HTMLElement>('[data-product]').forEach(element=>element.onclick=()=>void switchProduct(element.dataset.product as Product));
  if(isEditor){
    document.querySelector('#back')?.addEventListener('click',()=>{isNew=false;view='home';render()});
    document.querySelector('#save')?.addEventListener('click',()=>void save());
    document.querySelector('#apply')?.addEventListener('click',()=>void apply(selected!.id));
  }else{
    document.querySelector('#reload')?.addEventListener('click',()=>void load());
    document.querySelector('#newCurrent')?.addEventListener('click',()=>void create());
  }
}

function home(){
  const info=productInfo[product];
  const cards=profiles.map(profile=>{
    const id=esc(profile.id);
    const lastApplied=profile.last_applied?new Date(profile.last_applied).toLocaleString():'';
    return `<article class="card ${profile.last_applied?'enabled':''}">
      <div class="avatar">${esc((profile.name[0]??info.name[0]).toUpperCase())}</div>
      <div class="card-body">
        <div class="card-title"><h3>${esc(profile.name)}</h3>${profile.last_applied?'<span class="tag">当前启用</span>':''}</div>
        <div class="card-file">${icon.file}<span>${esc(profile.file_name)}</span></div>
        <div class="card-meta">${profile.last_applied?'最近使用：'+esc(lastApplied):'尚未启用'}</div>
      </div>
      <div class="card-actions">
        <button class="btn ${profile.last_applied?'':'primary'}" data-enable="${id}" ${profile.last_applied?'disabled':''}>${profile.last_applied?icon.check+'已启用':icon.zap+'启用'}</button>
        <button class="btn ghost" data-edit="${id}">${icon.edit}编辑</button>
        <button class="btn ghost danger icon" data-del="${id}" title="${profile.last_applied?'请先启用其他配置再删除':'删除'}" ${profile.last_applied?'disabled':''}>${icon.trash}</button>
      </div>
    </article>`;
  }).join('');
  shell(`<section class="hero">
    <div class="hero-icon">${icon.zap}</div>
    <div class="hero-text">
      <h1>${info.name} 配置切换</h1>
      <p>选择一个配置并启用，新的 ${info.name} 会话将使用它。</p>
      ${config?.path?`<div class="hero-path">${icon.folder}<span>${esc(config.path)}</span></div>`:''}
    </div>
    <button id="open" class="btn">${icon.folder}打开配置目录</button>
  </section>
  <div class="section-head"><h2>全部配置</h2><span class="count">${profiles.length}</span></div>
  <div class="grid">${cards||`<div class="empty">${icon.inbox}<p>还没有配置，点击右上角「新建配置」开始。</p></div>`}</div>`);
  document.querySelector('#open')?.addEventListener('click',()=>void openDirectory());
  document.querySelectorAll<HTMLElement>('[data-edit]').forEach(element=>element.onclick=()=>void select(element.dataset.edit!));
  document.querySelectorAll<HTMLElement>('[data-enable]').forEach(element=>element.onclick=()=>void apply(element.dataset.enable!));
  document.querySelectorAll<HTMLElement>('[data-del]').forEach(element=>element.onclick=()=>void remove(element.dataset.del!));
}

function fieldControl(field:Field,index:number,attribute:'field'|'auth'='field'){
  const data=attribute==='auth'?`data-auth="${index}"`:`data-field="${index}"`;
  if(field.kind==='boolean')return `<select ${data}><option value="true" ${field.value==='true'?'selected':''}>true</option><option value="false" ${field.value==='false'?'selected':''}>false</option></select>`;
  if(['array','json','other'].includes(field.kind))return `<textarea class="array-input" ${data}>${esc(field.value)}</textarea>`;
  if(product==='codex'&&field.key==='model'){
    const models=['gpt-5.6-sol','claude-fable-5','gpt-5.5','grok-4.5'];
    if(field.value&&!models.includes(field.value))models.unshift(field.value);
    return `<select ${data}>${models.map(model=>`<option value="${esc(model)}" ${model===field.value?'selected':''}>${esc(model)}</option>`).join('')}</select>`;
  }
  return `<input type="${['integer','float','number'].includes(field.kind)?'number':'text'}" ${data} value="${esc(field.value)}">`;
}

function renderFieldList(items:Field[],attribute:'field'|'auth'){
  if(items.length===0)return '<div class="field-empty">没有可编辑字段</div>';
  let last='';
  return items.map((field,index)=>{
    const heading=field.section!==last?`<h3>${esc(field.section)}</h3>`:'';
    last=field.section;
    return `${heading}<label class="field-row"><span class="field-label"><b>${esc(field.key)}</b><small title="${esc(field.path.join('.'))}">${esc(field.path.join('.'))}</small></span>${fieldControl(field,index,attribute)}</label>`;
  }).join('');
}

function editor(){
  const codexTabs=`<button class="tab ${activeTab==='fields'?'active':''}" data-tab="fields">${icon.edit} 配置字段</button><button class="tab ${activeTab==='auth'?'active':''}" data-tab="auth">${icon.file} auth.json</button>`;
  const claudeTabs=`<span class="tab active">${icon.edit} 环境变量</span>`;
  const tabContent=activeTab==='auth'
    ?`<div class="fields">${renderFieldList(authFields,'auth')}</div>`
    :`<div class="fields">${renderFieldList(fields,'field')}</div>`;
  shell(`<section class="editor-card">
    <label class="name-field"><span>配置名称</span><input id="name" type="text" value="${esc(draftName)}"></label>
    <div class="tabs">${product==='codex'?codexTabs:claudeTabs}</div>
    ${tabContent}
  </section>`);
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(element=>element.onclick=()=>void changeTab(element.dataset.tab as EditorTab));
}

function filterCodexFields(all:Field[]):Field[]{
  return all.filter(field=>field.path.length===1||(field.path.length>=2&&field.path[0]==='model_providers'&&field.path[1]==='custom'));
}

function render(){view==='home'?home():editor()}

async function switchProduct(next:Product){
  if(next===product)return;
  if(view==='editor'&&!confirm('切换配置类型将放弃尚未保存的更改，是否继续？'))return;
  product=next;
  config=undefined;
  profiles=[];
  selected=undefined;
  fields=[];
  isNew=false;
  view='home';
  activeTab='fields';
  message='';
  error='';
  render();
  await load();
}

async function load(){
  try{
    const configCommand=product==='codex'?'load_codex_config':'load_claude_config';
    const profilesCommand=product==='codex'?'list_profiles':'list_claude_profiles';
    [config,profiles]=await Promise.all([invoke<Config>(configCommand),invoke<Profile[]>(profilesCommand)]);
    message='';
    error='';
    render();
  }catch(caught){
    error=String(caught);
    render();
  }
}

async function loadAuth(profileId?:string){
  try{
    authContent=await invoke<string>(profileId?'load_profile_auth':'load_auth_json',profileId?{profileId}:undefined);
    authFields=await invoke<Field[]>('parse_auth_content',{content:authContent});
  }catch{
    authContent='{}';
    authFields=[];
  }
}

async function create(){
  try{
    if(!config){error='尚未加载配置';render();return;}
    if(product==='codex'){
      fields=filterCodexFields(await invoke<Field[]>('parse_toml_content',{content:config.content}));
      await loadAuth();
    }else{
      fields=await invoke<Field[]>('parse_json_content',{content:config.content});
    }
    selected={id:'',name:'新配置',file_name:'',created_at:'',updated_at:''};
    draftName=selected.name;
    isNew=true;
    view='editor';
    activeTab='fields';
    message='';
    error='';
    render();
  }catch(caught){error=String(caught);render();}
}

async function select(id:string){
  selected=profiles.find(profile=>profile.id===id);
  if(!selected)return;
  try{
    draftName=selected.name;
    if(product==='codex'){
      fields=filterCodexFields(await invoke<Field[]>('parse_profile_fields',{profileId:id}));
      await loadAuth(id);
    }else{
      fields=await invoke<Field[]>('parse_claude_profile_fields',{profileId:id});
    }
    view='editor';
    activeTab='fields';
    message='';
    error='';
    render();
  }catch(caught){error=String(caught);render();}
}

function readFields(){
  document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-field]').forEach(element=>fields[Number(element.dataset.field)].value=element.value);
  return fields;
}

function readAuthFields(){
  document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-auth]').forEach(element=>authFields[Number(element.dataset.auth)].value=element.value);
}

function readName(){return document.querySelector<HTMLInputElement>('#name')?.value.trim()||draftName||selected?.name||'新配置'}

function changeTab(next:EditorTab){
  if(next===activeTab)return;
  draftName=readName();
  if(activeTab==='auth')readAuthFields();else readFields();
  activeTab=next;
  error='';
  editor();
}

async function saveEditorSnapshot():Promise<Profile>{
  if(!selected)throw new Error('尚未选择配置');
  const name=readName();
  if(product==='codex'){
    if(isNew){selected=await invoke<Profile>('create_profile_from_current',{name});isNew=false;}
    await invoke('save_profile_fields',{profileId:selected.id,name,fields:readFields()});
    readAuthFields();
    const newContent=await invoke<string>('save_auth_fields',{content:authContent,fields:authFields});
    await invoke('save_profile_auth',{profileId:selected.id,content:newContent});
    authContent=newContent;
    profiles=await invoke<Profile[]>('list_profiles');
  }else{
    if(isNew){selected=await invoke<Profile>('create_claude_profile_from_current',{name});isNew=false;}
    await invoke('save_claude_profile_fields',{profileId:selected.id,name,fields:readFields()});
    profiles=await invoke<Profile[]>('list_claude_profiles');
  }
  selected=profiles.find(profile=>profile.id===selected!.id)??selected;
  draftName=selected.name;
  return selected;
}

async function save(){
  if(!selected)return;
  try{await saveEditorSnapshot();view='home';showMessage('配置已保存');}
  catch(caught){error=String(caught);render();}
}

async function apply(id:string){
  try{
    if(view==='editor'){
      selected=selected?.id===id?selected:profiles.find(profile=>profile.id===id);
      if(!selected)return;
      selected=await saveEditorSnapshot();
      id=selected.id;
    }else{
      selected=profiles.find(profile=>profile.id===id);
      if(!selected)return;
    }
    const command=product==='codex'?'apply_profile':'apply_claude_profile';
    await invoke<ApplyResult>(command,{profileId:id});
    const appliedName=selected.name;
    view='home';
    await load();
    showMessage(`已启用 ${appliedName}`);
  }catch(caught){error=String(caught);render();}
}

async function remove(id:string){
  const profile=profiles.find(item=>item.id===id);
  if(profile?.last_applied){error='无法删除：该配置当前已启用，请先启用其他配置';render();return;}
  if(!confirm(`删除配置「${profile?.name??''}」？`))return;
  try{
    await invoke(product==='codex'?'delete_profile':'delete_claude_profile',{profileId:id});
    await load();
  }catch(caught){error=String(caught);render();}
}

async function openDirectory(){
  try{await invoke(product==='codex'?'open_config_directory':'open_claude_config_directory');}
  catch(caught){error=String(caught);render();}
}

void load();
