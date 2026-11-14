/** Pure ledger helpers. No brokerage, market-data, AI or network calls. */
export type Mode = 'demo' | 'manual';
export type OrderStatus = 'none' | 'yes' | 'unknown';
export interface Account {
  shares: number;
  avgCost: number | null;
  cashTotal: number | null;
  settledCash: number | null;
  costSource: 'fills' | 'broker' | 'unknown';
  orders: OrderStatus;
  orderNote: string;
  anchorPrice: number | null;
  filledTranches: number | null;
  firstBuyDate: string;
  verifiedAt: string | null;
  updatedAt: string;
  source: 'confirmed' | 'calculated';
}
export interface Strategy {
  version: number; lookbackDays: number; entryDipPct: number;
  tranches: number; spacingPct: number; takeProfitPct: number;
  budget: number; reserve: number;
}
export interface TradeInput {
  id: string; side: 'buy' | 'sell'; shares: number; price: number;
  fee: number | null; at: string; tranche: number | null; note: string;
}
export interface TradeRecord extends TradeInput {
  recordedAt: string; realized: number | null; feeUnknown: boolean;
  warning: string; before: Account; after: Account;
}
export interface AuditEvent { id: string; type: string; at: string; description: string }
export interface AppState {
  schema: 1; mode: Mode; account: Account | null;
  strategy: Strategy; trades: TradeRecord[]; events: AuditEvent[];
  preferences: { mask: boolean; quiet: boolean };
}
export const DEFAULT_STRATEGY: Strategy = {
  version: 1, lookbackDays: 20, entryDipPct: 5, tranches: 5,
  spacingPct: 5, takeProfitPct: 4, budget: 5000, reserve: 2000,
};
export function freshState(): AppState {
  return { schema: 1, mode: 'demo', account: null,
    strategy: {...DEFAULT_STRATEGY}, trades: [], events: [],
    preferences: {mask: false, quiet: false} };
}
export function demoAccount(): Account {
  return {shares: 60, avgCost: 55.6, cashTotal: 8000, settledCash: 6000,
    costSource: 'fills', orders: 'none', orderNote: '', anchorPrice: 59,
    filledTranches: 2, firstBuyDate: '2026-01-05',
    verifiedAt: '2026-01-06T12:00:00.000Z', updatedAt: '2026-01-06T12:00:00.000Z', source: 'confirmed'};
}
export const cents = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
export const precision = (x: number): number => Math.round(x * 1e6) / 1e6;
export function finiteNumber(x: unknown, min=0, max=1e9): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
}
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}
export function validateAccount(a: Account): string | null {
  if (!a || typeof a !== 'object') return '账户记录格式不正确。';
  if (!finiteNumber(a.shares,0,1e7)) return '持仓股数必须是非负有效数字。';
  for (const key of ['avgCost','cashTotal','settledCash','anchorPrice'] as const) {
    if (a[key] !== null && !finiteNumber(a[key])) return '价格与现金必须是非负有效数字，未知请留空。';
  }
  if (a.shares > 0 && a.avgCost !== null && a.avgCost <= 0) return '持仓大于零时，平均成本需要大于零，或留空表示未知。';
  if (a.anchorPrice !== null && a.anchorPrice <= 0) return '首次买入锚点需要大于零，未知请留空。';
  if (a.cashTotal === null && a.settledCash !== null) return '请先填写现金总额，或把已结算金额也留空。';
  if (a.cashTotal !== null && a.settledCash !== null && a.settledCash > a.cashTotal + 0.001) return '已结算可用现金不能大于现金总额，两者不相加。';
  if (!['none','yes','unknown'].includes(a.orders)) return '请确认挂单状态。';
  if (!['fills','broker','unknown'].includes(a.costSource)) return '成本来源无效。';
  if (typeof a.orderNote !== 'string' || a.orderNote.length > 1000) return '挂单备注最多 1,000 字。';
  if (a.filledTranches !== null && (!Number.isInteger(a.filledTranches) || !finiteNumber(a.filledTranches,0,20))) return '已执行档位应为 0 至 20 的整数，未知请留空。';
  if (!['confirmed','calculated'].includes(a.source) || !validDate(a.updatedAt)) return '账户状态时间无效。';
  if (a.verifiedAt !== null && !validDate(a.verifiedAt)) return '账户核实时间无效。';
  if (typeof a.firstBuyDate !== 'string' || (a.firstBuyDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(a.firstBuyDate))) return '首次买入日期格式不正确。';
  return null;
}
export function validateStrategy(s: Strategy): string | null {
  if (!s || typeof s !== 'object') return '策略格式不正确。';
  if (!Number.isInteger(s.version) || s.version < 1) return '策略版本无效。';
  if (!Number.isInteger(s.lookbackDays) || !finiteNumber(s.lookbackDays,2,252)) return '观察窗口应为 2 至 252 个交易日。';
  if (!Number.isInteger(s.tranches) || !finiteNumber(s.tranches,1,20)) return '买入档数应为 1 至 20。';
  if (!finiteNumber(s.entryDipPct,0.1,90) || !finiteNumber(s.spacingPct,0.1,50) || !finiteNumber(s.takeProfitPct,0.1,100)) return '请输入有效的回撤、补仓间距和止盈比例。';
  if ((s.tranches - 1) * s.spacingPct >= 100) return '最后一档价格必须大于零，请减少档数或间距。';
  if (!finiteNumber(s.budget,1,1e9) || !finiteNumber(s.reserve,0,1e9)) return '请输入有效的本轮预算和保留现金。';
  return null;
}
export function ladder(s: Strategy, anchor: number | null): {index:number; price:number|null; budget:number}[] {
  return Array.from({length:s.tranches}, (_, i) => ({index:i+1,
    price:anchor === null ? null : cents(anchor * (1-i*s.spacingPct/100)),
    budget:cents(s.budget/s.tranches)}));
}
export function takeProfit(a: Account | null, s: Strategy): number | null {
  return a && a.shares > 0 && a.avgCost !== null ? cents(a.avgCost*(1+s.takeProfitPct/100)) : null;
}
export function applyTrade(a: Account, t: TradeInput, existing: TradeRecord[] = [], now = new Date().toISOString()): TradeRecord {
  const err = validateAccount(a); if (err) throw new Error(err);
  if (!t.id || existing.some(r => r.id === t.id)) throw new Error('这条成交已记录，未重复计账。');
  if (!['buy','sell'].includes(t.side)) throw new Error('成交方向无效。');
  if (!finiteNumber(t.shares,0.000001,1e7) || !finiteNumber(t.price,0.000001,1e7)) throw new Error('成交股数与均价必须大于零。');
  if (t.fee !== null && !finiteNumber(t.fee,0,1e7)) throw new Error('费用必须为非负数字或留空。');
  if (!validDate(t.at) || Date.parse(t.at)>Date.parse(now)+60_000) throw new Error('实际成交时间无效，不能记录未来成交。');
  if (Date.parse(t.at) < Date.parse(a.updatedAt)) throw new Error('这笔成交早于当前快照，可能已包含在持仓中。请用账户核对纠错，不要重复加入历史成交。');
  if (typeof t.note !== 'string' || t.note.length > 1000) throw new Error('成交备注最多 1,000 字。');
  if (t.tranche !== null && (!Number.isInteger(t.tranche) || !finiteNumber(t.tranche,1,20))) throw new Error('档位无效。');
  const after: Account = {...a, source:'calculated', updatedAt:t.at};
  const fee = t.fee ?? 0; const gross = cents(t.shares*t.price);
  const warnings: string[] = []; let realized: number | null = null;
  if (t.fee===null) warnings.push('费用未知，结果暂未计完整费用');
  if (a.orders !== 'none') warnings.push('挂单信息需要重新核对');
  if (t.side==='buy') {
    const payment = cents(gross+fee);
    if (a.cashTotal!==null && payment > a.cashTotal+0.001) throw new Error('成交金额超过记录的现金总额。请先核实是否有资金转入或账户漏记，再记录成交。');
    after.shares=precision(a.shares+t.shares);
    after.avgCost=a.shares===0 ? precision(payment/t.shares) : a.avgCost===null ? null : precision((a.shares*a.avgCost+payment)/after.shares);
    after.cashTotal=a.cashTotal===null ? null : cents(a.cashTotal-payment);
    if (a.settledCash!==null && a.settledCash>=payment) after.settledCash=cents(a.settledCash-payment);
    else { after.settledCash=null; warnings.push('已结算资金来源不足或未知，需要到 Schwab 核对'); }
    if (a.shares===0) {after.anchorPrice=t.price; after.firstBuyDate=new Date(Date.parse(t.at)+8*3600_000).toISOString().slice(0,10);}
    after.filledTranches=t.tranche ?? (a.shares===0 ? 1 : null);
  } else {
    if (t.shares > a.shares+0.0000001) throw new Error('卖出股数超过本策略持仓。请先核实长期仓位归属或遗漏记录。');
    if (fee>gross) throw new Error('费用超过成交金额，请核对输入。');
    after.shares=precision(a.shares-t.shares);
    after.cashTotal=a.cashTotal===null ? null : cents(a.cashTotal+gross-fee);
    // Do not automatically add sale proceeds to settled cash (no settlement calendar integration).
    if (a.avgCost!==null) realized=cents(gross-fee-t.shares*a.avgCost);
    warnings.push('卖出款未自动计入已结算金额，请结算后核对');
    if (after.shares===0) {after.avgCost=null; after.anchorPrice=null; after.filledTranches=0; after.firstBuyDate='';}
  }
  return {...t,recordedAt:now, realized, feeUnknown:t.fee===null,
    warning:warnings.join('；'), before:{...a}, after};
}
export function decodeState(text: string): AppState {
  if (text.length>5_000_000) throw new Error('文件过大，最多支持 5 MB 的本机备份。');
  const x = JSON.parse(text) as AppState;
  if (!x || x.schema!==1 || !['demo','manual'].includes(x.mode)) throw new Error('不是兼容的 ETHAN INVEST TRADER 备份。');
  if (x.account!==null) { const err=validateAccount(x.account); if(err) throw new Error(err); }
  const err=validateStrategy(x.strategy); if(err) throw new Error(err);
  if (!Array.isArray(x.trades) || x.trades.length>10000 || !Array.isArray(x.events) || x.events.length>20000) throw new Error('备份记录格式或数量异常。');
  const ids=new Set<string>();
  for (const t of x.trades) {
    if (!t || typeof t.id!=='string' || ids.has(t.id) || !['buy','sell'].includes(t.side) || !finiteNumber(t.shares,0.000001,1e7) || !finiteNumber(t.price,0.000001,1e7) || (t.fee!==null&&!finiteNumber(t.fee)) || (t.realized!==null&&!finiteNumber(t.realized,-1e12,1e12)) || !validDate(t.at) || !validDate(t.recordedAt) || typeof t.note!=='string' || t.note.length>1000 || typeof t.warning!=='string' || t.warning.length>3000 || typeof t.feeUnknown!=='boolean' || validateAccount(t.before) || validateAccount(t.after)) throw new Error('备份中的成交记录不完整或重复。');
    ids.add(t.id);
  }
  for (const e of x.events) {
    if(!e || typeof e.id!=='string' || typeof e.type!=='string' || !validDate(e.at) || typeof e.description!=='string' || e.description.length>4000) throw new Error('备份中的事件记录无效。');
  }
  if(!x.preferences || typeof x.preferences.mask!=='boolean' || typeof x.preferences.quiet!=='boolean') throw new Error('备份偏好设置无效。');
  // Whitelist top-level fields, discard unrelated imported fields.
  return {schema:1,mode:x.mode,account:x.account,strategy:x.strategy,trades:x.trades,events:x.events,preferences:x.preferences};
}
