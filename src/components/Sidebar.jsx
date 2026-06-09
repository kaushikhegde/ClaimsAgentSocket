import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  FileText,
  BarChart3,
  BookOpen,
  Clock,
  Users,
} from 'lucide-react';

const navSections = [
  {
    label: 'Main',
    items: [
      { to: '/', icon: LayoutGrid, label: 'Dashboard', end: true },
      { to: '/scenarios', icon: FileText, label: 'Scenarios', badge: '2' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/performance', icon: BarChart3, label: 'Analytics' },
      { to: '/coaching', icon: BookOpen, label: 'Coaching' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/sessions', icon: Clock, label: 'Session History' },
      { to: '/leaderboard', icon: Users, label: 'Leaderboard' },
    ],
  },
];

function SidebarLink({ to, icon: Icon, label, badge, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-all duration-200 ${
          isActive
            ? 'bg-[#eef0f6] border border-[#464e7e]/20 text-[#464e7e] font-semibold'
            : 'border border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
        }`
      }
    >
      <Icon size={16} strokeWidth={1.8} />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="text-[11px] bg-[#eef0f6] text-[#464e7e] px-1.5 py-0.5 rounded-md font-medium">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[260px] bg-white border-r border-gray-200 flex flex-col z-10">
      {/* Logo */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#464e7e] flex items-center justify-center">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <span className="text-gray-900 font-semibold text-[15px] tracking-tight">
            Scyne Training Assistance
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-6 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="text-[10.5px] uppercase tracking-[0.12em] text-gray-400 font-medium px-3 mb-2">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.to + item.label} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="px-4 pb-5 pt-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200">
          <div className="w-8 h-8 rounded-full bg-[#464e7e] flex items-center justify-center text-white text-xs font-semibold shrink-0">
            SK
          </div>
          <div className="min-w-0">
            <p className="text-[13px] text-gray-900 font-medium truncate">
              Sarah Kim
            </p>
            <p className="text-[11px] text-gray-400 truncate">
              Claims Adjuster
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
