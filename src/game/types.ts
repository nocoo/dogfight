export type GamePhase = 'ready' | 'playing' | 'paused' | 'victory' | 'defeat'
export type ControlMode = 'keyboard' | 'mouse'
export type Quality = 'high' | 'balanced'

export interface FlightInput {
  turn: number
  pitch: number
  boost: boolean
  brake: boolean
  gun: boolean
}

export interface TargetView {
  id: number
  name: string
  health: number
  distance: number
  x: number
  y: number
  visible: boolean
  bearing: number
  radarX: number
  radarY: number
}

export interface GameSnapshot {
  phase: GamePhase
  speed: number
  altitude: number
  heading: number
  pitch: number
  roll: number
  aimX: number
  aimY: number
  health: number
  missiles: number
  flares: number
  flareCooldown: number
  gunHeat: number
  overheated: boolean
  missileCooldown: number
  lock: number
  selectedTarget: number
  targets: TargetView[]
  kills: number
  elapsed: number
  score: number
  boosting: boolean
  incoming: boolean
  lowAltitude: boolean
  message: string
  messageType: 'info' | 'danger' | 'success'
}

export const initialSnapshot: GameSnapshot = {
  phase: 'ready', speed: 920, altitude: 2400, heading: 0, pitch: 0, roll: 0, aimX: 50, aimY: 47,
  health: 100, missiles: 12, flares: 6, flareCooldown: 0, gunHeat: 0,
  overheated: false, missileCooldown: 0, lock: 0, selectedTarget: 0,
  targets: [], kills: 0, elapsed: 0, score: 0, boosting: false,
  incoming: false, lowAltitude: false, message: '', messageType: 'info',
}

export const neutralInput: FlightInput = { turn: 0, pitch: 0, boost: false, brake: false, gun: false }
