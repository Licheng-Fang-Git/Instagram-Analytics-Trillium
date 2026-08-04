'use client';

import { useEffect, useRef, useState } from 'react';

// The post creative: a bracketed portrait frame that shows the fetched image,
// or a "CREATIVE / {title}" placeholder if there's none (or it can't load).
export default function PostCreative({ src, title }) {
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

  const showImage = src && !failed;

  return (
    <div className="relative aspect-[4/4] w-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
      {/* Corner brackets */}
      <span className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 border-r border-t border-[#6b6b6b]" />
      <span className="pointer-events-none absolute bottom-2.5 left-2.5 h-4 w-4 border-b border-l border-[#6b6b6b]" />

      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Post creative"
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => {
            loadedRef.current = true;
          }}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-[#787878]">
            Creative
          </span>
          <span className="font-serif text-[28px] leading-tight text-[#6b7280]">{title}</span>
        </div>
      )}
    </div>
  );
}
