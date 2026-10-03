import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <div>
        <span className="empty-icon">
          <Icon size={26} aria-hidden />
        </span>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
        {action}
      </div>
    </section>
  );
}
