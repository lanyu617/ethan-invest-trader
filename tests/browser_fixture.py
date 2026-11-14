"""Offline UI fixture only: render authored code in about:blank.
The environment blocks browser URL navigation. We DO NOT change that policy.
Storage is an in-memory test double; no claims about real SW/install/storage are made.
"""
import asyncio, json, re
from pathlib import Path
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'/'test-evidence'; OUT.mkdir(exist_ok=True,parents=True)
CHECKS=[]
def ok(message):CHECKS.append(message);print('PASS:',message)
css=(ROOT/'site/assets/style.css').read_text()
core=(ROOT/'site/assets/core.js').read_text()
core=re.sub(r'\bexport (?=(const|function|class)\b)','',core)
app=(ROOT/'site/assets/app.js').read_text()
app=re.sub(r'^import\s.*?;\n','',app,count=1,flags=re.S)
# Device browser module does not call a remote service. The fixture replaces only origin-dependent platform features.
init="""
window.__fixtureStore=new Map();
Object.defineProperty(window,'localStorage',{value:{
getItem:k=>window.__fixtureStore.has(k)?window.__fixtureStore.get(k):null,
setItem:(k,v)=>window.__fixtureStore.set(k,String(v)),
removeItem:k=>window.__fixtureStore.delete(k),clear:()=>window.__fixtureStore.clear()
}});
if(!crypto.randomUUID){crypto.randomUUID=()=> '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}
"""
html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ETHAN INVEST TRADER</title><style>'+css+'</style></head><body><div id="app"></div><dialog id="sheet" aria-labelledby="sheet-title"></dialog><div id="toast" class="toast" role="status"></div><input type="file" id="backup-input" hidden></body></html>'
async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='zh-CN')
  page=await context.new_page(); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html)
  await page.add_script_tag(content=init)
  await page.add_script_tag(content=core+'\n'+app,type='module')
  await page.wait_for_selector('h1')
  assert await page.locator('h1').inner_text()=='投资工作台'
  ok('demo landing and explicit disconnected AI label rendered')
  for tab in ['decision','holdings','review','settings']:
   await page.locator(f'.bottom-nav [data-action="nav-{tab}"]').click()
   assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
   await page.screenshot(path=str(OUT/f'{tab}_full.png'),full_page=True)
   await page.screenshot(path=str(OUT/f'{tab}_viewport.png'))
  ok('four tabs operate at 390px; no horizontal overflow')
  await page.locator('[data-action="mode-manual"]').click()
  await page.locator('.bottom-nav [data-action="nav-holdings"]').click()
  assert await page.get_by_text('录入账户',exact=True).count()==1
  ok('manual mode starts with no demonstration account')
  await page.locator('[data-action="edit-account"]').first.click()
  assert await page.locator('#sheet').is_visible()
  await page.locator('input[name="shares"]').fill('60')
  await page.locator('input[name="avgCost"]').fill('55.6')
  await page.locator('input[name="cashTotal"]').fill('8000')
  await page.locator('input[name="settledCash"]').fill('9000')
  await page.locator('select[name="orders"]').select_option('none')
  await page.locator('select[name="costSource"]').select_option('fills')
  dt=(datetime.now(timezone.utc)+timedelta(hours=8)-timedelta(minutes=3)).strftime('%Y-%m-%dT%H:%M:%S')
  await page.locator('input[name="verifiedAt"]').fill(dt)
  await page.locator('input[name="ack"]').check()
  await page.get_by_role('button',name='保存账户记录').click()
  assert '不能大于' in await page.locator('#form-error').inner_text()
  ok('UI rejects settled cash greater than total cash')
  await page.locator('input[name="settledCash"]').fill('6000')
  await page.locator('#sheet').evaluate('(el)=>el.scrollTop=0')
  await page.screenshot(path=str(OUT/'account_form.png'))
  await page.get_by_role('button',name='保存账户记录').click()
  assert not await page.locator('#sheet').is_visible()
  raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
  assert raw['account']['shares']==60
  ok('form saves account in test-double storage with manual source')
  await page.locator('[data-action="record-trade"]').click()
  await page.locator('select[name="side"]').select_option('sell')
  await page.locator('input[name="shares"]').fill('10')
  await page.locator('input[name="price"]').fill('60')
  await page.locator('input[name="fee"]').fill('1')
  await page.locator('input[name="note"]').fill('<img src=x onerror=alert(1)>')
  await page.locator('#trade-form input[type="checkbox"]').check()
  await page.get_by_role('button',name='保存成交记录').click()
  assert not await page.locator('#sheet').is_visible()
  raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
  assert raw['account']['shares']==50 and raw['account']['cashTotal']==8599 and raw['account']['settledCash']==6000
  ok('sale form updates position; settled funds remain unchanged')
  await page.locator('.bottom-nav [data-action="nav-review"]').click()
  assert await page.get_by_text('<img src=x onerror=alert(1)>',exact=False).count()>0
  assert await page.locator('img[src="x"]').count()==0
  ok('malicious HTML in a note is displayed as literal text')
  await page.locator('.bottom-nav [data-action="nav-settings"]').click()
  await page.locator('[data-action="strategy"]').click()
  await page.locator('input[name="tranches"]').fill('20')
  await page.locator('input[name="spacingPct"]').fill('10')
  await page.get_by_role('button',name='保存参数版本').click()
  assert '大于零' in await page.locator('#form-error').inner_text()
  await page.locator('input[name="tranches"]').fill('5')
  await page.locator('input[name="spacingPct"]').fill('5')
  await page.get_by_role('button',name='保存参数版本').click()
  assert not await page.locator('#sheet').is_visible()
  raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
  assert raw['strategy']['version']==2
  ok('strategy form validates negative ladder then saves a valid new version')
  await page.locator('[data-action="reset"]').click()
  await page.locator('[data-action="reset-confirm"]').click()
  raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
  assert raw['account'] is None and raw['mode']=='demo'
  ok('reset clears fixture account, trades and preferences')
  for width in [320,360,430,768,1440]:
   await page.set_viewport_size({'width':width,'height':900})
   for tab in ['decision','holdings','review','settings']:
    await page.locator(f'.bottom-nav [data-action="nav-{tab}"]').click()
    assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),(width,tab)
  ok('responsive layout checks pass 320, 360, 390, 430, 768, 1440px')
  assert not errors,errors
  ok('no JavaScript exceptions in fixture test')
  (OUT/'fixture-results.json').write_text(json.dumps({'mode':'authored code rendered in about:blank; mocked localStorage; no service worker or device-install test','checks':CHECKS,'page_errors':errors},ensure_ascii=False,indent=2))
  await browser.close()
asyncio.run(run())
