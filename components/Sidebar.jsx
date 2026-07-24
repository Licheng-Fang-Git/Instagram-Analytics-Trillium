'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import trlm_logo from "@/public/trlm_logo.png"

const JUNE_POSTS = [
  { href: '/meet_2026_interns', label: 'Meet the 2026 Interns', code: 'interns2026' },
  { href: '/mic_on', label: 'Mic On', code: 'micon2026' },
];

const JULY_POSTS = [
  { href: '/nasdaq_times_square', label: 'Nasdaq Times Square', code: 'nasdaq2026' },
  { href: '/meet_the_mentors', label: 'Meet the Mentors', code: 'mentors2026' },
  { href: '/reel_intern_day', label: 'Intern Day Reel', code: 'ditl2026' },
  { href: '/misconceptions_reel', label: 'Misconceptions Reel', code: 'misconceptions2026' },
  { href: '/college_hot_takes', label: 'College Hot Takes', code: 'cht2026' },
];

const LINK_CLASS = 'block px-4 py-2 rounded bg-blue-5 text-[#FFFFFF] font-medium hover:text-[#ebffa8]';

function PostLink({ href, label, code, showCodes }) {
  return (
    <Link href={href} className={LINK_CLASS}>
      {label}
      {showCodes && (
        <div className="block px-2 rounded bg-blue-5 text-blue-700 font-medium">{code}</div>
      )}
    </Link>
  );
}

function CollapsibleSection({ title, isOpen, onToggle, posts, showCodes }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between mt-6 mb-2 px-4 text-xs font-semibold text-[#3E84FF] hover:text-[#1F42B6] uppercase tracking-wide"
      >
        <span>{title}</span>
        <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
      </button>
      {isOpen && (
        <nav className="space-y-2">
          {posts.map((post) => (
            <PostLink key={post.href} {...post} showCodes={showCodes} />
          ))}
        </nav>
      )}
    </div>
  );
}

// This lives in the root layout, so it mounts exactly once and its state
// (which sections are open) survives every client-side navigation — it only
// ever changes when the June/July header itself is clicked.
export default function Sidebar() {
  const pathname = usePathname();
  const showCodes = pathname === '/compare';

  const [openSections, setOpenSections] = useState({ june: true, july: true });

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside className="w-64 bg-[#1C1C1C] border-r border-gray-200 p-6 hidden md:block">
      <div className="font-bold text-xl mb-6 text-blue-600"><a href='https://www.trlm.com/'><img src='/trlm_logo.png'/></a></div>

      <nav className="space-y-2">
        <Link href="/dashboard" className={LINK_CLASS}>
          Overview
        </Link>
      </nav>

      <CollapsibleSection
        title="June Posts"
        isOpen={openSections.june}
        onToggle={() => toggleSection('june')}
        posts={JUNE_POSTS}
        showCodes={showCodes}
      />

      <CollapsibleSection
        title="July Posts"
        isOpen={openSections.july}
        onToggle={() => toggleSection('july')}
        posts={JULY_POSTS}
        showCodes={showCodes}
      />

      <nav className="mt-6 space-y-2">
        <Link href="/compare" className={LINK_CLASS}>
          Compare Posts
        </Link>
      </nav>
    </aside>
  );
}
