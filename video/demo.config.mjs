/**
 * The WikiBento tutorial — the project half of the video pipeline.
 *
 * Everything that is about *this app* lives here or in `video/actions.mjs`: its URL, how a scene's starting
 * state is established, what each scene does on screen, and the words on the title and closing cards. The
 * engine in `pipeline/` reads this file and otherwise knows nothing about WikiBento — swap this config (and
 * the script beside it) and the same engine makes a video for another app.
 *
 * Run any step with `--config video/demo.config.mjs`, or rely on that being the default.
 */
import * as wikibento from './actions.mjs';

export default {
  /** output directory name, and the stem of the review bundle's filenames */
  name: 'wikibento-tutorial',

  /** a human title for the transcript's header line */
  transcriptTitle: 'WikiBento tutorial — narration transcript',

  /** the app being demonstrated (actions.mjs uses it too, via the context the engine injects) */
  base: 'https://wikibento.toolforge.org',

  /** the shooting script, and the per-scene setup the script does not carry */
  script: 'video/SCRIPT.md',
  plan: 'video/scenes.json',

  video: { width: 1920, height: 1080, fps: 25 },

  /** voiceover defaults; the engine's CLI can override both */
  tts: { provider: 'edge', voice: 'en-US-AvaNeural' },

  /** the app-specific half: where scenes start, and what they do */
  actions: wikibento,

  /**
   * Title and closing cards: plain HTML rendered in a real browser at the video's resolution, so the fonts
   * are the browser's and no ffmpeg text support is needed. `file` is the PNG name in <out>/cards.
   */
  cards: [
    {
      id: 'title',
      file: 'title.png',
      html: `
    <div style="font-size:112px;font-weight:700;letter-spacing:-2px">WikiBento</div>
    <div style="font-size:40px;color:#b9c2cf;margin-top:26px">Build a dashboard from live Wikimedia data — in three minutes</div>
    <div style="font-size:33px;color:#8fc0ff;margin-top:34px;font-family:ui-monospace,Menlo,monospace">wikibento.toolforge.org</div>`,
    },
    {
      id: 'end',
      file: 'end.png',
      html: `
    <div style="font-size:66px;font-weight:700">Start a board of your own</div>
    <div style="font-size:38px;color:#8fc0ff;margin-top:34px;font-family:ui-monospace,Menlo,monospace">wikibento.toolforge.org&nbsp;&nbsp;·&nbsp;&nbsp;?config=&lt;your wiki page&gt;</div>
    <div style="font-size:29px;color:#b9c2cf;margin-top:44px">Written guide: docs/TUTORIAL.md&nbsp;&nbsp;·&nbsp;&nbsp;Ask box: describe what you want</div>`,
    },
  ],

  /** the card that speaks over the title: a scene in the script with no starting state (a card, not a recording) */
  titleCardScene: '00-title',
};
