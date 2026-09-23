// Motion data: Mesh2Motion, CC0-1.0. See assets/motions/README.md.
// The data is pre-retargeted from the verified source T-pose into the VRM 1
// normalized humanoid frame. Root translation and scale are intentionally absent.
const wrap = value => ((value % 1) + 1) % 1;

function interpolate(track, time, target, legacyVRM) {
  const {times, rotations} = track;
  let low = 0, high = times.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (times[mid] <= time) low = mid; else high = mid;
  }
  if (times.length === 1 || time <= times[0]) high = low = 0;
  else if (time >= times[times.length - 1]) high = low = times.length - 1;
  const start = low * 4, end = high * 4;
  const progress = low === high ? 0 : (time - times[low]) / (times[high] - times[low]);
  let dot = 0;
  for (let i = 0; i < 4; i++) dot += rotations[start + i] * rotations[end + i];
  const direction = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  let from = 1 - progress, to = progress;
  if (dot < .9995) {
    const angle = Math.acos(dot), sin = Math.sin(angle);
    from = Math.sin((1 - progress) * angle) / sin;
    to = Math.sin(progress * angle) / sin;
  }
  let length = 0;
  for (let i = 0; i < 4; i++) {
    target[i] = rotations[start + i] * from + rotations[end + i] * to * direction;
    length += target[i] * target[i];
  }
  length = Math.sqrt(length) || 1;
  for (let i = 0; i < 4; i++) target[i] = target[i] / length * (legacyVRM && (i === 0 || i === 2) ? -1 : 1);
}

export class AuthoredMotionLibrary {
  constructor(data) {
    if (data?.version !== 1 || !data.clips?.walk || !data.clips?.idle) throw new Error('Unsupported companion motion data');
    this.clips = data.clips;
  }
  // phase is a normalized full left/right stride cycle, not a one-foot step.
  // Pass an output object to reuse its arrays across frames.
  sample(name, phase, legacyVRM = false, out = {}) {
    const clip = this.clips[name];
    if (!clip) return null;
    const time = wrap(Number.isFinite(phase) ? phase : 0) * clip.duration;
    for (const [bone, track] of Object.entries(clip.tracks)) {
      interpolate(track, time, out[bone] ||= [0, 0, 0, 1], legacyVRM);
    }
    return out;
  }
  duration(name) { return this.clips[name]?.duration || 0; }
}

export async function loadAuthoredMotion(url = new URL('./assets/motions/companion-motion.json', import.meta.url)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load companion motions (${response.status})`);
  return new AuthoredMotionLibrary(await response.json());
}
