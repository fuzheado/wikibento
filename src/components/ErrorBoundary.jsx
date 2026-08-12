import { Component } from 'react';

/**
 * Catches render errors from a single widget so one crash can't take down
 * the whole dashboard. Shows a themed fallback with a "Try Again" button.
 *
 * Auto-recovers when `resetKey` changes (pass the widget's config object —
 * any config edit gets a fresh object identity, so editing the widget
 * re-mounts its subtree automatically).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  /** Clear the error when the widget's config changes (new resetKey) so the
   *  subtree re-mounts automatically — the config edit that fixed the crash
   *  takes effect without manual intervention. */
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.prevResetKey) {
      return { error: null, prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error('[WikiBento] widget crashed:', error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const { label = 'This widget' } = this.props;
      return (
        <div className="widget-frame widget-crash">
          <div className="widget-header">
            <span className="widget-title">💥 {label} crashed</span>
          </div>
          <div className="widget-body">
            <div className="widget-error">
              <div className="widget-crash-message">{this.state.error.message}</div>
              <button className="widget-btn" onClick={this.handleRetry}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
