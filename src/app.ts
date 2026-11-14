import {freshState, demoAccount, DEFAULT_STRATEGY, validateAccount, validateStrategy,
  ladder, takeProfit, applyTrade, decodeState, type AppState, type Account,
  type Strategy, type TradeInput, type AuditEvent} from './core.js';

const STORE_KEY = 'ethan-invest-trader.local.v1';
const VERSION = '0.1.2';
let rawCache: string | null = null;
let storageError = '';
let state: AppState = freshState();
try {rawCache=localStorage.getItem(STORE_KEY); if(rawCache) state=decodeState(rawCache);}
catch {storageError='无法读取本机记录。未覆盖旧数据；请先导出备份或在设置中清空。';}
let page: 'decision'|'holdings'|'review'|'settings' = 'decision';
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let deferredInstall: (Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>}) | null = null;
let waitingWorker: ServiceWorker | null = null;
let lastFocusAction = '';
const app=document.querySelector<HTMLDivElement>('#app')!;
const sheet=document.querySelector<HTMLDialogElement>('#sheet')!;
const toastEl=document.querySelector<HTMLDivElement>('#toast')!;
const icons: Record<string,string> = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
  wallet:'<path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v9a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V7"/><path d="M20 12h-5v4h5M17 14h.1"/>',
  chart:'<path d="M4 4v16h16M8 15l4-5 4 3 4-7"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9M10 21h4"/>',
  eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="M3 3l18 18M10 5a11 11 0 0 1 12 7 16 16 0 0 1-3 4M6 6a16 16 0 0 0-4 6s3 7 10 7a12 12 0 0 0 5-1"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  alert:'<path d="M12 3 2 20h20L12 3ZM12 9v5M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
  edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  receipt:'<path d="M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2V3ZM9 9h6M9 13h6"/>',
  moon:'<path d="M20 14A8 8 0 0 1 10 4a9 9 0 1 0 10 10Z"/>',
};
const icon=(name:string,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]??icons.info}</svg>`;
const esc=(x:unknown):string=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const uid=()=>crypto.randomUUID();
const money=(n:number|null|undefined, masked=true)=>n==null?'—':state.preferences.mask&&masked?'••••':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const qty=(n:number|null|undefined,masked=true)=>n==null?'—':state.preferences.mask&&masked?'••':new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(n);
const dateText=(date:string|null)=>date?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(date)):'未核实';
const localBeijing=(date=new Date())=>new Date(date.getTime()+8*3600_000).toISOString().slice(0,19);
const parseBeijing=(s:string)=>new Date(`${s.length===16?s+':00':s}+08:00`).toISOString();
const activeAccount=()=>state.mode==='demo'?demoAccount():state.account;
const activeStrategy=()=>state.mode==='demo'?DEFAULT_STRATEGY:state.strategy;
const isDemo=()=>state.mode==='demo';
const button=(label:string,action:string,kind='primary',symbol='')=>`<button class="button ${kind}" data-action="${action}">${symbol?icon(symbol):''}${label}</button>`;
const notice=(text:string,subtle=false)=>`<div class="notice ${subtle?'subtle':''}">${icon(subtle?'info':'alert',16)}<span>${text}</span></div>`;
const field=(name:string,label:string,value:unknown,type='number',hint='',placeholder='留空表示未知')=>`<label class="field"><span>${label}</span><input name="${name}" type="${type}" ${type==='number'?'min="0" max="1000000000" step="any" inputmode="decimal"':''} value="${esc(value)}" placeholder="${placeholder}" ${type==='text'?'maxlength="1000"':''} ${type==='datetime-local'?'step="1"':''}>${hint?`<small>${hint}</small>`:''}</label>`;
const infoRow=(label:string,value:string)=>`<div class="info-row"><span>${label}</span><span>${value}</span></div>`;
function toast(message:string){clearTimeout(toastTimer);toastEl.textContent=message;toastEl.classList.add('visible');toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),4500);}
function clone():AppState{return structuredClone(state);}
function addEvent(next:AppState,type:string,description:string){next.events.unshift({id:uid(),type,description,at:new Date().toISOString()});}
function persist(next:AppState,force=false):boolean {
  try {
    if(storageError&&!force) throw new Error('请先导出或清理损坏的本机数据，避免覆盖。');
    if(!force && localStorage.getItem(STORE_KEY)!==rawCache){const current=localStorage.getItem(STORE_KEY);state=current?decodeState(current):freshState();rawCache=current;closeModal();render();toast('另一个窗口已更新记录，请核对后重新操作。');return false;}
    const encoded=JSON.stringify(next);localStorage.setItem(STORE_KEY,encoded);rawCache=encoded;state=next;storageError='';return true;
  } catch(error) {toast(error instanceof Error?error.message:'本机保存失败，请导出备份。');return false;}
}
function render(){
  const a=activeAccount();
  app.innerHTML=`<div class="app-shell"><header class="app-header"><div class="brand"><div class="brand-mark" aria-hidden="true">E</div><div class="brand-text"><strong>ETHAN</strong><small>INVEST TRADER</small></div></div><div class="header-actions"><button class="icon-button" data-action="mask" aria-label="${state.preferences.mask?'显示金额':'隐藏金额'}">${icon(state.preferences.mask?'eyeoff':'eye',17)}</button><button class="icon-button" data-action="notifications" aria-label="通知状态">${icon('bell',17)}</button></div></header>
    <main id="main"><div class="mode-bar" aria-label="数据模式"><button class="${isDemo()?'active':''}" data-action="mode-demo" aria-pressed="${isDemo()}">演示数据</button><button class="${!isDemo()?'active':''}" data-action="mode-manual" aria-pressed="${!isDemo()}">我的账户</button></div>
    ${!navigator.onLine?'<div class="offline-bar">离线模式 · 本机记录</div>':''}
    ${storageError?notice(`${esc(storageError)}<br><button class="text-button" data-action="export">导出本机原始记录 ${icon('download',13)}</button>`):''}
    ${waitingWorker?`<div class="notice subtle">${icon('refresh')}<span>发现新版本。<button class="text-button" data-action="update-app">立即更新</button></span></div>`:''}
    ${page==='decision'?decisionPage(a):page==='holdings'?holdingsPage(a):page==='review'?reviewPage():settingsPage()}
    </main><nav class="bottom-nav" aria-label="主导航">${[['decision','compass','总览'],['holdings','wallet','持仓'],['review','chart','复盘'],['settings','settings','设置']].map(([p,i,label])=>`<button class="nav-item ${page===p?'active':''}" data-action="nav-${p}" ${page===p?'aria-current="page"':''}><span class="nav-icon">${icon(i,21)}</span><span>${label}</span></button>`).join('')}</nav></div>`;
}
function intro(eyebrow:string,title:string,sub:string){return `<header class="page-intro"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${sub}</p></header>`;}
function decisionPage(a:Account|null):string {
  const s=activeStrategy();
  return `${intro('YOUR INVESTMENT DESK','投资工作台','TQQQ / 持仓 · 计划 · 记录')}
    <div class="dashboard-grid"><div class="overview-panel"><div class="section-heading"><h2>账户总览</h2><button class="text-button" data-action="edit-account">${isDemo()?'录入账户':'更新账户'} ${icon('arrow',16)}</button></div>${a?accountSummary(a):emptyAccount()}</div>
    <div class="summary-panel"><div class="section-heading"><h2>计划概览</h2><button class="text-button" data-action="strategy">参数 ${icon('chevron',14)}</button></div><div class="small-card-row"><div class="small-card"><span class="label">成本目标价</span><strong class="num">${money(takeProfit(a,s))}</strong><small>成本 +${s.takeProfitPct}% · 计划值</small></div><div class="small-card"><span class="label">可用现金</span><strong class="num">${money(a?.settledCash)}</strong><small>已结算且未占用</small></div></div><div class="status-strip">${icon('clock',15)}<span>${isDemo()?'示例数据 · 非实时行情':a?'核实于 '+esc(dateText(a.verifiedAt))+'（北京）':'账户待录入'}</span></div></div></div>
    <section class="quick-actions" aria-label="常用操作">${[['plus','记录成交','record-trade'],['wallet','持仓与计划','nav-holdings'],['chart','交易复盘','nav-review'],['download','导出备份','export']].map(([symbol,label,action])=>`<button class="quick-action" data-action="${action}">${icon(symbol,19)}<span>${label}</span>${icon('chevron',16)}</button>`).join('')}</section>
    <details class="service-details"><summary>服务状态 <span>行情与 AI 未接入</span></summary>${infoRow('账户来源',isDemo()?'示例账户':'手动录入') }${infoRow('实时行情 / AI','未接入')}${infoRow('券商连接 / 自动下单','未接入')}<button class="text-button" data-action="privacy">数据与隐私 ${icon('chevron',14)}</button></details>`;
}
function accountSummary(a:Account):string {
  return `<section class="card account-card"><div class="account-top"><div class="flex"><div class="ticker-icon">T</div><div class="ticker-meta"><strong>TQQQ</strong><small>策略持仓</small></div></div><span class="chip ${isDemo()?'amber':'neutral'}">${isDemo()?'演示数据':a.source==='calculated'?'推算 · 待核对':'手动记录'}</span></div><div class="value-big num">${qty(a.shares)}<small>股</small></div><div class="stat-grid two"><div><small>平均成本</small><strong class="num">${money(a.avgCost)}</strong></div><div><small>现金总额</small><strong class="num">${money(a.cashTotal)}</strong></div></div></section>`;
}
function emptyAccount(){return `<div class="card empty"><div class="empty-icon">${icon('wallet',25)}</div><h3>还没有账户记录</h3><p>添加 TQQQ 持仓、成本和现金。</p>${button('录入账户','edit-account','secondary','plus')}</div>`;}
function holdingsPage(a:Account|null):string {
  const s=activeStrategy();const completed=a?.filledTranches;
  return `${intro('POSITION & PLAN','持仓与计划','TQQQ / 本轮策略')}
    ${a?accountSummary(a):emptyAccount()}
    <div class="actions">${button('更新账户','edit-account','primary','edit')}${button('记录成交','record-trade','secondary','plus')}</div>
    ${a?`<div class="section-heading"><h2>资金与核对</h2><button class="text-button" data-action="verify">${icon('check',14)} 确认无变化</button></div><div class="card">${infoRow('现金总额',money(a.cashTotal))}${infoRow('已结算可用现金',money(a.settledCash))}${infoRow('未结算 / 占用 / 未分类',a.cashTotal!==null&&a.settledCash!==null?money(a.cashTotal-a.settledCash):'未知')}${infoRow('挂单状态',a.orders==='none'?'无挂单':a.orders==='yes'?'<span class="amber">有挂单 · 请检查</span>':'<span class="amber">待核实</span>')}${a.orderNote?infoRow('挂单备注',esc(a.orderNote)):''}${infoRow('成本来源',a.costSource==='fills'?'按实际成交计算':a.costSource==='broker'?'券商记录':'未说明')}${infoRow('核实时间',isDemo()?'示例时间':esc(dateText(a.verifiedAt))+' 北京时间')}</div>`:''}
    <div class="section-heading"><h2>本轮买入阶梯</h2><button class="text-button" data-action="strategy">查看参数 ${icon('chevron',13)}</button></div><div class="card"><div class="between"><div><span class="label">已执行档位</span><h2 class="num mt8">${completed==null?'待核对':completed} <span class="dim small">/ ${s.tranches} 档</span></h2></div><div style="text-align:right"><span class="label">本轮计划预算</span><h2 class="num mt8">${money(s.budget)}</h2></div></div><div class="range-bar"><span style="width:${Math.min(100,100*(completed??0)/s.tranches)}%"></span></div><div class="ladder">${ladder(s,a?.anchorPrice??null).map(l=>`<div class="ladder-row ${completed!==null&&completed!==undefined&&l.index<=completed?'done':''}"><div class="ladder-n">${completed!=null&&l.index<=completed?icon('check',13):l.index}</div><div><span class="amount num">${money(l.price)}</span><br><small>${l.index===1?'首次成交锚点':`相对锚点 −${(l.index-1)*s.spacingPct}%`}</small></div><small class="num">每档 ${money(l.budget)}</small></div>`).join('')}</div><p class="section-note">阶梯为计划价格，不是买入信号。</p></div>
    ${notice('卖出后，请在券商核实可用现金。',true)}`;
}
function reviewPage():string {
  const trades=isDemo()?[]:state.trades;const events=isDemo()?[]:state.events;
  const merged: {at:string;title:string;body:string;kind:string}[]=[...trades.map(t=>({at:t.recordedAt,title:`${t.side==='buy'?'买入':'卖出'} ${qty(t.shares)} 股 TQQQ`,body:`成交均价 ${money(t.price)} · ${t.feeUnknown?'费用未知':`费用 ${money(t.fee)}`}。${t.warning} ${t.note}`,kind:t.side==='buy'?'plus':'receipt'})),...events.map(e=>({at:e.at,title:e.type,body:state.preferences.mask?'金额已隐藏。':e.description,kind:'edit'}))].sort((a,b)=>b.at.localeCompare(a.at));
  return `${intro('TRADE JOURNAL','交易复盘','成交与账户变更，按时间记录。')}
    <div class="review-metrics"><div class="metric-mini"><strong class="num">${trades.length}</strong><small>成交记录</small></div><div class="metric-mini"><strong class="num">${events.length}</strong><small>账户变更</small></div></div>

    <div class="section-heading"><h2>时间线</h2><button class="text-button" data-action="export">导出 ${icon('download',14)}</button></div><div class="card">${merged.length?merged.slice(0,100).map(r=>`<div class="timeline-item"><div class="timeline-icon">${icon(r.kind,16)}</div><div class="timeline-body"><div class="between"><h3>${esc(r.title)}</h3><time>${esc(dateText(r.at))}</time></div><p>${esc(r.body)}</p></div></div>`).join(''):`<div class="empty"><div class="empty-icon">${icon('receipt',25)}</div><h3>暂无记录</h3><p>${isDemo()?'录入账户，开始记录你的交易。':'账户更新与成交会显示在这里。'}</p>${button('录入我的账户','edit-account','secondary','plus')}</div>`}</div>
    <p class="section-note">北京时间 · 手动记录</p>`;
}
function settingsRow(i:string,title:string,sub:string,action:string,right=''):string{return `<button class="setting-row" data-action="${action}">${icon(i,19)}<span class="setting-content"><strong>${title}</strong><small>${sub}</small></span>${right||icon('chevron',16)}</button>`;}
function settingsPage():string {
  return `${intro('PREFERENCES','设置','管理策略、偏好与本机数据。')}
    <div class="card"><div class="between"><div class="flex"><div class="brand-mark">E</div><div><h3>ETHAN INVEST TRADER</h3><p class="tiny">本机工作台 · v ${VERSION}</p></div></div><span class="chip neutral">LOCAL</span></div><div class="line"></div><p class="small">数据保存在当前浏览器。</p></div>
    <div class="section-heading"><h2>工作台</h2></div><div class="card">${settingsRow('settings','策略与资金参数','预算、档位与成本目标','strategy')}${settingsRow('eye','金额隐私','显示或隐藏金额','mask',`<span class="toggle ${state.preferences.mask?'on':''}" aria-hidden="true"></span>`)}${settingsRow('phone','添加到手机主屏幕','快捷打开工作台','install')}${settingsRow('bell','通知与后台运行','未启用','notifications')}</div>
    <div class="section-heading"><h2>数据管理</h2><span class="eyebrow">ON THIS DEVICE</span></div><div class="card">${settingsRow('download','导出本机备份','账户、成交与策略参数','export')}${settingsRow('upload','恢复备份','从 JSON 文件恢复','import')}${settingsRow('shield','数据与隐私','存储与备份说明','privacy')}${settingsRow('trash','清空我的记录','删除当前浏览器内的记录','reset')}</div>
    <div class="section-heading"><h2>连接状态</h2></div><div class="card">${infoRow('账户', '手动维护 · 本机')}${infoRow('实时行情', '<span class="amber">未接入</span>')}${infoRow('AI 分析', '<span class="amber">未接入</span>')}${infoRow('推送 / 云同步', '未接入')}</div>
    <div class="version-footer">ETHAN INVEST TRADER · ${VERSION}<br>Style inspired by Forty / HTML5 UP</div>`;
}
function openModal(title:string,sub:string,body:string){
  if(sheet.open) sheet.close();
  lastFocusAction=(document.activeElement as HTMLElement)?.dataset?.action??'';
  sheet.innerHTML=`<div class="sheet-head"><div class="sheet-handle"></div><div class="between"><div><h2 id="sheet-title">${title}</h2><p>${sub}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon('close',18)}</button></div></div><div class="sheet-body">${body}</div>`;
  sheet.showModal();document.body.style.overflow='hidden';
  sheet.querySelector<HTMLElement>('.sheet-body')?.scrollTo(0,0);
}
function closeModal(){if(sheet.open) sheet.close();document.body.style.overflow='';}
sheet.addEventListener('close',()=>{document.body.style.overflow='';if(lastFocusAction) document.querySelector<HTMLElement>(`[data-action="${lastFocusAction}"]`)?.focus({preventScroll:true});});
sheet.addEventListener('click',e=>{if(e.target===sheet){const r=sheet.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) closeModal();}});
function openAccount(){
  const a=state.account;
  openModal(a?'核对账户状态':'录入我的账户','TQQQ · 金额单位 USD',`

    <form id="account-form"><div class="form-grid">${field('shares','策略持仓股数',a?.shares??'', 'number','空仓请填 0','例如 60')}${field('avgCost','平均持仓成本 / 股',a?.avgCost??'', 'number','不是当前市场价格')}${field('cashTotal','现金总额',a?.cashTotal??'', 'number','包含本策略未结算款')}${field('settledCash','已结算可用现金',a?.settledCash??'', 'number','这是现金总额的一部分')}</div>
    <div class="mt16"><label class="field"><span>挂单状态</span><select name="orders"><option value="unknown" ${!a||a.orders==='unknown'?'selected':''}>不确定，需要核实</option><option value="none" ${a?.orders==='none'?'selected':''}>已核实：无挂单</option><option value="yes" ${a?.orders==='yes'?'selected':''}>有未成交 / 部分成交挂单</option></select></label></div>
    <div id="order-note-wrap" class="${a?.orders==='yes'?'':'hidden'}"><label class="field"><span>挂单备注：方向 / 剩余股数 / 限价 / 有效期</span><textarea name="orderNote" maxlength="1000" placeholder="例如：买入 10 股，限价 50 美元，当日有效，尚未成交">${esc(a?.orderNote??'')}</textarea><small>备注不会提交订单；实际成交另行记录。</small></label></div>
    <label class="field"><span>成本来源</span><select name="costSource"><option value="unknown" ${!a||a.costSource==='unknown'?'selected':''}>未说明 / 不确定</option><option value="fills" ${a?.costSource==='fills'?'selected':''}>按实际成交计算</option><option value="broker" ${a?.costSource==='broker'?'selected':''}>抄录 Schwab 展示成本</option></select><small>券商展示成本可能与本轮实际成交成本不同。</small></label>
    ${field('verifiedAt','核实时间（北京时间）',localBeijing(),'datetime-local','以券商核对时间为准')}
    <details><summary>补仓信息（可选）</summary><div class="form-grid">${field('anchorPrice','首次买入实际价格',a?.anchorPrice??'')}${field('filledTranches','已执行买入档数',a?.filledTranches??'')}</div><div class="mt16">${field('firstBuyDate','首次买入日期',a?.firstBuyDate??'','date')}</div><p class="section-note">填写首次买入价后可查看阶梯。</p></details>
    <label class="check-line"><input type="checkbox" name="ack" required><span>确认以上为本轮策略的手动记录。</span></label>
    <div class="form-error hidden" id="form-error" role="alert"></div><div class="form-actions">${button('取消','close-modal','secondary')}<button class="button primary" type="submit">保存账户记录 ${icon('check',16)}</button></div></form>`);
  sheet.querySelector<HTMLSelectElement>('[name=orders]')!.addEventListener('change',e=>sheet.querySelector('#order-note-wrap')!.classList.toggle('hidden',(e.target as HTMLSelectElement).value!=='yes'));
  sheet.querySelector<HTMLFormElement>('#account-form')!.addEventListener('submit',saveAccount);
}
function numberInput(f:FormData,name:string):number|null{const value=String(f.get(name)??'').trim();if(!value)return null;const n=Number(value);if(!Number.isFinite(n))throw new Error('请输入有效数字。');return n;}
function showFormError(error:unknown){const el=sheet.querySelector<HTMLDivElement>('#form-error');if(el){el.textContent=error instanceof Error?error.message:'无法保存，请核对输入。';el.classList.remove('hidden');el.scrollIntoView({block:'nearest',behavior:'smooth'});}}
function saveAccount(e:SubmitEvent){e.preventDefault();try{
  const f=new FormData(e.target as HTMLFormElement);const shares=numberInput(f,'shares');if(shares===null)throw new Error('请填写持仓股数；空仓请明确填 0。');
  const verifiedAt=parseBeijing(String(f.get('verifiedAt')));if(Date.parse(verifiedAt)>Date.now()+60_000)throw new Error('核实时间不能在未来。');
  if(state.trades.some(t=>Date.parse(t.at)>Date.parse(verifiedAt)))throw new Error('核实时间早于已录入的最新成交，请使用更晚的账户核实时间。');
  const account:Account={shares,avgCost:shares===0?null:numberInput(f,'avgCost'),cashTotal:numberInput(f,'cashTotal'),settledCash:numberInput(f,'settledCash'),orders:f.get('orders') as Account['orders'],orderNote:String(f.get('orderNote')??''),costSource:f.get('costSource') as Account['costSource'],anchorPrice:shares===0?null:numberInput(f,'anchorPrice'),filledTranches:shares===0?0:numberInput(f,'filledTranches'),firstBuyDate:shares===0?'':String(f.get('firstBuyDate')??''),verifiedAt,updatedAt:verifiedAt,source:'confirmed'};
  const err=validateAccount(account);if(err)throw new Error(err);
  if(account.filledTranches!==null&&account.filledTranches>state.strategy.tranches)throw new Error('已执行档数超过当前策略档数，请先核对策略。');
  const next=clone();const before=next.account;next.account=account;next.mode='manual';
  addEvent(next,before?'账户快照核对':'账户初始化',`持仓 ${before?.shares??'未建档'} → ${account.shares} 股；均价 ${before?.avgCost??'未知'} → ${account.avgCost??'未知'}；现金总额 ${before?.cashTotal??'未知'} → ${account.cashTotal??'未知'}。快照直接替换，不与历史成交再相加；差额不记为收益。`);
  if(persist(next)){closeModal();render();toast('账户已保存。');}
}catch(error){showFormError(error);}}
function openTrade(){
  if(isDemo()||!state.account){openModal('先录入账户','记录成交前需要当前持仓。',`<div class="empty"><div class="empty-icon">${icon('wallet',25)}</div><h3>添加当前持仓</h3><p>录入账户后再记录新成交。已计入持仓的历史成交请勿重复添加。</p>${button('录入账户','edit-account','primary')}</div>`);return;}
  const tradeId=uid();
  openModal('记录实际成交','不是下单。仅填写已经在 Schwab 成交的部分。',`${notice('保存后只更新本机的推算状态；请与 Schwab 核对。卖出款不会自动转为已结算现金。',true)}<form id="trade-form"><label class="field"><span>成交方向</span><select name="side"><option value="buy">买入 TQQQ</option><option value="sell">卖出 TQQQ</option></select></label><div class="form-grid">${field('shares','实际成交股数','','number','','例如 10')}${field('price','实际成交均价','','number','','美元 / 股')}${field('fee','费用（可未知）','','number','明确无费用才填 0')}${field('tranche','本轮第几档（可选）','','number','不确定就留空')}</div><div class="mt16">${field('at','实际成交时间（北京时间）',localBeijing(),'datetime-local','只记录当前账户快照之后的成交。')}</div>${field('note','备注','','text','例如：自主交易 / 对应建议编号','可留空')}<label class="check-line"><input type="checkbox" required><span>这是已成交记录，不是挂单；股数只包含本策略持仓。</span></label><div class="form-error hidden" id="form-error" role="alert"></div><div class="form-actions">${button('取消','close-modal','secondary')}<button class="button primary" type="submit">保存成交记录</button></div></form>`);
  sheet.querySelector<HTMLFormElement>('#trade-form')!.addEventListener('submit',e=>{e.preventDefault();try{
    const f=new FormData(e.target as HTMLFormElement);const input:TradeInput={id:tradeId,side:f.get('side') as 'buy'|'sell',shares:numberInput(f,'shares')??0,price:numberInput(f,'price')??0,fee:numberInput(f,'fee'),at:parseBeijing(String(f.get('at'))),tranche:numberInput(f,'tranche'),note:String(f.get('note')??'')};
    if(input.tranche!==null&&input.tranche>state.strategy.tranches)throw new Error('成交档位超过当前策略档数。');
    const record=applyTrade(state.account!,input,state.trades);const next=clone();next.trades.unshift(record);next.account=record.after;
    if(persist(next)){closeModal();page='holdings';render();toast('成交已记录，账户为推算状态，请核对。');}
  }catch(error){showFormError(error);}});
}
function openStrategy(){
  const s=state.strategy;
  openModal('策略参数','设置本轮预算与分批计划。',`${notice('参数仅用于计划计算，不代表交易建议。')}
    <form id="strategy-form"><div class="form-grid">${field('lookbackDays','历史观察窗口 / 交易日',s.lookbackDays)}${field('entryDipPct','首次入场回撤 / %',s.entryDipPct)}${field('tranches','最多买入档数',s.tranches)}${field('spacingPct','每档距首次价 / %',s.spacingPct)}${field('takeProfitPct','成本上止盈幅度 / %',s.takeProfitPct)}${field('budget','本轮计划预算 / $',s.budget)}${field('reserve','计划保留现金 / $',s.reserve)}</div><p class="section-note">档位间距以首次成交价为基准。</p><div class="form-error hidden" id="form-error" role="alert"></div><div class="form-actions">${button('取消','close-modal','secondary')}<button class="button primary" type="submit">保存参数版本</button></div></form>`);
  sheet.querySelector<HTMLFormElement>('#strategy-form')!.addEventListener('submit',e=>{e.preventDefault();try{
    const f=new FormData(e.target as HTMLFormElement);const updated:Strategy={version:state.strategy.version+1,lookbackDays:numberInput(f,'lookbackDays')??0,entryDipPct:numberInput(f,'entryDipPct')??0,tranches:numberInput(f,'tranches')??0,spacingPct:numberInput(f,'spacingPct')??0,takeProfitPct:numberInput(f,'takeProfitPct')??0,budget:numberInput(f,'budget')??0,reserve:numberInput(f,'reserve')??0};
    const err=validateStrategy(updated);if(err)throw new Error(err);
    if((state.account?.filledTranches??0)>updated.tranches)throw new Error('新档数小于已记录的执行档数，请先核对账户。');
    const next=clone();next.strategy=updated;next.mode='manual';addEvent(next,'策略参数更新',`研究参数 v${updated.version}：L=${updated.lookbackDays}，D=${updated.entryDipPct}%，N=${updated.tranches}，Y=${updated.spacingPct}%，Z=${updated.takeProfitPct}%，预算 $${updated.budget}。不代表已验证的交易建议。`);
    if(persist(next)){closeModal();render();toast('参数已保存。');}
  }catch(error){showFormError(error);}});
}
function openAnalysis(){openModal('AI 分析','尚未接入',`<p>接入行情与 AI 后可查看分析。目前可使用持仓记录和分批计划。</p>${button('知道了','close-modal','primary full')}`);}
function openPrivacy(){openModal('数据与隐私','记录保存在当前浏览器。',`<div class="note-box"><h3>本机保存</h3><p>账户与成交不会上传。记录未加密，隐藏金额仅影响显示。</p></div><div class="note-box"><h3>定期备份</h3><p>清理浏览器数据或更换设备前，请导出备份。</p></div><div class="note-box"><h3>服务状态</h3><p>未连接券商、行情或 AI；不自动下单，也不在后台监控。</p></div>${button('知道了','close-modal','primary full')}`);}
function openNotifications(){openModal('通知','尚未启用',`<p>暂不支持行情监控、后台任务与推送提醒。</p>${button('知道了','close-modal','primary full')}`);}
async function install(){
  if(deferredInstall){await deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;return;}
  const installed=window.matchMedia('(display-mode: standalone)').matches;
  openModal(installed?'已安装':'添加到主屏幕','在手机浏览器中打开应用网址。',`${installed?notice('当前已在独立窗口运行。',true):''}<div class="note-box"><h3>iPhone / iPad</h3><p>Safari → 分享 → 添加到主屏幕。</p></div><div class="note-box"><h3>Android</h3><p>Chrome → 菜单 → 安装应用或添加到主屏幕。</p></div>${button('知道了','close-modal','primary full')}`);
}
function downloadBackup(){const raw=storageError&&rawCache?rawCache:JSON.stringify(state,null,2);const blob=new Blob([raw],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ETHAN_TRADER_${new Date().toISOString().slice(0,10)}.backup.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('备份已导出。');}
function resetPrompt(){openModal('清空本机记录？','不可撤销；不会影响 Schwab 的任何资产。',`${notice('这会删除当前浏览器里保存的持仓、成交、参数和事件。建议先导出备份。')}<div class="actions">${button('先导出备份','export','secondary','download')}${button('确认清空','reset-confirm','danger','trash')}</div>`);}
async function handleAction(action:string){
  if(action.startsWith('nav-')){page=action.slice(4) as typeof page;render();window.scrollTo({top:0});return;}
  switch(action){
    case 'mode-demo':case 'mode-manual':{const next=clone();next.mode=action==='mode-demo'?'demo':'manual';if(persist(next))render();break;}
    case 'mask':{const next=clone();next.preferences.mask=!next.preferences.mask;if(persist(next))render();break;}
    case 'edit-account':openAccount();break;
    case 'record-trade':openTrade();break;
    case 'strategy':openStrategy();break;
    case 'analysis':openAnalysis();break;
    case 'notifications':openNotifications();break;
    case 'privacy':openPrivacy();break;
    case 'install':await install();break;
    case 'export':downloadBackup();break;
    case 'import':document.querySelector<HTMLInputElement>('#backup-input')!.click();break;
    case 'reset':resetPrompt();break;
    case 'reset-confirm':if(persist(freshState(),true)){closeModal();page='decision';render();toast('本机记录已清空，返回演示体验。');}break;
    case 'close-modal':closeModal();break;
    case 'verify':if(isDemo()){toast('演示账户无需核对；请先录入自己的账户。');}else if(state.account){const next=clone();next.account={...state.account,source:'confirmed',verifiedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};addEvent(next,'用户确认无变化','用户报告已在 Schwab 核实账户，未发生持仓和现金变化；不是券商自动验证。');if(persist(next)){render();toast('已记录你的核实确认。');}}break;
    case 'update-app':waitingWorker?.postMessage({type:'ACTIVATE_UPDATE'});break;
  }
}
document.addEventListener('click',event=>{const target=(event.target as Element).closest<HTMLButtonElement>('button[data-action]');if(target){event.preventDefault();void handleAction(target.dataset.action!);}});
document.querySelector<HTMLInputElement>('#backup-input')!.addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  try{if(file.size>5_000_000)throw new Error('备份超过 5 MB。');const loaded=decodeState(await file.text());openModal('恢复这份备份？','恢复会覆盖本浏览器的当前记录，请先导出当前版本。',`<div class="note-box"><h3>已通过格式检查</h3><p>${loaded.trades.length} 条成交，${loaded.events.length} 条事件。文件名称：${esc(file.name)}。</p></div>${notice('不要导入来源不明的账户备份。恢复后请核对持仓和资金。')}<div class="actions">${button('取消','close-modal','secondary')}<button class="button primary" id="restore-confirm">确认恢复</button></div>`);sheet.querySelector('#restore-confirm')!.addEventListener('click',()=>{loaded.mode='manual';if(persist(loaded,true)){closeModal();page='holdings';render();toast('已恢复到本机，请核对账户。');}});
  }catch(error){toast(error instanceof Error?error.message:'备份无法读取。');}finally{input.value='';}
});
window.addEventListener('online',render);window.addEventListener('offline',render);
window.addEventListener('storage',event=>{if(event.key===STORE_KEY){try{state=event.newValue?decodeState(event.newValue):freshState();rawCache=event.newValue;storageError='';closeModal();render();toast('另一个窗口更新了本机记录，已刷新。');}catch{storageError='另一个窗口的记录格式有误，请导出备份核对。';render();}}});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event as typeof deferredInstall;});
window.addEventListener('appinstalled',()=>toast('已添加到设备。'));
render();
if('serviceWorker' in navigator && window.isSecureContext){
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;window.location.reload();}});
  void navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
    if(reg.waiting){waitingWorker=reg.waiting;render();}
    reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){waitingWorker=reg.waiting;render();}});});
  }).catch(()=>{toast('离线缓存未启用；在线界面仍可使用。');});
}
