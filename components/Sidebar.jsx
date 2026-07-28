'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const JUNE_POSTS = [
  { href: '/meet_2026_interns', label: 'Meet the 2026 Interns', slug: 'interns2026' },
  { href: '/mic_on', label: 'Mic On', slug: 'micon2026' },
];

const JULY_POSTS = [
  { href: '/nasdaq_times_square', label: 'Nasdaq Times Square', slug: 'nasdaq2026' },
  { href: '/meet_the_mentors', label: 'Meet the Mentors', slug: 'mentors2026' },
  { href: '/reel_intern_day', label: 'Intern Day Reel', slug: 'dit2026' },
  { href: '/misconceptions_reel', label: 'Misconceptions Reel', slug: 'misconceptions2026' },
  { href: '/college_hot_takes', label: 'College Hot Takes', slug: 'cht2026' },
];

// A single top-level nav item (Overview / Compare Posts).
function NavItem({ href, label, active }) {
  return (
    <Link
      href={href}
      className={`block w-full border-l-2 px-3.5 py-2.5 text-left font-sans text-sm transition-all duration-150 ${
        active
          ? 'border-[#ebffa8] bg-[#161616] text-white'
          : 'border-transparent text-[#e8e8e8] hover:bg-[#1a1a1a] hover:text-[#ebffa8]'
      }`}
    >
      {label}
    </Link>
  );
}

// A post row: title on top, mono slug beneath.
function PostLink({ href, label, slug, active }) {
  return (
    <Link
      href={href}
      className={`flex w-full flex-col border-l-2 px-3.5 py-2.5 text-left transition-all duration-150 ${
        active
          ? 'border-[#ebffa8] bg-[#161616] text-white'
          : 'border-transparent text-[#e8e8e8] hover:bg-[#1a1a1a] hover:text-[#ebffa8]'
      }`}
    >
      <span className="text-sm">{label}</span>
      <span className="mt-0.5 font-mono text-[11px] tracking-[0.02em] text-[#67696f]">{slug}</span>
    </Link>
  );
}

function CollapsibleSection({ title, isOpen, onToggle, posts, pathname }) {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between px-2 pb-2 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#ebffa8]"
      >
        <span>{title}</span>
        <span className={`text-[#67696f] transition-transform ${isOpen ? '' : '-rotate-90'}`}>▾</span>
      </button>
      {isOpen && (
        <nav className="flex flex-col gap-0.5">
          {posts.map((post) => (
            <PostLink key={post.href} {...post} active={pathname === post.href} />
          ))}
        </nav>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState({ june: true, july: true });

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const overviewActive = pathname === '/dashboard' || pathname === '/';

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] flex-none flex-col gap-6 overflow-y-auto border-r border-[#1f1f1f] bg-black py-5 pb-8 md:flex">
      {/* Logo box */}
      <div className="px-5">
        <a
          href="https://www.trlm.com/"
          className="flex items-center justify-center border border-[#232323] bg-[#0d0d0d] px-5 py-[18px]"
        >
          <img
            src="/trillium-wordmark-white.png"
            alt="Trillium"
            className="block w-full max-w-[168px]"
          />
        </a>
      </div>

      {/* Overview + Best Time to Post + Compare */}
      <nav className="flex flex-col gap-0.5 px-3">
        <NavItem href="/dashboard" label="Overview" active={overviewActive} />
        <NavItem href="/best_time_to_post" label="Best Time to Post" active={pathname === '/best_time_to_post'} />
        <NavItem href="/compare" label="Compare Posts" active={pathname === '/compare'} />
      </nav>

      {/* Post groups */}
      <div className="flex flex-col gap-[26px] px-3">
        <CollapsibleSection
          title="June Posts"
          isOpen={openSections.june}
          onToggle={() => toggleSection('june')}
          posts={JUNE_POSTS}
          pathname={pathname}
        />
        <CollapsibleSection
          title="July Posts"
          isOpen={openSections.july}
          onToggle={() => toggleSection('july')}
          posts={JULY_POSTS}
          pathname={pathname}
        />
      </div>
    </aside>
  );
}
