'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AddPostModal from '@/components/AddPostModal';
import { getNavPosts } from '@/app/compare/actions';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/compare', label: 'Compare Posts' },
];

// Month order within a year (newest-first display).
const MONTH_ORDER = [
  'December', 'November', 'October', 'September', 'August', 'July',
  'June', 'May', 'April', 'March', 'February', 'January',
];

// Turn the flat registry list into a year -> months -> posts tree, newest year
// and month first, so the sidebar mirrors the app/ folder organization.
function buildTree(posts) {
  const byYear = new Map();
  for (const p of posts) {
    const year = p.year || 'Undated';
    const month = p.month || 'Other';
    if (!byYear.has(year)) byYear.set(year, new Map());
    const months = byYear.get(year);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push({ href: p.href, label: p.title, slug: p.slug });
  }
  const years = [...byYear.keys()].sort((a, b) => (Number(b) || 0) - (Number(a) || 0));
  return years.map((year) => {
    const months = byYear.get(year);
    const orderedMonths = [...months.keys()].sort(
      (a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b)
    );
    return {
      year: String(year),
      months: orderedMonths.map((m) => ({
        key: `${year}-${m}`,
        label: `${m} ${year}`,
        posts: months.get(m),
      })),
    };
  });
}

// Top-level pill button. Active = solid accent fill + black text; hover =
// dark-olive wash + accent text. Colors use `!` because the global `a` rule in
// globals.css (unlayered) otherwise wins over Tailwind's layered utilities.
const navBtn = (active) =>
  `flex w-full items-center gap-3 rounded px-3 py-[11px] text-left text-[14.5px] tracking-[0.01em] transition-all duration-150 ${
    active
      ? 'bg-[#ebffa8] font-semibold text-black!'
      : 'font-medium text-[#f2f2f2]! hover:bg-[#3b402a] hover:text-[#ebffa8]!'
  }`;

function Chevron({ open }) {
  return (
    <span
      className={`block h-[6px] w-[6px] flex-none border-b-[1.5px] border-r-[1.5px] border-current transition-transform duration-150 ${
        open ? 'mt-[2px] rotate-[225deg]' : '-mt-[2px] rotate-45'
      }`}
    />
  );
}

function NavItem({ href, label, active }) {
  return (
    <Link href={href} className={navBtn(active)}>
      <span className="flex-1 text-left">{label}</span>
    </Link>
  );
}

// A post sub-item: title + mono slug, indented under its month.
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
      <span className={`mt-0.5 block font-mono text-[11px] ${active ? 'text-black/55' : 'text-[#a8a8a8]'}`}>
        {slug}
      </span>
    </Link>
  );
}

// A month header (uppercase, muted) + its collapsible list of posts.
function MonthSection({ label, posts, isOpen, onToggle, pathname }) {
  const hasActive = posts.some((p) => p.href === pathname);
  const emphasize = hasActive && !isOpen;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-2 rounded py-2 pl-5 pr-3 text-left transition-all duration-150 hover:bg-[#3b402a]"
      >
        <span
          className={`flex-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] transition-colors group-hover:text-[#ebffa8] ${
            emphasize ? 'text-[#ebffa8]' : 'text-[#8d8d8d]'
          }`}
        >
          {label}
        </span>
        <span
          className={`transition-colors group-hover:text-[#ebffa8] ${emphasize ? 'text-[#ebffa8]' : 'text-[#8d8d8d]'}`}
        >
          <Chevron open={isOpen} />
        </span>
      </button>
      {isOpen && (
        <div className="flex flex-col gap-0.5 pb-1">
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
  const [tree, setTree] = useState([]);
  const [openTree, setOpenTree] = useState({});

  // Load the post tree from the registry; default everything open on first load.
  useEffect(() => {
    getNavPosts()
      .then((posts) => {
        const t = buildTree(posts);
        setTree(t);
        const open = {};
        t.forEach((y) => {
          open[y.year] = true;
          y.months.forEach((m) => (open[m.key] = true));
        });
        setOpenTree(open);
      })
      .catch(() => setTree([]));
  }, []);

  const toggle = (key) => setOpenTree((prev) => ({ ...prev, [key]: !prev[key] }));
  const dashboardActive = pathname === '/dashboard' || pathname === '/';
  const isActive = (href) => (href === '/dashboard' ? dashboardActive : pathname === href);

  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] flex-none flex-col overflow-y-auto border-r border-[#151515] bg-[#0e0e0e] pb-3 md:flex">
      {/* Logo bar */}
      <div className="flex h-[74px] flex-none items-center border-b border-[#151515] px-4">
        <a href="https://www.trlm.com/" className="block">
          <img src="/trillium-wordmark-white.png" alt="Trillium" className="block w-[152px] ml-5" />
        </a>
      </div>

      {/* Account row */}
      <div className="flex items-center gap-3 border-b border-[#151515] px-4 py-3.5">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[#2a2a2a] bg-[#151515]">
          <img src="/trillium-icon-mark.png" alt="Trillium" className="h-[22px] w-[22px] invert" />
        </span>
        <span className="flex flex-col">
          <span className="text-[14px] font-semibold text-white">trilliumtrading</span>
          <span className="text-[13px] text-[#8d8d8d]">Instagram</span>
        </span>
      </div>

      {/* Add Post */}
      <div className="px-3 pt-3">
        <AddPostModal />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 pt-3">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Year → month → post tree (registry-driven) */}
      <div className="flex flex-col gap-0.5 px-2 pt-3">
        {tree.map((y) => (
          <div key={y.year} className="flex flex-col gap-0.5">
            <button type="button" onClick={() => toggle(y.year)} className={`${navBtn(false)} gap-2`}>
              <span className="flex-1 text-left">{y.year}</span>
              <Chevron open={openTree[y.year]} />
            </button>
            {openTree[y.year] && (
              <div className="flex flex-col gap-0.5">
                {y.months.map((m) => (
                  <MonthSection
                    key={m.key}
                    label={m.label}
                    posts={m.posts}
                    isOpen={openTree[m.key]}
                    onToggle={() => toggle(m.key)}
                    pathname={pathname}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
