'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createPost } from '@/app/compare/actions';

const EMPTY = {
  link: '',
  title: '',
  datePosted: '',
  sheetTab: '',
};

// A soft, rounded input in the Apple style: generous padding, subtle border,
// a calm focus ring — consistent everywhere in the form.
const inputClass =
  'w-full rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-3 text-[15px] text-white placeholder:text-[#6b6b6b] outline-none transition focus:border-[#ebffa8] focus:ring-2 focus:ring-[#ebffa8]/25';
const labelClass = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a9a9a]';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export default function AddPostModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Portal target is only available on the client, after mount.
  useEffect(() => setMounted(true), []);

  // Lock body scroll + close on Escape while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && !saving && close();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setFile(null);
    setError('');
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Read the uploaded spreadsheet as base64 (server parses it with xlsx).
  function fileToBase64(f) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError('Give the post a title.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const excelBase64 = file ? await fileToBase64(file) : undefined;
      const { href } = await createPost({
        title: form.title.trim(),
        link: form.link,
        datePosted: form.datePosted,
        sheetTab: form.sheetTab,
        excelBase64,
      });
      // Full-page load to the new post's page (organized under /{year}/{month}/…).
      // A hard reload re-runs the sidebar's registry fetch, so the new post shows
      // up in the nav tree — a client-side push would leave the sidebar stale.
      window.location.assign(href);
    } catch (e) {
      setError('Could not save the post. Please try again.');
      setSaving(false);
    }
  }

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#151515] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:border-[#ebffa8] hover:text-[#ebffa8]"
      >
        <span className="text-[17px] leading-none">+</span> Add Post
      </button>

      {!open || !mounted
        ? null
        : createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => e.target === e.currentTarget && !saving && close()}
        >
          <div className="my-8 w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#232323] bg-[#0e0e0e] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            {/* Header */}
            <div className="flex items-center justify-between px-7 pb-5 pt-6">
              <h2 className="font-serif text-[26px] tracking-[-0.01em] text-white">Add Post</h2>
              <button
                type="button"
                onClick={() => !saving && close()}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] text-[#9a9a9a] transition hover:bg-[#1c1c1c] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[calc(100vh-180px)] overflow-y-auto px-7 pb-7">
              <div className="flex flex-col gap-5">
                <Field label="Instagram Link">
                  <input
                    className={inputClass}
                    type="url"
                    placeholder="https://instagram.com/p/…"
                    value={form.link}
                    onChange={set('link')}
                  />
                </Field>

                <Field label="Title">
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="e.g. Meet the 2026 Interns"
                    value={form.title}
                    onChange={set('title')}
                    autoFocus
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Date Posted">
                    <input
                      className={`${inputClass} [color-scheme:dark]`}
                      type="date"
                      value={form.datePosted}
                      onChange={set('datePosted')}
                    />
                  </Field>
                  <Field label="Sheet Tab Name (optional)">
                    <input
                      className={inputClass}
                      type="text"
                      placeholder="Defaults to the post name"
                      value={form.sheetTab}
                      onChange={set('sheetTab')}
                    />
                  </Field>
                </div>

                <Field label="Upload Data (Excel / CSV)">
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-[14px] transition ${
                      file ? 'border-[#ebffa8] text-white' : 'border-[#2a2a2a] text-[#8d8d8d] hover:border-[#3a3a3a]'
                    }`}
                  >
                    <span className="truncate">
                      {file ? file.name : 'Choose the Instagram interval export…'}
                    </span>
                    <span className="flex-none rounded-lg bg-[#1c1c1c] px-3 py-1 text-[12px] font-semibold text-[#e8e8e8]">
                      Browse
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </Field>

                <p className="-mt-2 text-[12.5px] leading-snug text-[#7d7d7d]">
                  Saving creates a Google Sheet tab for this post — the Instagram link goes in the Link
                  column, and any uploaded data points are written into the tab (columns: Interval
                  Start/End, Interval Length, Views in Interval, Cumulative Views).
                </p>

                {error && <p className="text-[13px] text-[#ff6549]">{error}</p>}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[#1f1f1f] px-7 py-5">
              <button
                type="button"
                onClick={() => !saving && close()}
                className="rounded-xl border border-[#2a2a2a] bg-transparent px-6 py-2.5 text-[14px] font-semibold uppercase tracking-[0.08em] text-[#e8e8e8] transition hover:border-[#3a3a3a] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-[#ebffa8] px-7 py-2.5 text-[14px] font-bold uppercase tracking-[0.08em] text-[#0d0d0d] transition hover:brightness-95 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Post'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
