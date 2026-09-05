import { describe, expect, it } from 'vitest'
import { FlightSimulation, FORWARD, terrainHeight } from './simulation'
import { neutralInput } from './types'
import type { FlightInput } from './types'

function advance(sim: FlightSimulation, seconds: number, input: Partial<FlightInput> = {}) {
  for (let i = 0; i < seconds * 120; i++) sim.step(1 / 120, { ...neutralInput, ...input })
}

describe('flight and combat', () => {
  it('only flies during active combat, and resets the complete mission', () => {
    const sim = new FlightSimulation()
    const initial = sim.position.clone()
    advance(sim, 1)
    expect(sim.position.equals(initial)).toBe(true)
    sim.start(); advance(sim, 2, { turn: 1, pitch: 1, boost: true })
    expect(sim.position.y).toBeGreaterThan(initial.y)
    expect(sim.heading).toBeGreaterThan(0)
    expect(sim.speed).toBeGreaterThan(350)
    sim.phase = 'paused'
    const paused = sim.position.clone()
    advance(sim, 2)
    expect(sim.position.equals(paused)).toBe(true)
    sim.reset()
    expect(sim.position.equals(initial)).toBe(true)
    expect(sim.health).toBe(100)
    expect(sim.missilesLeft).toBe(12)
    expect(sim.elapsed).toBe(0)
  })

  it('requires a sustained forward lock and enforces missile cooldown', () => {
    const sim = new FlightSimulation(); sim.start()
    expect(sim.fireMissile()).toBe(false)
    advance(sim, 1.3)
    expect(sim.lock).toBe(1)
    expect(sim.fireMissile()).toBe(true)
    expect(sim.missilesLeft).toBe(11)
    expect(sim.fireMissile()).toBe(false)
    sim.selectTarget(2)
    expect(sim.lock).toBe(0)
  })

  it('homing missiles actually damage and destroy an aircraft', () => {
    const sim = new FlightSimulation(); sim.start()
    advance(sim, 1.3)
    sim.fireMissile()
    advance(sim, 2.7)
    expect(sim.enemies[0].health).toBe(40)
    sim.fireMissile()
    advance(sim, 2.7)
    expect(sim.enemies[0].health).toBe(0)
    expect(sim.kills).toBe(1)
    expect(sim.score).toBe(1000)
    expect(sim.selectedTarget).not.toBe(0)
  })

  it('flares break hostile guidance and cannot be spammed', () => {
    const sim = new FlightSimulation(); sim.start()
    const position = sim.position.clone().addScaledVector(FORWARD, -500)
    sim.missiles.push({ id: 999, position, previous: position.clone(), direction: FORWARD.clone(), targetId: -1, friendly: false, life: 10, confused: false })
    expect(sim.incoming).toBe(true)
    expect(sim.deployFlares()).toBe(true)
    expect(sim.incoming).toBe(false)
    expect(sim.flaresLeft).toBe(5)
    expect(sim.deployFlares()).toBe(false)
    advance(sim, 2)
    expect(sim.health).toBe(100)
    expect(sim.missiles).toHaveLength(0)
  })

  it('the unlimited cannon overheats and recovers', () => {
    const sim = new FlightSimulation(); sim.start()
    advance(sim, 3.65, { gun: true })
    expect(sim.overheated).toBe(true)
    advance(sim, 4)
    expect(sim.overheated).toBe(false)
    expect(sim.gunHeat).toBeLessThan(0.24)
  })

  it('ends the mission when every enemy is defeated', () => {
    const sim = new FlightSimulation(); sim.start()
    sim.enemies.forEach(enemy => { enemy.health = 0 })
    sim.kills = 3
    advance(sim, 0.1)
    expect(sim.phase).toBe('victory')
    expect(sim.score).toBeGreaterThan(0)
  })

  it('hostile AI attacks and can damage the player without defensive input', () => {
    const sim = new FlightSimulation(); sim.start()
    advance(sim, 30)
    expect(sim.events.some(event => event.type === 'incoming')).toBe(true)
    expect(sim.health).toBeLessThan(100)
    expect(sim.phase).toBe('playing')
  })

  it('treats a terrain collision as a defeat', () => {
    const sim = new FlightSimulation(); sim.start()
    sim.position.y = Math.max(0, terrainHeight(sim.position.x, sim.position.z)) + 5
    advance(sim, 0.1)
    expect(sim.phase).toBe('defeat')
    expect(sim.health).toBe(0)
  })
})
