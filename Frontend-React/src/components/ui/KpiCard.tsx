import React from 'react';

type KpiTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: KpiTone;
}

const TONE_MAP: Record<KpiTone, { border: string; iconBg: string; valueText: string }> = {
  blue: {
    border: 'border-blue-200/80 bg-gradient-to-br from-white to-blue-50/50',
    iconBg: 'bg-blue-100 text-blue-600',
    valueText: 'text-slate-900',
  },
  emerald: {
    border: 'border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/50',
    iconBg: 'bg-emerald-100 text-emerald-600',
    valueText: 'text-emerald-700',
  },
  amber: {
    border: 'border-amber-200/80 bg-gradient-to-br from-white to-amber-50/50',
    iconBg: 'bg-amber-100 text-amber-600',
    valueText: 'text-amber-700',
  },
  rose: {
    border: 'border-rose-200/80 bg-gradient-to-br from-white to-rose-50/50',
    iconBg: 'bg-rose-100 text-rose-600',
    valueText: 'text-rose-600',
  },
  slate: {
    border: 'border-slate-200 bg-white',
    iconBg: 'bg-slate-100 text-slate-600',
    valueText: 'text-slate-900',
  },
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  foot,
  icon,
  tone = 'slate',
}) => {
  const s = TONE_MAP[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-xs flex items-start gap-3.5 ${s.border}`}>
      {icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.iconBg}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`text-xl font-black mt-0.5 tracking-tight ${s.valueText}`}>{value}</div>
        {foot && <div className="text-xs text-slate-500 mt-0.5 font-medium">{foot}</div>}
      </div>
    </div>
  );
};
