import { Euler, Quaternion, Vector3, MathUtils } from 'three'
import type { FlightInput, GamePhase } from './types'

export const FORWARD = new Vector3(0, 0, -1)
export const UP = new Vector3(0, 1, 0)
export const LOCK_RANGE = 3600
export const LOCK_ANGLE = Math.cos(MathUtils.degToRad(21))
export const LOCK_TIME = 1.1

export interface Enemy {
  id: number
  name: string
  position: Vector3
  direction: Vector3
  health: number
  fireTimer: number
  roll: number
}

export interface Missile {
  id: number
  position: Vector3
  previous: Vector3
  direction: Vector3
  targetId: number
  friendly: boolean
  life: number
  confused: boolean
}

export interface Bullet {
  id: number
  position: Vector3
  previous: Vector3
  direction: Vector3
  life: number
}

export interface CombatEvent {
  type: 'launch' | 'gun' | 'hit' | 'kill' | 'damage' | 'flare' | 'lock' | 'incoming'
  position: Vector3
}

// Shared by the landscape and collision system, so mountains have real terrain.
export function terrainHeight(x: number, z: number): number {
  const ridge = Math.exp(-(((x + 7200) / 5300) ** 2)) * Math.exp(-(((z + 8000) / 26000) ** 2))
  const island = Math.exp(-(((x - 10500) / 5500) ** 2) - ((z + 17000) / 14000) ** 2)
  const noise = Math.sin(x * 0.0006 + Math.sin(z * 0.00023) * 2.5) * 0.24
    + Math.sin(z * 0.00091 + x * 0.00027) * 0.16
    + Math.sin(x * 0.0023 + z * 0.0016) * 0.065
    + Math.cos(x * 0.0043 - z * 0.0041) * 0.025
  const peaks = Math.pow(Math.abs(Math.sin(x * 0.00055 + Math.sin(z * 0.00038) * 1.3)), 2.5)
  return Math.max(-65, (ridge + island * 0.86) * (1550 + peaks * 1350 + noise * 1100) - 330)
}

function distanceToSegment(point: Vector3, a: Vector3, b: Vector3): number {
  const delta = b.clone().sub(a)
  const t = MathUtils.clamp(point.clone().sub(a).dot(delta) / Math.max(delta.lengthSq(), 0.0001), 0, 1)
  return point.distanceTo(a.clone().addScaledVector(delta, t))
}

export class FlightSimulation {
  phase: GamePhase = 'ready'
  position = new Vector3(0, 2400, 900)
  quaternion = new Quaternion()
  forward = FORWARD.clone()
  heading = 0
  pitch = 0
  roll = 0
  speed = 256
  health = 100
  missilesLeft = 12
  flaresLeft = 6
  flareCooldown = 0
  gunHeat = 0
  overheated = false
  missileCooldown = 0
  lock = 0
  selectedTarget = 0
  elapsed = 0
  kills = 0
  score = 0
  boosting = false
  lowAltitude = false
  enemies: Enemy[] = []
  missiles: Missile[] = []
  bullets: Bullet[] = []
  events: CombatEvent[] = []
  message = ''
  messageType: 'info' | 'danger' | 'success' = 'info'
  private messageTimer = 0
  private gunTimer = 0
  private nextId = 1
  private lockAnnounced = false

  constructor() { this.reset() }

  reset() {
    this.phase = 'ready'
    this.position.set(0, 2400, 900)
    this.quaternion.identity()
    this.forward.copy(FORWARD)
    this.heading = 0
    this.pitch = 0
    this.roll = 0
    this.speed = 256
    this.health = 100
    this.missilesLeft = 12
    this.flaresLeft = 6
    this.flareCooldown = 0
    this.gunHeat = 0
    this.overheated = false
    this.missileCooldown = 0
    this.lock = 0
    this.selectedTarget = 0
    this.elapsed = 0
    this.kills = 0
    this.score = 0
    this.boosting = false
    this.lowAltitude = false
    this.message = ''
    this.messageTimer = 0
    this.messageType = 'info'
    this.gunTimer = 0
    this.lockAnnounced = false
    this.nextId = 1
    this.missiles = []
    this.bullets = []
    this.events = []
    this.enemies = [
      { id: 0, name: 'VIPER 01', position: new Vector3(-100, 2480, -800), direction: FORWARD.clone(), health: 100, fireTimer: 12, roll: 0 },
      { id: 1, name: 'VIPER 02', position: new Vector3(-1350, 2700, -2400), direction: new Vector3(0.2, 0, -1).normalize(), health: 100, fireTimer: 18, roll: 0 },
      { id: 2, name: 'VIPER 03', position: new Vector3(1400, 2660, -1700), direction: new Vector3(-0.2, 0, 1).normalize(), health: 100, fireTimer: 24, roll: 0 },
    ]
  }

  start() {
    this.reset()
    this.phase = 'playing'
    this.notify('AWACS  ·  空域已确认。猛禽，允许自由交战。', 'info', 6)
  }

  notify(message: string, type: 'info' | 'danger' | 'success' = 'info', seconds = 3) {
    this.message = message
    this.messageType = type
    this.messageTimer = seconds
  }

  selectTarget(id?: number) {
    const alive = this.enemies.filter(enemy => enemy.health > 0)
    if (alive.length === 0) return
    const currentIndex = alive.findIndex(enemy => enemy.id === this.selectedTarget)
    const next = id === undefined ? alive[(currentIndex + 1) % alive.length] : alive.find(enemy => enemy.id === id)
    if (next && next.id !== this.selectedTarget) {
      this.selectedTarget = next.id
      this.lock = 0
      this.lockAnnounced = false
    }
  }

  fireMissile(): boolean {
    if (this.phase !== 'playing') return false
    if (this.missilesLeft === 0) { this.notify('导弹已用尽 · 靠近目标，使用机炮', 'danger'); return false }
    if (this.missileCooldown > 0) return false
    if (this.lock < 1) { this.notify('将目标保持在准星附近，等待锁定', 'info'); return false }
    const offset = new Vector3(this.missilesLeft % 2 ? -3.2 : 3.2, -0.8, -2).applyQuaternion(this.quaternion)
    const position = this.position.clone().add(offset)
    this.missiles.push({
      id: this.nextId++, position, previous: position.clone(), direction: this.forward.clone(),
      targetId: this.selectedTarget, friendly: true, life: 13, confused: false,
    })
    this.missilesLeft--
    this.missileCooldown = 1.3
    this.events.push({ type: 'launch', position: position.clone() })
    this.notify('FOX THREE  ·  导弹已发射', 'info', 1.8)
    return true
  }

  deployFlares(): boolean {
    if (this.phase !== 'playing' || this.flareCooldown > 0 || this.flaresLeft <= 0) return false
    this.flaresLeft--
    this.flareCooldown = 4
    for (const missile of this.missiles) {
      if (!missile.friendly && missile.position.distanceTo(this.position) < 5000) {
        missile.confused = true
        missile.life = Math.min(missile.life, 1.5)
        missile.direction.add(new Vector3(0.5, -0.4, 0)).normalize()
      }
    }
    this.events.push({ type: 'flare', position: this.position.clone() })
    this.notify('防御干扰已释放 · 来袭导弹制导中断', 'info', 2.5)
    return true
  }

  get incoming() {
    return this.missiles.some(missile => !missile.friendly && !missile.confused && missile.position.distanceTo(this.position) < 5000)
  }

  step(dt: number, input: FlightInput) {
    if (this.phase !== 'playing') return
    dt = Math.min(dt, 0.05)
    this.elapsed += dt
    this.boosting = input.boost
    this.speed = MathUtils.damp(this.speed, input.boost ? 428 : input.brake ? 160 : 256, 1.3, dt)
    this.heading += input.turn * (input.boost ? 0.44 : 0.63) * dt
    this.pitch = MathUtils.clamp(this.pitch + input.pitch * 0.44 * dt, -0.85, 0.85)
    if (Math.abs(input.pitch) < 0.05) this.pitch = MathUtils.damp(this.pitch, 0, 0.27, dt)
    this.roll = MathUtils.damp(this.roll, input.turn * 0.88, 3, dt)
    this.quaternion.setFromEuler(new Euler(this.pitch, this.heading, this.roll, 'YXZ'))
    this.forward.copy(FORWARD).applyEuler(new Euler(this.pitch, this.heading, 0, 'YXZ'))
    this.position.addScaledVector(this.forward, this.speed * dt)

    const ground = Math.max(0, terrainHeight(this.position.x, this.position.z))
    this.lowAltitude = this.position.y - ground < 220
    if (this.position.y < ground + 18) {
      this.health = 0
      this.events.push({ type: 'damage', position: this.position.clone() })
      this.phase = 'defeat'
      this.notify('机体与地形碰撞', 'danger', 10)
      return
    }
    if (this.position.y > 6800) {
      this.pitch = MathUtils.damp(this.pitch, -0.3, 1.4, dt)
      this.notify('已接近升限 · 请降低高度', 'danger', 1)
    }
    this.missileCooldown = Math.max(0, this.missileCooldown - dt)
    this.flareCooldown = Math.max(0, this.flareCooldown - dt)
    this.messageTimer = Math.max(0, this.messageTimer - dt)
    if (this.messageTimer === 0) this.message = ''
    if (this.lowAltitude) this.notify('PULL UP  ·  地形警告，立即拉升', 'danger', 1)

    this.updateEnemies(dt)
    this.updateLock(dt)
    this.updateGun(dt, input.gun)
    this.updateMissiles(dt)
    this.updateBullets(dt)
    if (this.health <= 0) {
      this.health = 0
      this.phase = 'defeat'
      this.notify('机体损伤超限', 'danger', 10)
    } else if (this.kills === this.enemies.length) {
      this.phase = 'victory'
      this.score += Math.max(0, Math.round(3000 - this.elapsed * 10)) + Math.round(this.health * 10)
      this.notify('AWACS  ·  敌机全部清除。空域属于你。', 'success', 10)
    }
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue
      const delta = this.position.clone().sub(enemy.position)
      const distance = delta.length()
      let desired: Vector3
      if (distance > 3300) {
        desired = delta.normalize()
      } else if (distance < 700) {
        // A close pass becomes a defensive break, giving the pilot a dogfight.
        const side = new Vector3(Math.cos(this.elapsed * 0.18 + enemy.id * 2), 0.12 * Math.sin(this.elapsed * 0.3), Math.sin(this.elapsed * 0.18 + enemy.id * 2))
        desired = delta.normalize().multiplyScalar(-0.6).add(side).normalize()
      } else {
        const orbit = new Vector3(
          Math.sin(this.elapsed * 0.095 + enemy.id * 2.1) * (enemy.id === 0 ? 370 : 1500),
          Math.sin(this.elapsed * 0.15 + enemy.id) * 170 + 60,
          -1300 - Math.cos(this.elapsed * 0.07 + enemy.id) * 250,
        ).applyAxisAngle(UP, this.heading)
        const waypoint = this.position.clone().add(orbit)
        desired = waypoint.sub(enemy.position).normalize()
      }
      const cross = enemy.direction.clone().cross(desired).y
      enemy.roll = MathUtils.damp(enemy.roll, MathUtils.clamp(-cross * 2.5, -1, 1), 2, dt)
      enemy.direction.lerp(desired, 1 - Math.exp(-dt * (distance < 700 ? 0.85 : 0.3))).normalize()
      enemy.position.addScaledVector(enemy.direction, (enemy.id === 0 ? 198 : 222) * dt)
      enemy.position.y = Math.max(Math.max(0, terrainHeight(enemy.position.x, enemy.position.z)) + 320, enemy.position.y)
      enemy.fireTimer -= dt
      if (enemy.fireTimer <= 0 && distance < 4000) {
        enemy.fireTimer = 14 + enemy.id * 2
        const direction = this.position.clone().sub(enemy.position).normalize()
        const pos = enemy.position.clone().addScaledVector(direction, 12)
        this.missiles.push({ id: this.nextId++, position: pos, previous: pos.clone(), direction,
          targetId: -1, friendly: false, life: 13, confused: false })
        this.events.push({ type: 'incoming', position: pos.clone() })
        this.notify('MISSILE ALERT  ·  导弹来袭，按 F 释放干扰', 'danger', 3)
      }
    }
  }

  private updateLock(dt: number) {
    const target = this.enemies.find(enemy => enemy.id === this.selectedTarget && enemy.health > 0)
    if (!target) { this.selectTarget(); this.lock = 0; return }
    const delta = target.position.clone().sub(this.position)
    const distance = delta.length()
    const canLock = distance < LOCK_RANGE && this.forward.dot(delta.normalize()) > LOCK_ANGLE
    this.lock = MathUtils.clamp(this.lock + (canLock ? dt / LOCK_TIME : -dt * 2.5), 0, 1)
    if (this.lock === 1 && !this.lockAnnounced) {
      this.lockAnnounced = true
      this.events.push({ type: 'lock', position: target.position.clone() })
    }
    if (this.lock === 0) this.lockAnnounced = false
  }

  private updateGun(dt: number, firing: boolean) {
    if (this.overheated && this.gunHeat < 0.24) this.overheated = false
    this.gunTimer = Math.max(0, this.gunTimer - dt)
    if (firing && !this.overheated) {
      this.gunHeat = Math.min(1, this.gunHeat + dt * 0.28)
      if (this.gunHeat >= 1) { this.overheated = true; this.notify('机炮过热 · 等待冷却', 'danger', 2) }
      if (this.gunTimer === 0) {
        this.gunTimer = 0.065
        let direction = this.forward.clone()
        const target = this.enemies.find(enemy => enemy.id === this.selectedTarget && enemy.health > 0)
        if (target) {
          const delta = target.position.clone().sub(this.position)
          if (delta.length() < 1700 && this.forward.dot(delta.clone().normalize()) > Math.cos(0.115)) {
            const lead = target.position.clone().addScaledVector(target.direction, delta.length() / 1300 * 210)
            direction = lead.sub(this.position).normalize()
          }
        }
        const position = this.position.clone().add(new Vector3(1.1, 0, -6).applyQuaternion(this.quaternion))
        this.bullets.push({ id: this.nextId++, position, previous: position.clone(), direction, life: 1.6 })
        this.events.push({ type: 'gun', position: position.clone() })
      }
    } else {
      this.gunHeat = Math.max(0, this.gunHeat - dt * 0.22)
    }
  }

  private updateMissiles(dt: number) {
    for (const missile of this.missiles) {
      missile.previous.copy(missile.position)
      missile.life -= dt
      const target = missile.friendly ? this.enemies.find(enemy => enemy.id === missile.targetId && enemy.health > 0) : undefined
      const targetPosition = missile.friendly ? target?.position : this.position
      if (targetPosition && !missile.confused) {
        const intercept = targetPosition.clone()
        if (target) intercept.addScaledVector(target.direction, Math.min(0.65, missile.position.distanceTo(intercept) / 1300) * 200)
        const desired = intercept.sub(missile.position).normalize()
        missile.direction.lerp(desired, 1 - Math.exp(-(missile.friendly ? 4 : 1.05) * dt)).normalize()
      }
      missile.position.addScaledVector(missile.direction, (missile.friendly ? 880 : 490) * dt)
      if (targetPosition && !missile.confused && distanceToSegment(targetPosition, missile.previous, missile.position) < (missile.friendly ? 32 : 19)) {
        missile.life = 0
        if (target) this.damageEnemy(target, 60)
        else if (!missile.friendly) {
          this.health = Math.max(0, this.health - 24)
          this.events.push({ type: 'damage', position: this.position.clone() })
          this.notify('机体中弹 · 立即规避并释放干扰', 'danger', 3)
        }
      }
    }
    this.missiles = this.missiles.filter(missile => missile.life > 0)
  }

  private updateBullets(dt: number) {
    for (const bullet of this.bullets) {
      bullet.previous.copy(bullet.position)
      bullet.position.addScaledVector(bullet.direction, 1400 * dt)
      bullet.life -= dt
      for (const enemy of this.enemies) {
        if (enemy.health > 0 && distanceToSegment(enemy.position, bullet.previous, bullet.position) < 25) {
          this.damageEnemy(enemy, 9)
          bullet.life = 0
          break
        }
      }
    }
    this.bullets = this.bullets.filter(bullet => bullet.life > 0)
  }

  private damageEnemy(enemy: Enemy, amount: number) {
    enemy.health = Math.max(0, enemy.health - amount)
    this.events.push({ type: 'hit', position: enemy.position.clone() })
    if (enemy.health === 0) {
      this.kills++
      this.score += 1000
      this.events.push({ type: 'kill', position: enemy.position.clone() })
      this.notify(`SPLASH  ·  ${enemy.name} 已击落  +1,000`, 'success', 4)
      this.selectTarget()
    }
  }
}
