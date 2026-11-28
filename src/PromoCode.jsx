import { useState } from 'react';

/** 加值碼: a code from Aprico that opens free months of membership. */
export default function PromoCode({ api, onDone }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  async function redeem(e) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await api({ action: 'sub_redeem', code: code.trim() });
      setNote({ ok: true, text: `開通成功！會員到 ${r.paidUntil}。` });
      setCode('');
      await onDone?.();
    } catch (err) {
      setNote({ ok: false, text: err?.message || '加值碼暫時無法使用，請稍後再試。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="promo" onSubmit={redeem}>
      <label htmlFor="oaw-promo">加值碼</label>
      <div className="promo-row">
        <input
          id="oaw-promo"
          value={code}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="off"
          placeholder="輸入加值碼"
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy || !code.trim()}>
          {busy ? '處理中…' : '使用'}
        </button>
      </div>
      {note && <p className={note.ok ? 'promo-ok' : 'promo-bad'}>{note.text}</p>}
    </form>
  );
}
