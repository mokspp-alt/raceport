/**
 * ИСХОДНЫЕ ДАННЫЕ МАШИНЫ — единственное место, где их нужно править.
 *
 * Система координат машины (СИ-мм, правая тройка):
 *   X — вперёд, Y — влево, Z — вверх. Начало: на земле под центром ПЕРЕДНЕЙ оси.
 *   Все точки подвески заданы для ЛЕВОГО колеса, правое получается зеркалом по Y.
 *
 * Пометки:
 *   [предположение] — правдоподобное значение, не измерено. Заменить своим.
 *   [измерено]      — подтверждено пользователем (пока таких нет).
 *
 * Углы: развал "−" = верх внутрь; схождение "+" = toe-in (носки внутрь), на КОЛЕСО.
 */

export interface TireSize {
  width: number; // мм
  aspect: number; // %
  rimInch: number; // дюймы
}

/** Свободный радиус шины, мм. */
export function tireRadius(t: TireSize): number {
  return (t.rimInch * 25.4) / 2 + (t.width * t.aspect) / 100;
}

export interface VehicleConfig {
  wheelbase: number;
  trackFront: number;
  trackRear: number;
  mass: number;
  frontWeightPct: number;
  cgHeight: number;
  tires: { front: TireSize; rear: TireSize };
  /** Комплектация (справочно). */
  kit: string;
  /** Усилитель руля: 'hydraulic' (ГУР) — момент на руле в руке меньше момента на рейке. */
  steeringAssist: 'hydraulic' | 'electric' | 'none';
  /** Задний диф: 'welded' — заварен (обе ведущие колёса вращаются одинаково). */
  diff: 'welded' | 'lsd' | 'open';

  front: {
    /** Наклон оси поворота (KPI) при нулевом развале, град. */
    kpiDeg: number;
    /** Плечо обкатки при нулевом развале, мм (+ = ось пересекает землю внутри пятна). */
    scrubMm: number;
    /** Высота шаровых опор над землёй (статика), мм. */
    lbjZ: number;
    ubjZ: number;
    /** Высота наружного шарнира рулевой тяги, мм. */
    otrZ: number;
    /** Длина рулевого рычага кулака в плане (от оси поворота до шарнира тяги), мм. */
    steeringArmLen: number;
    /** Тяга позади оси колеса ('rear') или перед ней ('front'). */
    armSide: 'rear' | 'front';
    /** Внутренние шарниры рычагов (кузов), для левой стороны. Y — от оси машины. */
    lcaIn: { y: number; z: number; xFront: number; xRear: number };
    ucaIn: { y: number; z: number; xFront: number; xRear: number };
    /** Рейка: X базового ("штатного") положения, высота, половина расстояния между внутренними шарнирами. */
    rackX: number;
    rackZ: number;
    rackHalfWidth: number;
    /** Ход рейки на каждую сторону и передаточное число (мм хода на градус руля). */
    rackHalfStroke: number;
    rackMmPerSteeringDeg: number;
    /** Максимальный угол поворота колеса с Wisefab, град. */
    maxWheelAngleDeg: number;
  };

  rear: {
    /** Схематичные точки рычагов сзади (для отрисовки), левая сторона. */
    armInner: { y: number; z: number; xFront: number; xRear: number };
  };

  dynamics: {
    /** Градиент крена кузова, град на 1 g поперечного ускорения. */
    rollGradientDegPerG: number;
    /** Доля поперечного переноса веса, приходящаяся на переднюю ось (по жёсткости на крен), %. */
    latTransferFrontPct: number;
    /** Тяговое усилие на задних колёсах при газе 100 %, Н. */
    maxTractionN: number;
    /** Предельная доля сцепления задней шины (μ·Fz), которую можно потратить на тягу; остальное — пробуксовка. */
    maxRearLongShare: number;
  };

  steering: {
    /** Доля момента от дороги, которую снимает ГУР (0 = без усилителя), 0…1. */
    assistFraction: number;
  };
}

export const vehicle: VehicleConfig = {
  wheelbase: 2525, // мм [предположение: штатный S14]
  trackFront: 1500, // мм [предположение: с кит-комплектом шире штатной]
  trackRear: 1490, // мм [предположение]
  mass: 1250, // кг [предположение: облегчённый дрифт-кар с водителем]
  frontWeightPct: 52, // % на переднюю ось [предположение]
  cgHeight: 460, // мм [предположение]

  tires: {
    front: { width: 245, aspect: 40, rimInch: 18 }, // [измерено: 245/40R18 по кругу]
    rear: { width: 245, aspect: 40, rimInch: 18 }, // [измерено]
  },
  kit: 'Wisefab V2', // [измерено]
  steeringAssist: 'hydraulic', // [измерено: ГУР]
  diff: 'welded', // [измерено: заварка]

  front: {
    kpiDeg: 9, // [предположение: Wisefab ~8–10°]
    scrubMm: 15, // [предположение: малое положительное плечо обкатки]
    lbjZ: 150, // [предположение]
    ubjZ: 570, // [предположение]
    otrZ: 200, // [предположение]
    steeringArmLen: 135, // [предположение]
    armSide: 'rear', // [предположение: рейка позади оси колёс]
    lcaIn: { y: 380, z: 165, xFront: 100, xRear: -170 }, // [предположение]
    ucaIn: { y: 420, z: 540, xFront: 60, xRear: -120 }, // [предположение: внутренний шарнир ниже UBJ → центр крена внутри]
    rackX: -110, // [предположение]
    rackZ: 200, // [предположение]
    rackHalfWidth: 330, // [предположение]
    rackHalfStroke: 90, // [предположение: с запасом над штатными ±75, уточнить по рейке]
    rackMmPerSteeringDeg: 0.2, // [предположение: ~2.1 оборота lock-to-lock]
    maxWheelAngleDeg: 65, // [предположение: «~65–70°, уточню»]
  },

  rear: {
    armInner: { y: 330, z: 170, xFront: 80, xRear: -160 }, // [предположение, только для отрисовки]
  },

  dynamics: {
    rollGradientDegPerG: 1.2, // [предположение: жёсткая дрифт-подвеска]
    latTransferFrontPct: 55, // [предположение]
    maxTractionN: 8000, // [предположение: ≈ тяга S14 с ~400 л.с. на 2–3 передаче, ограничена сцеплением]
    maxRearLongShare: 0.85, // [предположение: сверх этой доли тяга превращается в пробуксовку, боковая сила остаётся ≥ 53 % от μFz]
  },

  steering: {
    assistFraction: 0.7, // [предположение: ГУР снимает ~70 % нагрузки; зависит от насоса и торсиона]
  },
};

/** Текущие настройки (заполните своими; пока — типичные дрифт-значения). */
export const defaultSetup = {
  // Передняя ось
  rackOffsetMm: 0, // мм, + вперёд от штатного [предположение]
  frontToeDeg: -0.1, // град на колесо, + toe-in [предположение: чуть toe-out]
  frontCamberDeg: -4.0, // град [предположение]
  casterDeg: 7.0, // град [предположение]
  ackermannPct: 50, // % [предположение]
  frontPressureBar: 2.0, // бар [предположение]
  // Задняя ось
  rearToeDeg: 0.2, // град на колесо [предположение]
  rearCamberDeg: -1.5, // град [предположение]
  rearPressureBar: 2.8, // бар [предположение]
  // Сценарий (используется на этапах 2–3)
  slipAngleDeg: 30, // град [предположение]
  speedKmh: 80, // км/ч [предположение]
  throttlePct: 50, // % [предположение]
  // Положение органов управления (не настройки подвески)
  steerWheelDeg: 0, // град руля, + влево
  heaveMm: 0, // ход подвески, + сжатие
};

export type State = typeof defaultSetup;
