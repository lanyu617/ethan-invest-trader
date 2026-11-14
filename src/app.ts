import {freshState, demoAccount, DEFAULT_STRATEGY, validateAccount, validateStrategy,
  ladder, takeProfit, applyTrade, decodeState, type AppState, type Account,
  type Strategy, type TradeInput, type AuditEvent} from './core.js';

const STORE_KEY = 'ethan-invest-trader.local.v1';
const VERSION = '0.1.0';
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
    <main id="main"><div class="mode-bar" aria-label="数据模式"><button class="${isDemo()?'active':''}" data-action="mode-demo" aria-pressed="${isDemo()}">演示体验<span class="mode-tag">DEMO</span></button><button class="${!isDemo()?'active':''}" data-action="mode-manual" aria-pressed="${!isDemo()}">我的记录<span class="tiny">· 本机</span></button></div>
    ${!navigator.onLine?'<div class="offline-bar">离线模式 · 仅查看本机记录，没有实时行情</div>':''}
    ${storageError?notice(`${esc(storageError)}<br><button class="text-button" data-action="export">导出本机原始记录 ${icon('download',13)}</button>`):''}
    ${waitingWorker?`<div class="notice subtle">${icon('refresh')}<span>发现新版本。<button class="text-button" data-action="update-app">更新界面，保留本机数据</button></span></div>`:''}
    ${page==='decision'?decisionPage(a):page==='holdings'?holdingsPage(a):page==='review'?reviewPage():settingsPage()}
    </main><nav class="bottom-nav" aria-label="主导航">${[['decision','compass','决策'],['holdings','wallet','持仓'],['review','chart','复盘'],['settings','settings','设置']].map(([p,i,label])=>`<button class="nav-item ${page===p?'active':''}" data-action="nav-${p}" ${page===p?'aria-current="page"':''}><span class="nav-icon">${icon(i,21)}</span><span>${label}</span></button>`).join('')}</nav></div>`;
}
function intro(eyebrow:string,title:string,sub:string){return `<div class="page-intro"><div class="page-heading-row"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div><span class="prototype">界面体验版<br>v${VERSION}</span></div><p>${sub}</p></div>`;}
function decisionPage(a:Account|null):string {
  const s=activeStrategy();
  return `${intro('YOUR DECISION DESK','先看清，再行动。','专注 TQQQ · 分批计划 · 每一步都有记录')}
    <section class="card hero-card" aria-label="AI 决策状态"><div class="between"><div class="flex"><div class="hero-icon">${icon('sparkle',22)}</div><span class="eyebrow">AI DECISION</span></div><span class="chip amber"><i class="dot"></i> 尚未接入</span></div>
      <h2>${a?'账户之外，还需要证据。':'从你的持仓开始。'}</h2><p class="description">${isDemo()?'先体验一份清楚、有边界的决策界面。当前为示例账户，没有真实行情，也没有 AI 交易建议。':a?'你的账户已记录。接入可靠行情与 AI 后，这里将展示行动方案、支持依据、反对理由与失效条件。':'录入 TQQQ 持仓与可用现金，为后续分析建立起点。本版只记录与计算，不提供实时交易建议。'}</p>
      <div class="steps" aria-hidden="true"><span class="step ${a?'done':''}"></span><span class="step"></span><span class="step"></span></div>
      ${button(a?'查看决策卡结构':'录入我的账户',a?'analysis':'edit-account','primary','arrow')}
      <div class="hero-bottom"><span>${icon('shield',12)}</span><span>数据可核对 · 建议有边界 · 交易由你决定</span></div></section>
    <div class="section-heading"><h2>账户一眼看清</h2><button class="text-button" data-action="edit-account">${isDemo()?'录入我的数据':'更新账户'} ${icon('edit',13)}</button></div>
    ${a?accountSummary(a):emptyAccount()}
    <div class="small-card-row"><div class="small-card"><div class="flex label">${icon('chart',14)}按成本计算的目标</div><strong class="num">${money(takeProfit(a,s))}</strong><small>研究参数 +${s.takeProfitPct}% · 非卖出建议</small></div><div class="small-card"><div class="flex label">${icon('wallet',14)}已结算可用现金</div><strong class="num">${money(a?.settledCash)}</strong><small>${isDemo()?'示例金额 · 不是你的账户':'手动维护 · 下单前核实'}</small></div></div>
    <div class="section-heading"><h2>把依据放在结论前面</h2><span class="eyebrow">EVIDENCE FIRST</span></div><div class="card">${infoRow('市场报价','<span class="amber">未接入</span>')}${infoRow('账户来源',isDemo()?'示例账户':a?'你手动录入的记录':'待录入')}${infoRow('账户最后核实',isDemo()?'演示，不代表实时':esc(dateText(a?.verifiedAt??null))+' 北京时间')}${infoRow('AI 服务 / 后台任务','未配置 / 未启动')}</div>
    ${button('记录在 Schwab 的实际成交','record-trade','secondary full','plus')}
    <p class="section-note center">本软件不连接 Schwab，不下单。<br>${isDemo()?'演示金额和价格不代表任何真实行情。':'本机记录未加密，不是券商认证的账户数据。'}</p>`;
}
function accountSummary(a:Account):string {
  const price=54.2;
  return `<section class="card"><div class="account-top"><div class="flex"><div class="ticker-icon">T</div><div class="ticker-meta"><strong>TQQQ</strong><small>本策略持仓</small></div></div><span class="chip ${isDemo()?'amber':'neutral'}">${isDemo()?'演示数据':a.source==='calculated'?'推算 · 待核对':'手动记录'}</span></div>
    <div class="value-big num">${isDemo()?money(a.shares*price+(a.cashTotal??0)):qty(a.shares)}${isDemo()?'': '<small>股</small>'}</div><p class="small">${isDemo()?'示例策略权益 · 假设价格 $54.20':'未接入实时价格，不估算当前权益'}</p>
    ${isDemo()?`<svg class="sparkline" viewBox="0 0 340 82" preserveAspectRatio="none" role="img" aria-label="人工绘制的示意曲线，不是市场行情"><defs><linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#c2f27b" stop-opacity=".18"/><stop offset="100%" stop-color="#c2f27b" stop-opacity="0"/></linearGradient></defs><path class="sparkline-grid" d="M0 20H340M0 50H340M0 80H340"/><path d="M0 22L15 24L28 17L42 25L56 20L70 34L85 30L98 45L112 37L126 50L140 42L154 60L169 57L183 69L197 54L211 59L225 46L239 51L253 36L268 43L282 28L296 34L312 23L326 28L340 16V82H0Z" fill="url(#spark-fill)"/><path d="M0 22L15 24L28 17L42 25L56 20L70 34L85 30L98 45L112 37L126 50L140 42L154 60L169 57L183 69L197 54L211 59L225 46L239 51L253 36L268 43L282 28L296 34L312 23L326 28L340 16" stroke="#c2f27b" stroke-width="2" fill="none"/><circle cx="337" cy="19" r="3" fill="#c2f27b"/></svg><div class="chart-labels"><span>人工示意曲线</span><span>不是行情 · 不是业绩</span></div>`:''}
    <div class="stat-grid"><div><small>持仓股数</small><strong class="num">${qty(a.shares)}</strong></div><div><small>每股平均成本</small><strong class="num">${money(a.avgCost)}</strong></div><div><small>现金总额</small><strong class="num">${money(a.cashTotal)}</strong></div></div></section>`;
}
function emptyAccount(){return `<div class="card empty"><div class="empty-icon">${icon('wallet',25)}</div><h3>你的账户，自己掌握</h3><p>填写持仓、成本和现金。不需要券商账号、密码或 API 授权。</p>${button('初始化账户','edit-account','secondary','plus')}</div>`;}
function holdingsPage(a:Account|null):string {
  const s=activeStrategy();const completed=a?.filledTranches;
  return `${intro('YOUR POSITION','账户与计划','只记录属于这轮策略的 TQQQ，不混入长期仓位。')}
    ${a?accountSummary(a):emptyAccount()}
    <div class="actions">${button('更新账户','edit-account','primary','edit')}${button('记录成交','record-trade','secondary','plus')}</div>
    ${a?`<div class="section-heading"><h2>资金与核对</h2><button class="text-button" data-action="verify">${icon('check',14)} 已核对，无变化</button></div><div class="card">${infoRow('现金总额',money(a.cashTotal))}${infoRow('其中已结算且未占用',money(a.settledCash))}${infoRow('未结算 / 占用 / 未分类',a.cashTotal!==null&&a.settledCash!==null?money(a.cashTotal-a.settledCash):'未知')}${infoRow('挂单状态',a.orders==='none'?'手动报告：无':a.orders==='yes'?'<span class="amber">有挂单 · 请检查</span>':'<span class="amber">未知 · 需要核实</span>')}${a.orderNote?infoRow('挂单备注',esc(a.orderNote)):''}${infoRow('成本来源',a.costSource==='fills'?'按实际成交计算':a.costSource==='broker'?'抄录券商展示值':'未说明')}${infoRow('核实时间',isDemo()?'示例时间':esc(dateText(a.verifiedAt))+' 北京时间')}</div>`:''}
    <div class="section-heading"><h2>本轮买入阶梯</h2><button class="text-button" data-action="strategy">查看参数 ${icon('chevron',13)}</button></div><div class="card"><div class="between"><div><span class="label">已执行档位</span><h2 class="num mt8">${completed==null?'待核对':completed} <span class="dim small">/ ${s.tranches} 档</span></h2></div><div style="text-align:right"><span class="label">本轮计划预算</span><h2 class="num mt8">${money(s.budget)}</h2></div></div><div class="range-bar"><span style="width:${Math.min(100,100*(completed??0)/s.tranches)}%"></span></div><div class="ladder">${ladder(s,a?.anchorPrice??null).map(l=>`<div class="ladder-row ${completed!==null&&completed!==undefined&&l.index<=completed?'done':''}"><div class="ladder-n">${completed!=null&&l.index<=completed?icon('check',13):l.index}</div><div><span class="amount num">${money(l.price)}</span><br><small>${l.index===1?'首次成交锚点':`相对锚点 −${(l.index-1)*s.spacingPct}%`}</small></div><small class="num">每档 ${money(l.budget)}</small></div>`).join('')}</div><p class="section-note">仅展示数学计划，不代表触发了买入信号。档位金额不代表累计实际投入；实际成交以你录入为准。</p></div>
    ${notice('现金总额与已结算现金不相加。卖出款不会自动变成已结算可用资金，需到 Schwab 核实。',true)}`;
}
function reviewPage():string {
  const trades=isDemo()?[]:state.trades;const events=isDemo()?[]:state.events;
  const merged: {at:string;title:string;body:string;kind:string}[]=[...trades.map(t=>({at:t.recordedAt,title:`${t.side==='buy'?'买入':'卖出'} ${qty(t.shares)} 股 TQQQ`,body:`成交均价 ${money(t.price)} · ${t.feeUnknown?'费用未知':`费用 ${money(t.fee)}`}。${t.warning} ${t.note}`,kind:t.side==='buy'?'plus':'receipt'})),...events.map(e=>({at:e.at,title:e.type,body:state.preferences.mask?'金额已隐藏。':e.description,kind:'edit'}))].sort((a,b)=>b.at.localeCompare(a.at));
  return `${intro('RECORD, THEN REVIEW','让记录说话。','已查看不是已成交；示例也不是投资效果。')}
    <div class="review-metrics"><div class="metric-mini"><strong class="num">${trades.length}</strong><small>手动成交记录</small></div><div class="metric-mini"><strong class="num">0</strong><small>真实 AI 建议 · 尚未接入</small></div></div>
    ${notice('本版没有实时行情和 AI 历史，不计算年化、胜率或建议增益。资金变动与持仓覆盖不视为收益。',true)}
    <div class="section-heading"><h2>账户与成交时间线</h2><button class="text-button" data-action="export">导出 ${icon('download',14)}</button></div><div class="card">${merged.length?merged.slice(0,100).map(r=>`<div class="timeline-item"><div class="timeline-icon">${icon(r.kind,16)}</div><div class="timeline-body"><div class="between"><h3>${esc(r.title)}</h3><time>${esc(dateText(r.at))}</time></div><p>${esc(r.body)}</p></div></div>`).join(''):`<div class="empty"><div class="empty-icon">${icon('receipt',25)}</div><h3>第一笔记录，从你开始</h3><p>${isDemo()?'演示模式不生成真实记录。切换到“我的记录”，建立自己的账户。':'更新账户或记录成交后，时间线会保留变更。这里不把未知结果填成盈利。'}</p>${button('录入我的账户','edit-account','secondary','plus')}</div>`}</div>
    <p class="section-note">时间默认北京时间。成交记录是你手动报告的状态，未与券商验证；不是税务账本。</p>`;
}
function settingsRow(i:string,title:string,sub:string,action:string,right=''):string{return `<button class="setting-row" data-action="${action}">${icon(i,19)}<span class="setting-content"><strong>${title}</strong><small>${sub}</small></span>${right||icon('chevron',16)}</button>`;}
function settingsPage():string {
  return `${intro('YOUR WORKSPACE','轻量，也有边界。','设置与数据保存在本机，没有后台账户同步。')}
    <div class="card"><div class="between"><div class="flex"><div class="brand-mark">E</div><div><h3>ETHAN INVEST TRADER</h3><p class="tiny">移动 PWA · 本机体验版 ${VERSION}</p></div></div><span class="chip neutral">LOCAL</span></div><div class="line"></div><p class="small">无需 Schwab 授权。没有自动交易，也没有 AI 密钥输入框。</p></div>
    <div class="section-heading"><h2>工作台</h2></div><div class="card">${settingsRow('settings','策略与资金参数','候选研究值，不是验证过的盈利方案','strategy')}${settingsRow('eye','金额隐私','只改变界面显示，不是数据加密','mask',`<span class="toggle ${state.preferences.mask?'on':''}" aria-hidden="true"></span>`)}${settingsRow('phone','添加到手机主屏幕','安装 PWA，像 App 一样打开','install')}${settingsRow('bell','通知与后台运行','尚未接入推送和后台定时任务','notifications')}</div>
    <div class="section-heading"><h2>数据管理</h2><span class="eyebrow">ON THIS DEVICE</span></div><div class="card">${settingsRow('download','导出本机备份','JSON 格式；包含你填写的账户数据','export')}${settingsRow('upload','恢复备份','覆盖当前本机记录前会再次确认','import')}${settingsRow('shield','隐私与能力边界','本机明文存储，无登录，无服务端上传','privacy')}${settingsRow('trash','清空我的记录','仅清除此浏览器中的本应用数据','reset')}</div>
    <div class="section-heading"><h2>连接状态</h2></div><div class="card">${infoRow('账户', '手动维护 · 本机')}${infoRow('实时行情', '<span class="amber">未接入</span>')}${infoRow('AI 分析', '<span class="amber">未接入</span>')}${infoRow('推送 / 云同步', '未接入')}${infoRow('InvestLab PC', '后续共用服务')}</div>
    <div class="version-footer">ETHAN INVEST TRADER · BUILD WITH INTENTION<br>规则有边界，判断有依据。</div>`;
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
  openModal(a?'核对账户状态':'录入我的账户','只记录本策略的 TQQQ；金额均为美元。',`
    ${notice('数据只存在本机，未加密、未连接券商。建议先使用小额示例验证流程，并定期导出备份。',true)}
    <form id="account-form"><div class="form-grid">${field('shares','策略持仓股数',a?.shares??'', 'number','空仓请填 0','例如 60')}${field('avgCost','平均持仓成本 / 股',a?.avgCost??'', 'number','不是当前市场价格')}${field('cashTotal','现金总额',a?.cashTotal??'', 'number','包含本策略未结算款')}${field('settledCash','其中已结算且未占用',a?.settledCash??'', 'number','这是现金总额的一部分')}</div>
    <div class="mt16"><label class="field"><span>挂单状态</span><select name="orders"><option value="unknown" ${!a||a.orders==='unknown'?'selected':''}>不确定，需要核实</option><option value="none" ${a?.orders==='none'?'selected':''}>已核实：无挂单</option><option value="yes" ${a?.orders==='yes'?'selected':''}>有未成交 / 部分成交挂单</option></select></label></div>
    <div id="order-note-wrap" class="${a?.orders==='yes'?'':'hidden'}"><label class="field"><span>挂单备注：方向 / 剩余股数 / 限价 / 有效期</span><textarea name="orderNote" maxlength="1000" placeholder="例如：买入 10 股，限价 50 美元，当日有效，尚未成交">${esc(a?.orderNote??'')}</textarea><small>备注不会提交订单；实际成交另行记录。</small></label></div>
    <label class="field"><span>成本来源</span><select name="costSource"><option value="unknown" ${!a||a.costSource==='unknown'?'selected':''}>未说明 / 不确定</option><option value="fills" ${a?.costSource==='fills'?'selected':''}>按实际成交计算</option><option value="broker" ${a?.costSource==='broker'?'selected':''}>抄录 Schwab 展示成本</option></select><small>券商展示成本可能与本轮实际成交成本不同。</small></label>
    ${field('verifiedAt','核实时间（北京时间）',localBeijing(),'datetime-local','请填写实际查看 Schwab 并核对的时间。')}
    <details><summary>本轮补仓信息（可选，不知道就留空）</summary><div class="form-grid">${field('anchorPrice','首次买入实际价格',a?.anchorPrice??'')}${field('filledTranches','已执行买入档数',a?.filledTranches??'')}</div><div class="mt16">${field('firstBuyDate','首次买入日期',a?.firstBuyDate??'','date')}</div><p class="section-note">缺少首次成交锚点时，不会用平均成本猜测补仓阶梯。</p></details>
    <label class="check-line"><input type="checkbox" name="ack" required><span>我确认仅填写本策略的数据，不包含不参与本轮的长期仓位；这是手动记录，不是实时账户同步。</span></label>
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
  if(persist(next)){closeModal();render();toast('已保存在本机；没有上传或连接券商。');}
}catch(error){showFormError(error);}}
function openTrade(){
  if(isDemo()||!state.account){openModal('先建立自己的账户','演示数据不会变成你的实际持仓。',`<div class="empty"><div class="empty-icon">${icon('wallet',25)}</div><h3>成交需要明确的起点</h3><p>先填写当前账户快照，再记录此时点之后的新成交。已经包含在快照中的历史成交不要重复加入。</p>${button('录入我的账户','edit-account','primary')}</div>`);return;}
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
  openModal('策略与资金边界','保存研究参数，不会生成或提交任何订单。',`${notice('下列初始值只是研究候选参数，未经过盈利验证。没有行情和 AI 时，仅用于展示阶梯与成本目标。')}
    <form id="strategy-form"><div class="form-grid">${field('lookbackDays','历史观察窗口 / 交易日',s.lookbackDays)}${field('entryDipPct','首次入场回撤 / %',s.entryDipPct)}${field('tranches','最多买入档数',s.tranches)}${field('spacingPct','每档距首次价 / %',s.spacingPct)}${field('takeProfitPct','成本上止盈幅度 / %',s.takeProfitPct)}${field('budget','本轮计划预算 / $',s.budget)}${field('reserve','计划保留现金 / $',s.reserve)}</div><p class="section-note">间距相对首次实际成交锚点按线性阶梯计算；不是相对上一次成交价。保存不会改写既有成交记录。</p><div class="form-error hidden" id="form-error" role="alert"></div><div class="form-actions">${button('取消','close-modal','secondary')}<button class="button primary" type="submit">保存参数版本</button></div></form>`);
  sheet.querySelector<HTMLFormElement>('#strategy-form')!.addEventListener('submit',e=>{e.preventDefault();try{
    const f=new FormData(e.target as HTMLFormElement);const updated:Strategy={version:state.strategy.version+1,lookbackDays:numberInput(f,'lookbackDays')??0,entryDipPct:numberInput(f,'entryDipPct')??0,tranches:numberInput(f,'tranches')??0,spacingPct:numberInput(f,'spacingPct')??0,takeProfitPct:numberInput(f,'takeProfitPct')??0,budget:numberInput(f,'budget')??0,reserve:numberInput(f,'reserve')??0};
    const err=validateStrategy(updated);if(err)throw new Error(err);
    if((state.account?.filledTranches??0)>updated.tranches)throw new Error('新档数小于已记录的执行档数，请先核对账户。');
    const next=clone();next.strategy=updated;next.mode='manual';addEvent(next,'策略参数更新',`研究参数 v${updated.version}：L=${updated.lookbackDays}，D=${updated.entryDipPct}%，N=${updated.tranches}，Y=${updated.spacingPct}%，Z=${updated.takeProfitPct}%，预算 $${updated.budget}。不代表已验证的交易建议。`);
    if(persist(next)){closeModal();render();toast('参数已保存；未生成任何交易指令。');}
  }catch(error){showFormError(error);}});
}
function openAnalysis(){openModal('决策卡应该回答什么','这是内容结构说明，不是当前 AI 分析。',`
  ${notice('AI 服务、真实行情与新闻证据尚未接入。当前不会输出真实买卖判断、胜率或精确建议数量。')}
  ${[['01 · 先看行动方案','按计划行动，还是暂缓？说明适用的交易周期与档位，而不是笼统地说“可以买”。'],['02 · 支持证据与反证','显示本次使用的数据来源和时间，同时呈现可能推翻判断的信息。'],['03 · 账户影响','程序计算资金、成本、仓位和下一档预算；账户未知时不猜测可买股数。'],['04 · 有效期与失效条件','账户改变、价格离开适用区间或证据过期后，建议立即需要复核。'],['05 · 持续评价','保存当时判断，与机械策略和真实手动成交比较；也记录亏损和错过的机会。']].map(([h,p])=>`<div class="note-box"><h3>${h}</h3><p>${p}</p></div>`).join('')}
  ${button('我明白了','close-modal','primary full')}`);}
function openPrivacy(){openModal('隐私与当前边界','本版本是可操作界面原型，不是完整投资服务。',`
  <div class="note-box"><h3>账户记录只在本机</h3><p>本应用代码不上传账户、成交或备份；没有第三方统计、远程字体和行情请求。托管平台仍可能记录普通网页访问日志。</p></div>
  <div class="note-box"><h3>本机存储不等于加密保险箱</h3><p>本版没有登录、应用锁和加密。能使用你这台设备和浏览器的人可能看到记录。“隐藏金额”只是显示遮罩。优先用示例测试。</p></div>
  <div class="note-box"><h3>需要自己备份</h3><p>清理网站数据、使用隐私浏览、更换设备或域名，都可能让记录不可用。浏览器与主屏幕应用也可能使用不同存储空间；请先测试导出与恢复。</p></div>
  <div class="note-box"><h3>没有后台分析和提醒</h3><p>离线可以看已缓存界面及本机记录。关闭页面后本版不会执行 AI 分析、监控价格或推送止盈提醒。不会控制 Schwab 的任何操作。</p></div>
  <div class="note-box"><h3>后续接入前需要升级安全</h3><p>AI 密钥只应放在受保护服务端。接云端账户、AI 和推送前需加入认证、权限、加密与明确的数据上传提示。</p></div>
  ${button('知道了','close-modal','primary full')}`);}
function openNotifications(){openModal('通知尚未启用','不会假装已经为你监控市场。',`<div class="empty"><div class="empty-icon">${icon('bell',26)}</div><h3>先把建议做可靠，再推送</h3><p>这一版没有后台任务、推送订阅或行情监控，不会请求一个目前无法使用的通知权限。</p></div><div class="note-box"><h3>后续会增加</h3><p>有效信号通知、账户过期提醒、重复信号去重与北京时间静音设置。通知送达不等于完成交易。</p></div>${button('返回工作台','close-modal','primary full')}`);}
async function install(){
  if(deferredInstall){await deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;return;}
  const installed=window.matchMedia('(display-mode: standalone)').matches;
  openModal(installed?'已在独立窗口运行':'添加到手机主屏幕','需要通过部署后的 HTTPS 网址打开。',`${installed?notice('当前已经是独立应用显示模式。',true):''}<div class="note-box"><h3>iPhone / iPad</h3><p>用 Safari 打开已发布网址，点“分享”，选择“添加到主屏幕”。如果系统提供“作为网页 App 打开”选项，请启用。</p></div><div class="note-box"><h3>Android</h3><p>用 Chrome 打开网址，在菜单中选择“安装应用”或“添加到主屏幕”；不同设备的名称可能不同。</p></div><div class="note-box"><h3>安装后没有自动增加能力</h3><p>PWA 安装只改变打开方式。AI、行情和后台推送在此版本仍未接入。通过文件预览或本地文件打开不能代替正式 HTTPS 部署。</p></div>${button('知道了','close-modal','primary full')}`);
}
function downloadBackup(){const raw=storageError&&rawCache?rawCache:JSON.stringify(state,null,2);const blob=new Blob([raw],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ETHAN_TRADER_${new Date().toISOString().slice(0,10)}.backup.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('已生成本机备份；文件包含你填写的数据，请妥善保存。');}
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
window.addEventListener('appinstalled',()=>toast('已添加到设备；AI 与行情仍未接入。'));
render();
if('serviceWorker' in navigator && window.isSecureContext){
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;window.location.reload();}});
  void navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
    if(reg.waiting){waitingWorker=reg.waiting;render();}
    reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){waitingWorker=reg.waiting;render();}});});
  }).catch(()=>{toast('离线缓存未启用；在线界面仍可使用。');});
}
