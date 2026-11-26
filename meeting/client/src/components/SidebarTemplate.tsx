import React from 'react';
import { X, type LucideIcon } from 'lucide-react';

interface SidebarTemplateProps {
  title: string;
  icon: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

const SidebarTemplate: React.FC<SidebarTemplateProps> = ({ 
  title, 
  icon: Icon, 
  onClose, 
  children, 
  footer,
  width = "w-80" 
}) => {
  return (
    <div className={`fixed top-14 bottom-0 right-14 max-w-[calc(100vw-3.5rem)] ${width} bg-raised text-white shadow-modal z-[110] flex flex-col anim-drawer-right border-l border-line`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-line">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        </div>
        <button
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-ctl text-muted hover:bg-line hover:text-white active:scale-95 transition-all"
          title="Đóng (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="p-4 bg-black/20 border-t border-white/5 mt-auto">
          {footer}
        </div>
      )}
    </div>
  );
};

export default SidebarTemplate;
