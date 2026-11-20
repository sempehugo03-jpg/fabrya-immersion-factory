import { SHOT_PACES } from './motion-pacing.js';

const FRAME_STOPS = [0, 72, 144, 216, 288];
const SCROLL_STOPS = [0, 2, 3, 4.7, 5.85];
const JOIN_WIDTH = .15;
const THIRD_JOIN = 3;

function secondsPerFrame(shot, end) {
  const pace = SHOT_PACES[shot];
  const edge = end ? pace.at(-1) - pace.at(-2) : pace[1] - pace[0];
  return edge * (SCROLL_STOPS[shot + 1] - SCROLL_STOPS[shot]) / pace.at(-1);
}

function boundaryRate(join) {
  return 2 / (secondsPerFrame(join - 1, true) + secondsPerFrame(join, false));
}

function matchRate(fraction, slope) {
  const x = fraction / JOIN_WIDTH;
  return fraction + (slope - 1) * fraction * (1 - x) ** 2;
}

function cubic(fraction, startSlope, endSlope) {
  return fraction * (startSlope + fraction * (3 - 2 * startSlope - endSlope +
    fraction * (startSlope + endSlope - 2)));
}

// Keep both sides of a chapter anchor moving at the same rate per scroll pixel.
export function chapterPosition(y, centers, linear = false) {
  if (y <= centers[0]) return 0;
  for (let i = 0; i < centers.length - 1; i++) {
    if (y >= centers[i + 1]) continue;
    const span = centers[i + 1] - centers[i];
    const fraction = (y - centers[i]) / span;
    if (linear) return i + fraction;
    const start = i === 0 ? 1 : 2 * span / (centers[i + 1] - centers[i - 1]);
    const end = i + 2 === centers.length ? 1 : 2 * span / (centers[i + 2] - centers[i]);
    return i + cubic(fraction, start, end);
  }
  return centers.length - 1;
}

function easeToJoin(fraction) {
  const x = fraction / JOIN_WIDTH;
  return JOIN_WIDTH * x * x * (2 - x);
}

function followPace(pace, fraction) {
  const last = pace.length - 1;
  const target = fraction * pace[last];
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (pace[middle] <= target) low = middle;
    else high = middle;
  }
  const span = pace[high] - pace[low];
  const start = low === 0 ? 1 : 2 * span / (pace[high] - pace[low - 1]);
  const end = high === last ? 1 : 2 * span / (pace[high + 1] - pace[low]);
  return low + cubic((target - pace[low]) / span, start, end);
}

export function filmPosition(t, reduced = false, reference = false) {
  const next = SCROLL_STOPS.findIndex(stop => t < stop);
  if (next === -1) return FRAME_STOPS.at(-1);
  if (next === 0) return 0;
  const shot = next - 1;
  if (reduced) return FRAME_STOPS[shot];
  let f = (t - SCROLL_STOPS[shot]) / (SCROLL_STOPS[next] - SCROLL_STOPS[shot]);
  if (shot > 0 && shot < THIRD_JOIN && f < JOIN_WIDTH) {
    f = reference ? easeToJoin(f) : matchRate(f, boundaryRate(shot) * secondsPerFrame(shot, false));
  }
  if (f > 1 - JOIN_WIDTH) {
    if (next < THIRD_JOIN) {
      f = 1 - (reference ? easeToJoin(1 - f) : matchRate(1 - f, boundaryRate(next) * secondsPerFrame(shot, true)));
    } else if (next === SCROLL_STOPS.length - 1) {
      f = 1 - easeToJoin(1 - f);
    }
  }
  return FRAME_STOPS[shot] + followPace(SHOT_PACES[shot], f);
}
