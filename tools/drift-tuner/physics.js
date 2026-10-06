// Упрощённая физика дрифт-кара для симулятора настройки подвески.
// Вид сверху, 4 колеса, перенос веса через динамику крена/тангажа,
// шина — Pacejka-lite с трением по кругу Камма. Единицы СИ, если не сказано иное.
// Работает и в браузере (window.DriftPhysics), и в Node (require).
(function (root) {
  'use strict'

  const G = 9.81
  const DEG = Math.PI / 180

  const CAR = {
    m: 1300,          // масса, кг
    Iz: 2300,         // момент инерции рыскания
    Ixx: 550,         // момент инерции крена
    L: 2.55,          // колёсная база
    wf: 0.52,         // доля веса на переднюю ось
    track: 1.5,       // колея
    hBase: 0.40,      // высота ЦТ при клиренсе 110 мм
    maxSteer: 0.80,   // макс. угол поворота колёс, рад (~46°, дрифт-доворот)
    Fdrive: 8500,     // макс. тяга на колёсах, Н
    Pmax: 240000,     // мощность, Вт
    vmax: 62,         // м/с (~223 км/ч)
    brakeMax: 14500,  // суммарная тормозная сила, Н
    cdA: 0.42,        // 0.5·ρ·Cd·A
  }
  CAR.a = CAR.L * (1 - CAR.wf) // ЦТ → передняя ось
  CAR.b = CAR.L - CAR.a        // ЦТ → задняя ось

  const DEFAULTS = {
    springF: 45, springR: 38,   // Н/мм на колесо
    arbF: 150, arbR: 120,       // стабилизатор, Н·м/град
    dampF: 4.0, dampR: 3.5,     // Н·с/мм на колесо
    rideHeight: 110,            // клиренс, мм
    camberF: -4.5, camberR: -1.5, // развал, °
    toeF: -0.1, toeR: 0.2,      // схождение, ° (+ = внутрь)
    caster: 6,                  // кастер, ° — сила самовозврата руля
    diffLock: 80,               // блокировка дифференциала, %
    brakeBias: 55,              // тормозной баланс на перед, %
  }

  const PRESETS = {
    base: { name: 'Базовая дрифт', params: { ...DEFAULTS } },
    stock: {
      name: 'Сток (мягкая)',
      params: { springF: 25, springR: 22, arbF: 40, arbR: 30, dampF: 2.0, dampR: 2.0,
        rideHeight: 140, camberF: -0.5, camberR: -0.5, toeF: 0, toeR: 0.1,
        caster: 4, diffLock: 0, brakeBias: 62 },
    },
    stiff: {
      name: 'Жёсткая, низкая',
      params: { springF: 90, springR: 80, arbF: 300, arbR: 250, dampF: 7.5, dampR: 7.0,
        rideHeight: 80, camberF: -6, camberR: -2, toeF: -0.2, toeR: 0.1,
        caster: 8, diffLock: 100, brakeBias: 50 },
    },
    angle: {
      name: 'Максимум угла',
      params: { springF: 55, springR: 30, arbF: 120, arbR: 40, dampF: 5.0, dampR: 3.0,
        rideHeight: 105, camberF: -7, camberR: -0.5, toeF: -0.3, toeR: 0,
        caster: 8, diffLock: 100, brakeBias: 48 },
    },
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  function cgHeight(p) { return CAR.hBase + (p.rideHeight - 110) / 1000 }
  function rollCenters(p) {
    const d = (p.rideHeight - 110) / 1000
    return { rcF: Math.max(0.02, 0.09 + d), rcR: Math.max(0.03, 0.14 + d) }
  }
  function rollStiffness(p) {
    const t2 = CAR.track * CAR.track
    return {
      kF: 0.5 * p.springF * 1000 * t2 + p.arbF * 57.2958,
      kR: 0.5 * p.springR * 1000 * t2 + p.arbR * 57.2958,
      cF: 0.5 * p.dampF * 1000 * t2,
      cR: 0.5 * p.dampR * 1000 * t2,
    }
  }

  // Статические показатели настройки (для панели «Анализ»)
  function analyze(p) {
    const { kF, kR, cF, cR } = rollStiffness(p)
    const { rcF, rcR } = rollCenters(p)
    const h = cgHeight(p)
    const mF = CAR.m * CAR.wf, mR = CAR.m * (1 - CAR.wf)
    const hr = h - (rcF * CAR.wf + rcR * (1 - CAR.wf))
    const kT = kF + kR
    const elastic = CAR.m * G * hr // момент при 1 g
    const phi = elastic / kT
    const dFf = (kF * phi) / CAR.track + (mF * G * rcF) / CAR.track
    const dFr = (kR * phi) / CAR.track + (mR * G * rcR) / CAR.track
    const lltdF = dFf / (dFf + dFr)
    const zeta = (cF + cR) / (2 * Math.sqrt(kT * CAR.Ixx))
    return { lltdF, rollDegPerG: phi / DEG, zeta, cgHeight: h, staticF: CAR.wf }
  }

  function createState(speed = 0) {
    return {
      x: 0, y: 0, psi: 0, vx: speed, vy: 0, r: 0,
      phi: 0, phiDot: 0, dl: 0, steer: 0, thr: 0, kick: 0,
      ay: 0, ax: 0,
      fz: [0, 0, 0, 0], alpha: [0, 0, 0, 0], sat: [0, 0, 0, 0],
      beta: 0, speed, rollDeg: 0, latG: 0, delta: 0, betaDot: 0, betaPrev: 0,
    }
  }

  const PX = [CAR.a, CAR.a, -CAR.b, -CAR.b]
  const PY = [CAR.track / 2, -CAR.track / 2, CAR.track / 2, -CAR.track / 2]

  // inp: { steer -1..1 (влево +), throttle 0..1, brake 0..1, handbrake 0|1, kick 0|1, assist bool }
  function step(s, inp, p, dt) {
    const t = CAR.track
    const h = cgHeight(p)
    const { kF, kR, cF, cR } = rollStiffness(p)
    const { rcF, rcR } = rollCenters(p)
    const mF = CAR.m * CAR.wf, mR = CAR.m * (1 - CAR.wf)
    const hr = h - (rcF * CAR.wf + rcR * (1 - CAR.wf))
    const speedAbs = Math.hypot(s.vx, s.vy)

    // --- руль ---
    const lockScale = 1 - 0.3 * clamp((speedAbs - 10) / 40, 0, 1)
    const driverTarget = clamp(inp.steer, -1, 1) * CAR.maxSteer * lockScale
    const rate = Math.abs(driverTarget) > Math.abs(s.steer) ? 3.2 : 5.0
    s.steer += clamp(driverTarget - s.steer, -rate * dt, rate * dt)
    let delta = s.steer
    if (inp.assist !== false && s.vx > 2) {
      const gain = clamp(1.15 + (p.caster - 3) * 0.05, 1.0, 1.5) // кастер = сила самовозврата
      const align = Math.atan2(s.vy + CAR.a * s.r, s.vx)
      // выравнивание колёс по скорости + демпфирование скорости изменения угла
      delta += gain * align + 0.25 * s.betaDot
    }
    delta = clamp(delta, -CAR.maxSteer, CAR.maxSteer)
    s.delta = delta

    // --- педали ---
    s.thr += (inp.throttle - s.thr) * Math.min(1, dt * 8)
    if (inp.kick && s.kick <= 0) s.kick = 0.25
    const kickMul = s.kick > 0 ? 1.8 : 1
    s.kick = Math.max(0, s.kick - dt)
    const dir = clamp(s.vx / 1.5, -1, 1) // направление движения, сглаженное на нуле

    // --- вертикальные нагрузки ---
    const phiDeg = s.phi / DEG
    const dFf = (kF * s.phi + cF * s.phiDot) / t + (mF * s.ay * rcF) / t
    const dFr = (kR * s.phi + cR * s.phiDot) / t + (mR * s.ay * rcR) / t
    const wF = (CAR.m * G * CAR.wf) / 2, wR = (CAR.m * G * (1 - CAR.wf)) / 2
    const base = [wF - s.dl / 2 - dFf, wF - s.dl / 2 + dFf, wR + s.dl / 2 - dFr, wR + s.dl / 2 + dFr]
    // правые колёса (индексы 1, 3) нагружаются при φ>0 (крен вправо)
    const fz = base.map((v) => Math.max(v, 40))

    // --- параметры шин по колёсам ---
    const camberStatic = [p.camberF, p.camberF, p.camberR, p.camberR]
    const toe = [p.toeF, p.toeF, p.toeR, p.toeR] // + внутрь
    const mu0 = [1.15, 1.15, 1.0, 1.0]
    const mu = [0, 0, 0, 0], cap = [0, 0, 0, 0]
    for (let i = 0; i < 4; i++) {
      const sideSign = i % 2 === 0 ? -1 : 1 // правое колесо теряет отрицательный развал при крене вправо
      const ceff = camberStatic[i] + sideSign * 0.7 * phiDeg
      const cm = Math.max(0.6, 1 - 0.008 * (ceff + 3.2) * (ceff + 3.2))
      const ls = clamp(1 - 0.00005 * (fz[i] - 3200), 0.6, 1.3)
      mu[i] = mu0[i] * ls * cm
      cap[i] = mu[i] * fz[i]
    }

    // --- продольные силы: тяга, тормоз, ручник ---
    const v = Math.max(s.vx, 0)
    const fAvail = Math.min(CAR.Fdrive, CAR.Pmax / Math.max(v, 1)) * clamp((CAR.vmax - v) / 6, 0, 1)
    const Fd = s.thr * fAvail * kickMul
    const lock = clamp(p.diffLock / 100, 0, 1)
    const capRL = cap[2], capRR = cap[3]
    const openEach = Math.min(Fd / 2, Math.min(capRL, capRR))
    const lockedTot = Math.min(Fd, capRL + capRR)
    const driveRL = (1 - lock) * openEach + lock * lockedTot * (capRL / (capRL + capRR))
    const driveRR = (1 - lock) * openEach + lock * lockedTot * (capRR / (capRL + capRR))
    // запрошенная тяга выше возможной → буксование (сильнее режет боковую силу)
    const reqRL = Fd / 2, reqRR = Fd / 2
    const brakeF = inp.brake * CAR.brakeMax * (p.brakeBias / 100) / 2
    const brakeR = inp.brake * CAR.brakeMax * (1 - p.brakeBias / 100) / 2
    const fxReq = [
      -dir * brakeF,
      -dir * brakeF,
      driveRL - dir * (brakeR + (inp.handbrake ? 1e5 : 0)),
      driveRR - dir * (brakeR + (inp.handbrake ? 1e5 : 0)),
    ]
    const spinning = [false, false, reqRL > capRL * 1.05, reqRR > capRR * 1.05]

    // --- силы по колёсам ---
    let Fx = 0, Fy = 0, Mz = 0
    for (let i = 0; i < 4; i++) {
      const front = i < 2
      const toeAng = (i % 2 === 0 ? -1 : 1) * toe[i] * DEG // левое: + внутрь = вправо
      const d = (front ? delta : 0) + toeAng
      const cd = Math.cos(d), sd = Math.sin(d)
      const vwx = s.vx - s.r * PY[i]
      const vwy = s.vy + s.r * PX[i]
      const vlong = cd * vwx + sd * vwy
      const vlat = -sd * vwx + cd * vwy
      const alpha = Math.atan2(vlat, Math.abs(vlong) + 1.0)
      const fxw = clamp(fxReq[i], -cap[i] * 0.98, cap[i] * 0.98)
      const circle = Math.sqrt(Math.max(0, 1 - (fxw / cap[i]) * (fxw / cap[i])))
      const lowSpeed = clamp(Math.hypot(vwx, vwy) / 1.5, 0, 1)
      const slideLoss = spinning[i] ? 0.88 : 1
      const fyw = -cap[i] * Math.sin(1.45 * Math.atan(11 * alpha)) * circle * slideLoss * lowSpeed
      const fxb = fxw * cd - fyw * sd
      const fyb = fxw * sd + fyw * cd
      Fx += fxb
      Fy += fyb
      Mz += PX[i] * fyb - PY[i] * fxb
      s.alpha[i] = alpha / DEG
      s.sat[i] = clamp(Math.hypot(fxw, fyw) / cap[i], 0, 1.2)
      s.fz[i] = fz[i]
    }
    // сопротивление
    Fx -= dir * (CAR.cdA * s.vx * s.vx + 150)
    Fy -= 0.6 * s.vy * Math.abs(s.vy)

    // --- интегрирование кузова ---
    const axB = Fx / CAR.m, ayB = Fy / CAR.m
    s.vx += (axB + s.r * s.vy) * dt
    s.vy += (ayB - s.r * s.vx) * dt
    s.r += (Mz / CAR.Iz) * dt
    const cp = Math.cos(s.psi), sp = Math.sin(s.psi)
    s.x += (s.vx * cp - s.vy * sp) * dt
    s.y += (s.vx * sp + s.vy * cp) * dt
    s.psi += s.r * dt

    const lp = Math.min(1, dt * 40)
    s.ay += (ayB - s.ay) * lp
    s.ax += (axB - s.ax) * lp

    // крен: φ>0 — кузов кренится вправо при левом боковом ускорении
    const rollAcc = (CAR.m * s.ay * hr - (kF + kR) * s.phi - (cF + cR) * s.phiDot) / CAR.Ixx
    s.phiDot += rollAcc * dt
    s.phi = clamp(s.phi + s.phiDot * dt, -0.15, 0.15)

    // тангаж: перенос вперёд/назад с задержкой от демпфирования
    const tau = 0.03 + ((p.dampF + p.dampR) / 2) * 1000 * 1.5e-5
    s.dl += (((CAR.m * s.ax * h) / CAR.L) - s.dl) * Math.min(1, dt / tau)

    s.speed = Math.hypot(s.vx, s.vy)
    const bRad = Math.atan2(s.vy, Math.max(s.vx, 0.5))
    s.betaDot += (((bRad - s.betaPrev) / dt) - s.betaDot) * Math.min(1, dt * 30)
    s.betaPrev = bRad
    s.beta = s.vx > 1 ? Math.atan2(s.vy, s.vx) / DEG : 0
    s.rollDeg = s.phi / DEG
    s.latG = s.ay / G
  }

  const api = { CAR, DEFAULTS, PRESETS, createState, step, analyze, rollStiffness, DEG, G }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.DriftPhysics = api
})(typeof window !== 'undefined' ? window : globalThis)
