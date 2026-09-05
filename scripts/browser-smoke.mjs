import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

const baseURL = process.env.AETHER_TEST_URL || 'http://localhost:5173'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
})
await fs.mkdir('test-results', { recursive: true })
const errors = []
const observe = page => {
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  observe(page)
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '进入空域ENGAGE' }).waitFor()
  assert.equal(await page.locator('canvas').count(), 1)
  await page.screenshot({ path: 'test-results/desktop-ready.png', fullPage: true })
  await page.getByRole('button', { name: '切换全屏' }).click()
  await page.getByRole('button', { name: '退出全屏' }).waitFor()
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true)
  await page.getByRole('button', { name: '退出全屏' }).click()
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false)

  await page.getByRole('button', { name: '机体档案' }).click()
  assert.equal(await page.getByRole('dialog').count(), 1)
  assert.match(await page.getByRole('dialog').innerText(), /FLANKER-E/)
  await page.screenshot({ path: 'test-results/aircraft-files.png', fullPage: true })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '飞行指南', exact: true }).click()
  assert.match(await page.getByRole('dialog').innerText(), /释放热焰干扰/)
  await page.getByRole('button', { name: '准备就绪' }).click()
  await page.getByRole('button', { name: '关闭声音' }).click()
  await page.getByRole('button', { name: '进入空域ENGAGE' }).click()
  await page.waitForTimeout(1400)
  await page.locator('.target-marker.locked').waitFor()
  await page.screenshot({ path: 'test-results/desktop-engaged.png', fullPage: true })

  await page.keyboard.down('Shift')
  await page.waitForTimeout(600)
  await page.keyboard.up('Shift')
  assert.ok(Number((await page.locator('.speed-gauge .gauge-reading').innerText()).replaceAll(',', '')) > 1000)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '继续作战' }).waitFor()
  const pausedTime = await page.locator('.mission-clock b').innerText()
  await page.waitForTimeout(1200)
  assert.equal(await page.locator('.mission-clock b').innerText(), pausedTime)
  await page.screenshot({ path: 'test-results/paused.png', fullPage: true })
  await page.getByRole('button', { name: '继续作战' }).click()

  await page.getByRole('button', { name: '游戏设置', exact: true }).click()
  await page.getByRole('button', { name: '流畅', exact: true }).click()
  await page.getByRole('button', { name: '鼠标', exact: true }).click()
  await page.getByRole('switch', { name: '反转俯仰' }).click()
  assert.equal(await page.getByRole('switch', { name: '反转俯仰' }).getAttribute('aria-checked'), 'true')
  await page.getByRole('switch', { name: '反转俯仰' }).click()
  await page.getByRole('button', { name: '键盘', exact: true }).click()
  await page.getByRole('button', { name: '精致', exact: true }).click()
  await page.getByRole('button', { name: '保存并返回' }).click()
  assert.match(await page.locator('.mission-live').innerText(), /任务进行中/)

  // Pilot with the same HUD and keyboard available to a human player.
  const pressed = new Set()
  const shots = new Map()
  const start = Date.now()
  while (Date.now() - start < 85000) {
    if (await page.locator('.result-card').count()) break
    const hud = await page.evaluate(() => {
      const marker = document.querySelector('.target-marker.selected')
      const aim = document.querySelector('.aim-reticle')
      const arrow = document.querySelector('.offscreen-target')
      return {
        name: marker?.getAttribute('aria-label'),
        dx: marker ? parseFloat(marker.style.left) - parseFloat(aim.style.left) : 0,
        dy: marker ? parseFloat(marker.style.top) - parseFloat(aim.style.top) : 0,
        bearing: arrow ? parseFloat(arrow.style.getPropertyValue('--bearing')) : 0,
        locked: !!marker?.classList.contains('locked'),
        incoming: !!document.querySelector('.missile-alert'),
        canFire: !document.querySelector('.missile-slot').disabled,
        canFlare: !document.querySelector('.flare-button').disabled,
        distance: Number((marker || arrow)?.dataset.distance || 3000),
      }
    })
    const wanted = new Set()
    const turn = hud.name ? hud.dx : hud.bearing
    if (turn < -1.6) wanted.add('KeyA')
    if (turn > 1.6) wanted.add('KeyD')
    if (hud.name && hud.dy < -1) wanted.add('KeyW')
    if (hud.name && hud.dy > 1) wanted.add('KeyS')
    if (hud.distance < 1300) wanted.add('KeyC')
    for (const key of pressed) if (!wanted.has(key)) { await page.keyboard.up(key); pressed.delete(key) }
    for (const key of wanted) if (!pressed.has(key)) { await page.keyboard.down(key); pressed.add(key) }
    if (hud.incoming && hud.canFlare) await page.keyboard.press('KeyF')
    if (hud.locked && hud.canFire) {
      const record = shots.get(hud.name) || { count: 0, last: 0 }
      if (record.count < 2 || Date.now() - record.last > 7500) {
        await page.keyboard.press('Enter')
        shots.set(hud.name, { count: record.count + 1, last: Date.now() })
      }
    }
    await page.waitForTimeout(140)
  }
  for (const key of pressed) await page.keyboard.up(key)
  await page.screenshot({ path: 'test-results/mission-result.png', fullPage: true })
  const result = await page.locator('.result-card').innerText({ timeout: 3000 })
  assert.match(result, /AIR SUPERIORITY ACHIEVED/, `Combat did not end in victory: ${result}`)
  console.log('Desktop flight, boost, pause, settings, locks, guided missiles, flares and 3/3 victory passed.')
  console.log(result.replaceAll('\n', ' | '))
  await page.getByRole('button', { name: '再次出击' }).click()
  assert.match(await page.locator('.missile-slot .ammo-count').innerText(), /12/)
  assert.match(await page.locator('.objective-count').innerText(), /00/)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '返回任务简报' }).click()
  assert.equal(await page.getByRole('button', { name: '进入空域ENGAGE' }).count(), 1)
  await page.close()

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  observe(mobile)
  await mobile.goto(baseURL, { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: 'test-results/mobile-ready.png', fullPage: true })
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page overflows horizontally')
  await mobile.getByRole('button', { name: '进入空域ENGAGE' }).tap()
  await mobile.waitForTimeout(1400)
  assert.equal(await mobile.getByRole('button', { name: '拉升', exact: true }).isVisible(), true)
  await mobile.getByRole('button', { name: '发射 AIM-120C 导弹' }).tap()
  await mobile.waitForTimeout(300)
  assert.match(await mobile.locator('.missile-slot .ammo-count').innerText(), /11/)
  const touchSession = await mobile.context().newCDPSession(mobile)
  const up = await mobile.getByRole('button', { name: '拉升', exact: true }).boundingBox()
  const boost = await mobile.getByRole('button', { name: '加力推进', exact: true }).boundingBox()
  const upPoint = { x: up.x + up.width / 2, y: up.y + up.height / 2, id: 1 }
  const boostPoint = { x: boost.x + boost.width / 2, y: boost.y + boost.height / 2, id: 2 }
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [upPoint, boostPoint] })
  await mobile.waitForTimeout(650)
  assert.ok(Number((await mobile.locator('.speed-gauge .gauge-reading').innerText()).replaceAll(',', '')) > 1000)
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [upPoint] })
  await mobile.waitForTimeout(350)
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.ok(Number((await mobile.locator('.altitude-gauge .gauge-reading').innerText()).replaceAll(',', '')) > 2400)
  await touchSession.detach()
  await mobile.screenshot({ path: 'test-results/mobile-engaged.png', fullPage: true })
  await mobile.setViewportSize({ width: 844, height: 390 })
  await mobile.waitForTimeout(500)
  await mobile.screenshot({ path: 'test-results/mobile-landscape.png', fullPage: true })
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  const missileBox = await mobile.locator('.missile-slot').boundingBox()
  assert.equal(await mobile.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.missile-slot'), {
    x: missileBox.x + missileBox.width / 2,
    y: missileBox.y + missileBox.height / 2,
  }), true, 'Landscape missile button is obscured')
  console.log('Mobile portrait, touch launch, weapon tap and landscape layout passed.')
  await mobile.close()
  assert.deepEqual(errors, [], 'Browser produced errors')
  console.log('No browser runtime or console errors.')
} finally {
  await browser.close()
}
