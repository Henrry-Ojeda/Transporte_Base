import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  actions,
}) => (
  <div className="mb-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white shadow-sm flex flex-wrap items-center justify-between gap-4">
    <div className="flex items-center gap-3.5 min-w-0">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-emerald-400 shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="m-0 text-lg sm:text-xl font-black tracking-tight text-white truncate">
            {title}
          </h1>
          {badge && (
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="m-0 mt-0.5 text-xs sm:text-sm text-slate-300 truncate">{subtitle}</p>
        )}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
  </div>
);
