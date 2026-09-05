/**
 * Shared speech controller for output/effector widgets (GitHub issue
 * fuzheado/wikibento#16 — the "speaker" text-to-speech widget, first of the
 * output family).
 *
 * SAFETY MODEL (design 2026-09-05 — see the do-ability comment on issue #16):
 * - NOTHING speaks while muted; mute is module-global, so one mute button
 *   silences every speaker on the board.
 * - ONE voice at a time: speak() cancels any in-flight utterance first (this
 *   is also a Chrome workaround — see the rate clamp below).
 * - The BROWSER only guards gesture-free speak() until the user has clicked
 *   ANYWHERE on the page (Chrome M71+); after that speak() is ungated. Real
 *   surprise protection therefore lives in the widget: auto-speak is only
 *   honored once the user has clicked ▶ on that widget ("armed"). Arming is
 *   per-widget state and lives in the SpeakerCard, not here.
 * - Zero-voice engines (headless CI, many Linux desktops) must degrade, not
 *   throw: callers check hasSynth()/roster length; this module refuses empty
 *   text and never throws.
 *
 * synth + Utterance are injected so tests can pass fakes.
 */
export const RATE_MIN = 0.5;
export const RATE_MAX = 2.0; // Chrome wedges speechSynthesis at rate > 2 until cancel()
export const VOLUME_CAP = 1.0;

export const clampRate = (r) => Math.min(RATE_MAX, Math.max(RATE_MIN, Number.isFinite(r) ? r : 1));
export const clampVolume = (v) => Math.min(VOLUME_CAP, Math.max(0, Number.isFinite(v) ? v : 1));

/** Pick the best voice from a roster (order matters):
 *  1. explicit name match (case-insensitive)
 *  2. preferred language match — full tag first, then primary subtag
 *  3. any English voice
 *  4. first voice
 * lang defaults to navigator.language, then 'en'. */
export function pickVoice(roster, { voice = null, lang = null } = {}) {
  if (!Array.isArray(roster) || roster.length === 0) return null;
  const norm = (s) => String(s || '').toLowerCase();
  const want = norm(lang || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en');
  const primary = want.split('-')[0];
  if (voice) {
    const byName = roster.find((v) => norm(v.name) === norm(voice));
    if (byName) return byName;
  }
  const matches = (v) => norm(v.lang).startsWith(want) || norm(v.lang).split('-')[0] === primary;
  return roster.find(matches) || roster.find((v) => norm(v.lang).startsWith('en')) || roster[0];
}

/** The widget-level safety predicate: nothing speaks unless the widget was
 *  armed by a real ▶ click, the board isn't muted, there is text, and the
 *  engine actually has voices. */
export function canSpeak({ voices = [], armed = false, muted = false, text = '' } = {}) {
  return Boolean(armed && !muted && String(text).trim() && Array.isArray(voices) && voices.length > 0);
}

/** Controller factory. Production binds window.speechSynthesis (see `speech`
 *  below); tests inject fakes. */
export function createSpeechController({ synth = null, Utterance = null } = {}) {
  let muted = false;
  const subscribers = new Set();
  const notify = () => subscribers.forEach((fn) => fn(api.isMuted()));
  const api = {
    isMuted: () => muted,
    hasSynth: () => Boolean(synth && typeof synth.speak === 'function' && typeof Utterance === 'function'),
    /** Mute is module-global: every speaker created from a controller shares
     *  it only when they share the same controller — the exported `speech`
     *  singleton is what every widget uses, so board-wide mute holds. */
    setMuted(m) { muted = Boolean(m); notify(); return muted; },
    toggleMuted() { return api.setMuted(!muted); },
    onMuteChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    stopAll() { if (synth && typeof synth.cancel === 'function') { try { synth.cancel(); } catch { /* noop */ } } },
    /** Speak text aloud. Returns { ok:true } or { ok:false, reason } with
     *  reason one of 'no-synth' | 'empty' | 'muted' | 'not-supported'. */
    speak(text, { voice = null, lang = null, rate = 1, volume = 0.8, onstart = null, onend = null, onerror = null } = {}) {
      if (!api.hasSynth()) return { ok: false, reason: 'no-synth' };
      if (!text || !String(text).trim()) return { ok: false, reason: 'empty' };
      if (muted) return { ok: false, reason: 'muted' };
      try {
        // Chrome workaround + one-voice-at-a-time: cancel before every speak.
        synth.cancel();
        const u = new Utterance(String(text));
        const picked = pickVoice(typeof synth.getVoices === 'function' ? synth.getVoices() : [], { voice, lang });
        if (picked) u.voice = picked;
        u.lang = (picked && picked.lang) || lang || (typeof navigator !== 'undefined' ? navigator.language : 'en');
        u.rate = clampRate(rate);
        u.volume = clampVolume(volume);
        if (onstart) u.onstart = () => onstart();
        if (onend) u.onend = () => onend();
        if (onerror) u.onerror = (e) => onerror(e && e.error ? e.error : 'error');
        synth.speak(u);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: 'not-supported' };
      }
    },
  };
  return api;
}

/** Singleton bound to the real browser APIs — the module-level export means
 *  all widgets on a board share one mute flag and one cancel channel. */
export const speech = (typeof window !== 'undefined' && window.speechSynthesis)
  ? createSpeechController({
      synth: window.speechSynthesis,
      Utterance: typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : null,
    })
  : createSpeechController({});
