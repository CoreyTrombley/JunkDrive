import { useState } from 'preact/hooks';
import { exportSave, importSave } from '../engine/actions';

export function SaveScreen() {
  const [saveCode, setSaveCode] = useState('');
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');

  return (
    <div class="card">
      <div class="card-header"><span class="ch-icon">💾</span>SAVE CODE</div>
      <button class="btn btn-ghost btn-block" onClick={() => setSaveCode(exportSave())}>EXPORT SAVE CODE</button>
      {saveCode && <textarea readOnly value={saveCode} style={{ width: '100%', marginTop: 8, fontSize: 10 }} rows={4} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />}
      <textarea placeholder="Paste a save code to import…" value={importText} style={{ width: '100%', marginTop: 10, fontSize: 10 }} rows={3}
        onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)} />
      <button class="btn btn-danger btn-block" style={{ marginTop: 6 }} onClick={() => {
        const r = importSave(importText);
        setImportMsg(r.ok ? 'Imported!' : r.reason ?? 'Failed.');
      }}>IMPORT SAVE CODE</button>
      {importMsg && <div class="empty-hint">{importMsg}</div>}
    </div>
  );
}
