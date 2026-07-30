'use client';

import { useEffect, useRef, useState } from 'react';

// A clean image-only preview of an Instagram post (no caption / embed chrome).
// `src` is the post's og:image CDN URL, resolved server-side; `url` is the post
// permalink the preview links to. Falls back to a tasteful placeholder that
// still links out if the image is missing, errors, or never loads (e.g. a
// network that blocks Instagram's CDN — otherwise the box would sit blank).
export default function InstagramImage({ src, url }) {
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setFailed(false);
    if (!src) return;
    const t = setTimeout(() => {
      if (!loadedRef.current) setFailed(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [src]);

  if (!src || failed) {
    return (
      <a
        href={url || 'https://www.instagram.com/trilliumtrading/'}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-[420px] items-center justify-center border border-dashed border-[#2f2f2f] bg-[#0d0d0d] p-6 text-center transition-colors hover:border-[rgba(235,255,168,0.35)]"
      >
        <span className="max-w-[26ch] text-[13px] text-[#e6e6e6]">
          Preview unavailable — open the post on Instagram.
        </span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group mx-auto block w-fit max-w-full overflow-hidden border border-[#2a2a2a] bg-black"
      title="Open on Instagram"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Instagram post preview"
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => {
          loadedRef.current = true;
        }}
        onError={() => setFailed(true)}
        className="mx-auto block h-auto w-auto max-h-[640px] max-w-full transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </a>
  );
}
