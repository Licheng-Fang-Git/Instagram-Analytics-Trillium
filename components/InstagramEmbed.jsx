'use client';

import { useEffect, useState } from 'react';

// Embeds an Instagram post/reel via a direct iframe to Instagram's /embed
// endpoint, instead of loading their embed.js script. embed.js attaches a
// deprecated `unload` listener to our document, which browsers now flag as a
// Permissions-Policy violation; a plain iframe keeps that script out of our
// page entirely. Instagram's embed frame still posts its measured height to
// the parent, so we listen for that to auto-size (with a sensible fallback).
const FALLBACK_HEIGHT = 800;

export default function InstagramEmbed({ url }) {
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const [width, setWidth] = useState(500);

  const clean = url?.trim().split('?')[0];
  const base = clean ? (clean.endsWith('/') ? clean : `${clean}/`) : null;
  // "captioned" matches the previous embed (it showed the caption); the frame
  // reports its own height via postMessage, which the listener below applies.
  const embedSrc = base ? `${base}embed/captioned` : null;

  useEffect(() => {
    function onMessage(event) {
      if (typeof event.origin !== 'string' || !event.origin.includes('instagram.com')) return;
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const measured = data?.details?.height ?? data?.height;
      console.log(measured);
      if (typeof measured === 'number' && measured > 0) setHeight(measured);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!embedSrc) return null;

  return (
    <iframe
      src={embedSrc}
      title="Instagram post"
      className="mx-auto w-full max-w-[300px] rounded-md border border-gray-200 bg-white"
      style={{ height, maxWidth: width }}
      frameBorder={0}
      scrolling="no"
      loading="lazy"
    />
  );
}
