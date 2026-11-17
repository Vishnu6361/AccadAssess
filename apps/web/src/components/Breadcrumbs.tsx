import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav className="flex items-center space-x-2 text-xs text-academic-muted mb-4" aria-label="Breadcrumb">
      <div className="flex items-center text-academic-muted hover:text-academic-deepGreen">
        <Home className="w-3.5 h-3.5 mr-1" />
        <span>Home</span>
      </div>
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="w-3.5 h-3.5 text-academic-border" />
          {item.current ? (
            <span className="font-semibold text-academic-deepGreen" aria-current="page">
              {item.label}
            </span>
          ) : (
            <span className="hover:text-academic-deepGreen cursor-pointer">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
