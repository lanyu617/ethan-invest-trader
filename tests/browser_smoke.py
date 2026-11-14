"""Run against the included static site. Requires Playwright + Chromium locally.
UI-only checks; not an iPhone hardware, investment-quality, or live deployment test.
"""
import asyncio, json, os
from pathlib import Path
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'/'test-evidence'
OUT.mkdir(parents=True,exist_ok=True)
RESULTS=[]
def ok(name):
    RESULTS.append(name)
    print('PASS:',name)

async def run():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        context=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='zh-CN')
        page=await context.new_page()
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        await page.goto('http://localhost:4173',wait_until='networkidle')
        await page.wait_for_function('navigator.serviceWorker.controller !== null')
        await page.wait_for_timeout(400)
        assert await page.title()=='ETHAN INVEST TRADER'
        assert await page.locator('h1').inner_text()=='投资工作台'
        assert await page.get_by_text('行情与 AI 未接入',exact=True).count()>=1
        ok('initial screen uses explicit demo mode; AI is not claimed connected')
        assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        await page.screenshot(path=str(OUT/'01_decision_mobile.png'),full_page=True)
        await page.screenshot(path=str(OUT/'01_decision_viewport.png'))
        for tab in ['holdings','review','settings']:
            await page.locator(f'.bottom-nav [data-action="nav-{tab}"]').click()
            assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            await page.screenshot(path=str(OUT/f'02_{tab}_mobile.png'),full_page=True)
        ok('all four tabs work at 390px without horizontal overflow')
        await page.locator('[data-action="mode-manual"]').click()
        await page.locator('.bottom-nav [data-action="nav-holdings"]').click()
        assert await page.get_by_text('录入账户',exact=True).count()==1
        ok('manual mode starts empty, not with demonstration balances')
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
        await page.locator('details summary').click()
        await page.locator('input[name="anchorPrice"]').fill('59')
        await page.locator('input[name="filledTranches"]').fill('2')
        await page.locator('input[name="ack"]').check()
        await page.get_by_role('button',name='保存账户记录').click()
        assert '不能大于' in await page.locator('#form-error').inner_text()
        ok('account validation rejects settled cash above total cash')
        await page.locator('input[name="settledCash"]').fill('6000')
        await page.screenshot(path=str(OUT/'03_account_form.png'),full_page=False)
        await page.get_by_role('button',name='保存账户记录').click()
        assert not await page.locator('#sheet').is_visible()
        raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
        assert raw['account']['shares']==60 and raw['account']['cashTotal']==8000
        await page.reload(wait_until='networkidle')
        assert await page.locator('[data-action="mode-manual"]').get_attribute('aria-pressed')=='true'
        ok('manual account survives reload with demo data excluded')
        await page.locator('.bottom-nav [data-action="nav-holdings"]').click()
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
        assert len(raw['trades'])==1 and raw['account']['source']=='calculated'
        ok('sale recorded once; proceeds not recycled into settled cash')
        await page.locator('.bottom-nav [data-action="nav-review"]').click()
        assert await page.get_by_text('<img src=x onerror=alert(1)>',exact=False).count()>0
        assert await page.locator('img[src="x"]').count()==0
        ok('user notes are escaped; HTML text cannot inject an image or script')
        await page.locator('[data-action="export"]').click()
        ok('backup export entry works')
        await page.locator('.bottom-nav [data-action="nav-settings"]').click()
        await page.locator('[data-action="strategy"]').click()
        await page.locator('input[name="tranches"]').fill('20')
        await page.locator('input[name="spacingPct"]').fill('10')
        await page.get_by_role('button',name='保存参数版本').click()
        assert '大于零' in await page.locator('#form-error').inner_text()
        await page.locator('[data-action="close-modal"]').first.click()
        ok('invalid ladder configuration is rejected')
        async with page.expect_download() as download_info:
            await page.locator('[data-action="export"]').click()
        download=await download_info.value
        backup_path=OUT/'test-roundtrip.backup.json'
        await download.save_as(str(backup_path))
        await page.locator('[data-action="reset"]').click()
        await page.locator('[data-action="reset-confirm"]').click()
        raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
        assert raw['account'] is None
        await page.locator('#backup-input').set_input_files(str(backup_path))
        await page.locator('#restore-confirm').click()
        raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
        assert raw['account']['shares']==50
        ok('export, clear, and validated import restore the manual record')
        await context.set_offline(True)
        await page.reload(wait_until='domcontentloaded')
        await page.wait_for_timeout(300)
        assert '离线模式' in await page.locator('body').inner_text()
        raw=await page.evaluate("JSON.parse(localStorage.getItem('ethan-invest-trader.local.v1'))")
        assert raw['account']['shares']==50
        ok('offline reload serves shell and retains local data with offline label')
        await context.set_offline(False)
        # Another page in the same origin changes storage; active dialog must not overwrite it.
        tab2=await context.new_page();await tab2.goto('http://localhost:4173',wait_until='networkidle')
        await page.locator('[data-action="edit-account"]').first.click()
        await tab2.evaluate("""() => {const key='ethan-invest-trader.local.v1';const s=JSON.parse(localStorage.getItem(key));s.account.shares=51;localStorage.setItem(key,JSON.stringify(s));}""")
        await page.wait_for_timeout(150)
        assert not await page.locator('#sheet').is_visible()
        ok('cross-tab update closes stale editing form instead of overwriting')
        await tab2.close()
        for width in [320,360,430,768,1440]:
            await page.set_viewport_size({'width':width,'height':900})
            for p in ['decision','holdings','review','settings']:
                await page.locator(f'.bottom-nav [data-action="nav-{p}"]').click()
                assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),(width,p)
        ok('responsive smoke test passes 320, 360, 390, 430, 768, and 1440px')
        assert not errors,errors
        assert all(url.startswith('http://localhost:4173') or url.startswith('blob:') for url in requests),requests
        ok('no JavaScript exceptions; app makes no third-party data requests')
        (OUT/'browser-results.json').write_text(json.dumps({'browser':'Chromium headless, mobile emulation (not hardware)','checks':RESULTS,'page_errors':errors},ensure_ascii=False,indent=2))
        backup_path.unlink(missing_ok=True)
        await browser.close()

asyncio.run(run())
