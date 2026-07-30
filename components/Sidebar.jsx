'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/best_time_to_post', label: 'Best Time to Post' },
  { href: '/compare', label: 'Compare Posts' },
];

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

// Top-level pill button. Active = solid accent fill + black text; hover =
// dark-olive wash + accent text. Colors use `!` because the global `a` rule in
// globals.css (unlayered) otherwise wins over Tailwind's layered utilities.
const navBtn = (active) =>
  `flex w-full items-center gap-3 rounded px-3 py-[11px] text-left text-[14.5px] tracking-[0.01em] transition-all duration-150 ${
    active
      ? 'bg-[#ebffa8] font-semibold text-black!'
      : 'font-medium text-[#f2f2f2]! hover:bg-[#3b402a] hover:text-[#ebffa8]!'
  }`;

function NavItem({ href, label, active }) {
  return (
    <Link href={href} className={navBtn(active)}>
      <span className="flex-1 text-left">{label}</span>
    </Link>
  );
}

// A post sub-item: title + mono slug, indented under its group.
function PostLink({ href, label, slug, active }) {
  return (
    <Link
      href={href}
      className={`block w-full rounded py-[9px] pl-7 pr-3 text-left transition-all duration-150 ${
        active
          ? 'bg-[#ebffa8] font-semibold text-black!'
          : 'font-normal text-[#e8e8e8]! hover:bg-[#3b402a] hover:text-[#ebffa8]!'
      }`}
    >
      <span className="text-[13.5px]">{label}</span>
      <span
        className={`mt-0.5 block font-mono text-[11px] ${active ? 'text-black/55' : 'text-[#a8a8a8]'}`}
      >
        {slug}
      </span>
    </Link>
  );
}

function GroupSection({ label, posts, isOpen, onToggle, pathname }) {
  const hasActive = posts.some((p) => p.href === pathname);
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={`${navBtn(false)} ${hasActive && !isOpen ? 'text-[#ebffa8]!' : ''}`}
      >
        <span className="flex-1 text-left">{label}</span>
        <span
          className={`block h-[7px] w-[7px] flex-none border-b-[1.5px] border-r-[1.5px] border-current transition-transform duration-150 ${
            isOpen ? 'mt-[3px] rotate-[225deg]' : '-mt-[3px] rotate-45'
          }`}
        />
      </button>
      {isOpen && (
        <div className="flex flex-col gap-0.5 pb-1.5 pt-0.5">
          {posts.map((post) => (
            <PostLink key={post.href} {...post} active={pathname === post.href} />
          ))}
        </div>
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

  const dashboardActive = pathname === '/dashboard' || pathname === '/';
  const isActive = (href) => (href === '/dashboard' ? dashboardActive : pathname === href);

  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] flex-none flex-col overflow-y-auto border-r border-[#151515] bg-[#0e0e0e] pb-3 md:flex">
      {/* Logo bar */}
      <div className="flex h-[74px] flex-none items-center border-b border-[#151515] px-4">
        <a href="https://www.trlm.com/" className="block">
          <img src="/trillium-wordmark-white.png" alt="Trillium" className="block w-[152px]" />
        </a>
      </div>

      {/* Nav + groups */}
      <nav className="flex flex-col gap-0.5 px-2 pt-3">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} active={isActive(item.href)} />
        ))}

        <GroupSection
          label="June Posts"
          posts={JUNE_POSTS}
          isOpen={openSections.june}
          onToggle={() => toggleSection('june')}
          pathname={pathname}
        />
        <GroupSection
          label="July Posts"
          posts={JULY_POSTS}
          isOpen={openSections.july}
          onToggle={() => toggleSection('july')}
          pathname={pathname}
        />
      </nav>
    </aside>
  );
}
