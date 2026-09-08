<p align="center">
  <img src="assets/brand/icon-rounded.png" alt="Dogfight logo" width="180" height="180" />
</p>

<h1 align="center">Dogfight</h1>

<p align="center">驾驶 F-22 对抗 Su-35，在浏览器中完成一场街机空战。</p>

<p align="center">
  <a href="https://dogfight.hexly.ai">站点</a> ·
  <a href="docs/README.en.md">English</a>
</p>

<p align="center">
  <img src="preview.jpg" width="720" alt="Dogfight — AETHER 空战界面" />
</p>

## 这是什么

Dogfight 是一款浏览器 3D 空战游戏，界面使用 AETHER 名称。玩家固定驾驶 F-22，从空中交战开始，对抗三架 Su-35；全部击落即获胜，机体损失或撞击地形则任务失败。

飞行、锁定、导弹、机炮与干扰围绕一场街机任务设计，不模拟起降或真实航空系统。游戏在浏览器内运行，当前没有多人联机或账号服务。

## 功能

- 通过俯仰、转向、加力与减速追击敌机，HUD 显示速度、高度、机体状态、目标和来袭导弹。
- 使用 AIM-120C 导弹锁定目标，发射带过热限制的无限机炮，并释放热焰干扰来袭导弹。
- 在程序化生成的 F-22 / Su-35 机体、地形、水面和云层之间交战，配合 Web Audio 合成音效。
- 使用键盘、可选鼠标操纵或触屏方向键，支持横屏、全屏、反转俯仰、鼠标灵敏度与两档画质。
- 切换标签页或打开设置时暂停，任务结束后查看得分并重新出击。

胜利后的最高得分保存在当前浏览器 localStorage。当前任务与操作设置保存在内存，刷新页面不会续接战斗；最高分也不会跨浏览器或设备同步。

## 使用

在支持 WebGL 2 的现代浏览器中打开[游戏](https://dogfight.hexly.ai)，点击「进入空域」。机体、场景与音效不依赖外部 3D 模型服务。

| 操作 | 按键 |
| --- | --- |
| 上仰 / 俯冲 | W / S、↑ / ↓ |
| 左转 / 右转 | A / D、← / → |
| 加力 / 减速 | 按住 Shift / C |
| 发射机炮 | 按住 Space |
| 发射导弹 | Enter |
| 切换目标 | Q |
| 释放热焰干扰 | F |
| 暂停 / 继续 | Esc / P |

目标与机头方向夹角小于 21°、距离小于 3.6 km，持续约 1.1 秒即可锁定。两枚导弹可击落一架满血敌机；1.7 km 内机炮有轻度瞄准辅助。这些是游戏规则，数值定义见[战斗模拟](src/game/simulation.ts)。

也可点击敌机标记或目标列表选择目标，点击武器卡发射导弹。设置中开启鼠标操纵后，键盘仍然可用；性能不足时可选择「流畅」画质。

## 开发

推荐 Node.js 22 与 npm，或使用仓库 CI 的 Bun 1.4.0。以下命令使用已提交的 npm lockfile。

```bash
git clone https://github.com/nocoo/dogfight.git
cd dogfight
npm ci
npm run dev
```

Vite 默认使用 5173；端口占用时访问终端显示的实际地址，也可通过 `npm run dev -- --port 5174` 指定端口。应用运行不需要 API 密钥或数据库。

```bash
npm run typecheck
npm run build
npm run preview
```

构建结果位于 `dist/`，可交给静态站点服务器。当前站点使用 Cloudflare Workers Static Assets，域名与资源目录见 [wrangler.jsonc](wrangler.jsonc)。

| 路径 | 内容 |
| --- | --- |
| `src/App.tsx`、`src/styles.css` | HUD、设置、暂停与任务流程 |
| `src/game/simulation.ts` | 独立飞行、制导、武器与胜负逻辑 |
| `src/game/engine.ts` | 输入与渲染循环 |
| `src/game/aircraft.ts`、`world.ts`、`clouds.ts` | 程序化机体和环境 |
| `src/game/audio.ts` | 合成音效 |
| `scripts/browser-smoke.mjs` | 通过 HUD 与键盘完成战役的浏览器脚本 |

## 测试

```bash
npm test
```

Vitest 验证飞行、锁定、导弹、干扰、机炮过热、胜负与重置，不需要启动开发服务器。

浏览器流程需先在另一个终端运行 `npm run dev`，再执行：

```bash
npx playwright install chromium
AETHER_TEST_URL=http://localhost:5173 npm run test:browser
```

将 `AETHER_TEST_URL` 改为当前本地服务地址。脚本不会启动服务器，在 macOS 优先使用已安装的 Google Chrome，否则使用 Playwright Chromium。它执行桌面完整战役、暂停与设置、手机触控和横屏检查，截图写入 `test-results/`。当前 CI 运行构建与单元测试，浏览器脚本需单独运行；没有服务端 API 测试层。

## 技术栈

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=threedotjs&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)

| 部分 | 实现 |
| --- | --- |
| 游戏与 HUD | TypeScript、React、CSS、Lucide |
| 三维与音频 | Three.js、WebGL 2、Web Audio |
| 本地得分 | localStorage |
| 构建与托管 | Vite、Cloudflare Workers Static Assets |
| 测试 | Vitest、Playwright |

## 文档

- [Logo 使用说明](docs/01-logo-usage.md)
- [标识设计](https://hexly.ai/logos/dogfight)

## 许可证

[MIT](LICENSE) © 2026 Zheng Li
