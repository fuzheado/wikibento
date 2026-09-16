/**
 * The board notice (ISSUE-88) — one slim bar, two states, three decisions.
 *
 * It exists because a URL board is *borrowed* rather than adopted, and a borrowed board raises a question the
 * visitor has to be able to answer ("is this mine now?"). Deliberately not a dialog: this appears on
 * *navigation* — someone clicked a link — and a modal there is hostile, especially on the demos hub where
 * there are a dozen links. See ISSUE-88 for the full reasoning; the short version is that a warning is a
 * worse substitute for reversibility, so the notice informs and offers the two ways out, and nothing here is
 * irreversible.
 *
 *   borrowed  "Viewing a shared board — Document Reader. Your board is saved and untouched."
 *             [Save this as mine]  [Back to my board]
 *   recover   "Editing your copy of Document Reader. Your previous board is saved."
 *             [Restore my board]  [✕]
 *
 * Shown only when there is something at stake (`noticeState`): a first-time visitor, or a visitor whose board
 * is the one the link points at, sees nothing at all.
 */

export default function BoardNotice({ kind, label, onKeep, onBack, onRestore, onDismiss }) {
  if (kind === 'borrowed') {
    return (
      <div className="board-notice board-notice-borrowed" role="status" data-notice="borrowed">
        <span className="board-notice-msg">
          👀 Viewing a shared board{label ? ` — ${label}` : ''}. <strong>Your own board is saved and untouched</strong>
          {' '}— edit anything to make this copy yours.
        </span>
        <button className="board-notice-btn" onClick={onKeep} title="Adopt this board now, replacing your saved one (recoverable)">
          Save this as mine
        </button>
        <button className="board-notice-btn" onClick={onBack} title="Return to your own saved board">
          Back to my board
        </button>
      </div>
    );
  }

  if (kind === 'recover') {
    return (
      <div className="board-notice board-notice-recover" role="status" data-notice="recover">
        <span className="board-notice-msg">
          💾 Your previous board is saved — <strong>recoverable for today</strong>.
        </span>
        <button className="board-notice-btn" onClick={onRestore} title="Put your previous board back">
          Restore my board
        </button>
        <button
          className="board-notice-close"
          onClick={onDismiss}
          title="Dismiss — your previous board will no longer be recoverable"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
