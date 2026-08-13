'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateSheets } from '@/app/compare/actions';

export default function UpdateDataButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { updated, skipped } | { error }

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && !busy && close();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  function close() {
    setOpen(false);
    setFile(null);
    setResult(null);
  }

  function readText(f) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsText(f);
    });
  }

  async function handleUpdate() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const text = await readText(file);
      const res = await updateSheets(text);
      setResult(res);
    } catch {
      setResult({ error: 'Could not read the file.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#151515] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:border-[#ebffa8] hover:text-[#ebffa8]"
      >
        <span className="text-[15px] leading-none">↻</span> Update Data
      </button>

      {!open || !mounted
        ? null
        : createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center"
              onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}
            >
              <div className="my-8 w-full max-w-[520px] overflow-hidden rounded-2xl border border-[#232323] bg-[#0e0e0e] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between px-7 pb-5 pt-6">
                  <h2 className="font-serif text-[26px] tracking-[-0.01em] text-white">Update Sheet Data</h2>
                  <button
                    type="button"
                    onClick={() => !busy && close()}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] text-[#9a9a9a] transition hover:bg-[#1c1c1c] hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="px-7 pb-7">
                  <p className="mb-4 text-[13px] leading-snug text-[#9a9a9a]">
                    Attach the scraper&apos;s JSON (e.g. <span className="font-mono text-[#c9c9c9]">scraped_views.json</span>).
                    Each tab&apos;s data rows are replaced; the header and ad columns are left alone, and tabs
                    that don&apos;t exist in the sheet are skipped.
                  </p>

                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-[14px] transition ${
                      file ? 'border-[#ebffa8] text-white' : 'border-[#2a2a2a] text-[#8d8d8d] hover:border-[#3a3a3a]'
                    }`}
                  >
                    <span className="truncate">{file ? file.name : 'Choose a .json file…'}</span>
                    <span className="flex-none rounded-lg bg-[#1c1c1c] px-3 py-1 text-[12px] font-semibold text-[#e8e8e8]">
                      Browse
                    </span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] || null);
                        setResult(null);
                      }}
                    />
                  </label>

                  {result?.error && <p className="mt-4 text-[13px] text-[#ff6549]">{result.error}</p>}

                  {result && !result.error && (
                    <div className="mt-4 rounded-xl border border-[#1f1f1f] bg-[#121212] px-4 py-3 text-[13px]">
                      <div className="font-semibold text-[#ebffa8]">
                        Updated {result.updated.length} tab{result.updated.length === 1 ? '' : 's'}.
                      </div>
                      {result.updated.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-0.5 text-[#cfcfcf]">
                          {result.updated.map((u) => (
                            <li key={u.tab} className="font-mono text-[12px]">
                              {u.tab} — {u.rows} rows
                            </li>
                          ))}
                        </ul>
                      )}
                      {result.skipped.length > 0 && (
                        <div className="mt-2 text-[#8d8d8d]">
                          Skipped (not in sheet): <span className="font-mono">{result.skipped.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[#1f1f1f] px-7 py-5">
                  <button
                    type="button"
                    onClick={() => !busy && close()}
                    className="rounded-xl border border-[#2a2a2a] bg-transparent px-6 py-2.5 text-[14px] font-semibold uppercase tracking-[0.08em] text-[#e8e8e8] transition hover:border-[#3a3a3a] hover:text-white"
                  >
                    {result && !result.error ? 'Done' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={busy || !file}
                    className="rounded-xl bg-[#ebffa8] px-7 py-2.5 text-[14px] font-bold uppercase tracking-[0.08em] text-[#0d0d0d] transition hover:brightness-95 disabled:opacity-50"
                  >
                    {busy ? 'Updating…' : 'Update'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
    </>
  );
}
