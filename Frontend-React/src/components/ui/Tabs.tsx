import React from 'react';

export interface TabOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface TabsProps<T extends string = string> {
  items: TabOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
}

export function Tabs<T extends string = string>({ items, activeId, onChange }: TabsProps<T>) {
  return (
    <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto">
      {items.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer bg-transparent border-x-0 border-t-0 ${
              active
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                  active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
