# ETHAN INVEST TRADER — 移动 PWA 界面体验版 v0.1.0

这是已编写、可交互、可发布的前端代码，不是设计图片。它是产品规划 v0.4 的**第一步界面交付**，不是完整的 AI 服务上线。

## 现在能做什么

- 四个页面：决策、持仓、复盘、设置。
- 明确隔离「演示体验」与「我的记录」。示例金额、行情曲线不是真实数据。
- 手动填写 TQQQ 股数、成本、现金、已结算且未占用现金、挂单备注、核实时间和本轮锚点。
- 记录实际成交，确定性计算持仓、成本、现金；卖出款不会自动成为已结算资金。
- 展示分批阶梯与成本止盈数学参考；参数可以修改并留存版本事件。
- 本机持久存储、金额遮罩、事件时间线、JSON 导出与恢复。
- PWA manifest、192/512 像素图标、Apple 图标、离线应用外壳、更新确认。
- 用户输入转义、备份校验、重复成交 ID 检查、跨标签页变更提醒。

## 尚未完成的功能

**没有 AI 调用、实时行情、新闻、云数据库、登录、应用锁、后台定时任务、Web Push、投资收益验证或 Schwab 接口。**

- 不会自动交易；不生成当前买卖建议。
- 不自动判断 T+1 已结算、不核实实际账户余额。
- 不计算未经验证的胜率、年化或 AI 额外收益。
- 本机 localStorage 是明文，不是安全保险箱；显示遮罩不是加密。
- 没有任何 AI Key 输入框。不要把密钥塞入前端。
- 本应用代码不发送账户数据，不加载第三方字体、统计或行情；托管商可有普通访问日志。
- 建议先使用测试金额。清除网站数据、换域名/浏览器/设备会影响记录。不要当作唯一账本。

## 给非开发者：发布到手机

### 最直接的方法：部署发布包

1. 使用随交付提供的 `ETHAN_INVEST_TRADER_v0.1_Deploy.zip`。它的顶层直接包含 `index.html`，没有构建步骤。
2. 登录你自己的 Vercel 账户，在 `https://vercel.com/drop` 上传该 ZIP；也可解压后拖入文件夹。
3. 选择账户/团队，项目名使用 `ethan-invest-trader`，执行 Deploy。静态文件不需要 AI Key、券商凭据或额外环境变量。
4. 获得真实 HTTPS 网址后，用手机浏览器打开。iPhone：Safari → 分享 → 添加到主屏幕（如有“作为网页 App 打开”则启用）。Android：Chrome 菜单 → 安装应用/添加到主屏幕。
5. 先体验演示模式，再测试「我的记录」、刷新、导出与恢复。

截至本次交付，**没有替你部署到外部服务，没有可分享的已上线网址**。需要你自己的托管账户授权；不要把聊天附件地址当作安装地址。

Vercel Drop 每次上传会建立新项目；以后请使用同一项目的 Git/CLI 更新，避免不断更换域名。更换域名前先导出数据。

官方依据：
- Vercel Drop: https://vercel.com/changelog/vercel-drop
- Drop 接受 ZIP、文件夹与静态内容: https://vercel.com/i/vercel-drop-or-netlify-drop
- PWA 安装条件: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Apple 主屏幕安装: https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios

### Git / Codex 方式

把完整源码放进自己的仓库，再在 Vercel 导入。

仓库根目录的 `vercel.json` 已指定 `site` 为发布目录；本轮 JS 已编译，可以不安装依赖直接发布。后续修改 `src` 后必须先运行构建并更新 `site/assets`，或把 Vercel 构建配置改为正常安装依赖并执行 `npm run build`。

**不要把个人 `.backup.json` 上传仓库。**仓库提供的示例和测试数据全部是人为构造。

## 开发与测试

此阶段采用无运行时依赖的 HTML/CSS/TypeScript 模块，编译后是静态 PWA。选择它是为了先提供可以直接发布的界面包；不是声称已经实现了 Next.js 或后端。

```sh
# Node.js 20+；启动已编译版本，无需 npm install
npm run dev
# 打开 http://localhost:4173

# 运行确定性计算和 service worker 逻辑测试（不依赖第三方库）
npm test

# 修改 TypeScript 后，在正常网络环境安装编译器并构建
npm install
npm run build
npm run check
```

在电脑 localhost 可进行开发；手机访问局域网的普通 HTTP 地址不等于可安装 PWA。实际手机使用建议部署到 HTTPS。

目录：

```text
site/                    已编译、可直接发布的静态内容
  index.html
  manifest.webmanifest
  sw.js                  只缓存应用外壳，不缓存私人 API，不重放写请求
  assets/app.js
  assets/core.js
  assets/style.css
  icons/
src/core.ts              可单独测试、未来可复用的账本与规则计算
src/app.ts               视图、表单、本机存储与 PWA 安装引导
scripts/serve.mjs         本地静态开发服务器
tests/core.test.mjs
tests/service-worker.test.mjs
tests/browser_fixture.py 离线 DOM 测试，存储为测试替身
tests/browser_smoke.py   正常浏览器环境的端到端测试脚本，待部署环境运行
docs/                    原始规格、测试证据与验收说明
CODEX_HANDOFF.md          后续任务、边界与迁移说明
```

## 资金与记录口径

- 现金总额包含已结算与未结算；已结算金额是其子集，不相加。
- 未填金额代表未知，不默认为零；股数必须显式填写，允许 0。
- 买入已结算来源不明时可记录实际成交，但将可用资金设为未知并要求核对。
- 卖出只增加现金总额，已结算余额不自动增加。
- 手动成本包括用户选择的成本来源，不声称是券商或税务确认结果。
- 快照覆盖不与旧成交重复累加；变化不是投资盈利。
- 成交必须在当前快照之后；已经包含在快照里的历史成交不可再次入账。
- 保留现金/预算只是研究参数，本版不阻止用户在券商真实操作。
- 当前实现用限定精度与每笔分位舍入，是原型计算，不是机构资金账本；升级云账本时迁移到明确 decimal/整型分单位并做迁移测试。

## 验证结果与限制

见 `docs/VALIDATION.md`。

已运行：TypeScript 检查、29 项 Node 测试、11 项 Chromium DOM 界面仿真检查、6 个视口宽度、静态文件 HTTP 与图标检查。

**未在真实手机验证安装、Safari 行为、后台离线恢复或 Vercel 上线。**当前执行环境的浏览器管理策略阻止网址导航，未修改该策略；界面检查使用本地代码的 DOM 仿真和内存存储替身。Service worker 通过逻辑仿真，不代表已经真实安装。
