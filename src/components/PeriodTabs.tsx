'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Kunlik', href: '/dashboard' },
  { label: 'Haftalik', href: '/dashboard/weekly' },
  { label: 'Oylik', href: '/dashboard/monthly' },
] as const;

export default function PeriodTabs() {
  const path = usePathname();

  return (
    <div className="flex gap-1 bg-gray-900 p-1 rounded-xl w-fit">
      {TABS.map(({ label, href }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
