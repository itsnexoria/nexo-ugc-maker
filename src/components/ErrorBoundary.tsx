import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrandMark } from './Brand';
import { copyDiagnostics, currentProjectBackup } from '../utils/diagnostics';
import { downloadBlob, safeFilename } from '../utils/download';

interface State {
  error: Error | null;
  copied: boolean;
}

/** Last-resort screen so a rendering bug never leaves a blank page or loses the user's work. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Nexo UGC Studio crashed', error, info.componentStack);
  }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const backup = currentProjectBackup();
    return (
      <div className="small-screen" role="alert">
        <BrandMark size={56} />
        <h1>Something went wrong</h1>
        <p className="dim">The editor hit an unexpected error. Your project was autosaved if autosave was on. You can also download a backup of what is open right now.</p>
        <pre className="crash-msg">{error.message}</pre>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload the editor
          </button>
          {backup && (
            <button className="btn" onClick={() => downloadBlob(new Blob([backup.json], { type: 'application/json' }), `${safeFilename(backup.name)}.nexougc.json`)}>
              Download project backup
            </button>
          )}
          <button
            className="btn"
            onClick={async () => {
              await copyDiagnostics(`${error.message}\n${error.stack ?? ''}`);
              this.setState({ copied: true });
            }}
          >
            {copied ? 'Copied. Paste it in your bug report' : 'Copy diagnostics'}
          </button>
        </div>
        <p className="hint">Nothing is sent automatically. Diagnostics contain browser info and recent log lines, not your artwork.</p>
      </div>
    );
  }
}
