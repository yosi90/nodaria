import type { LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'secondary' | 'primary' | 'ghost' | 'danger' | 'solid-danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: LucideIcon;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  block,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const classes = ['btn', variant !== 'secondary' && variant, size === 'sm' && 'sm', block && 'block', className];
  return (
    <button type={type} className={classes.filter(Boolean).join(' ')} {...props}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Texto accesible; también se muestra como tooltip salvo que `tooltip` sea `false`. */
  label: string;
  size?: 'md' | 'sm';
  variant?: 'ghost' | 'outlined' | 'danger';
  active?: boolean;
  tooltip?: boolean;
  tooltipSide?: 'bottom' | 'left';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon: Icon,
    label,
    size = 'md',
    variant = 'ghost',
    active,
    tooltip = true,
    tooltipSide = 'bottom',
    className = '',
    type = 'button',
    ...props
  },
  ref,
) {
  const classes = ['icon-btn', size === 'sm' && 'sm', variant !== 'ghost' && variant, active && 'active', className];
  return (
    <button
      ref={ref}
      type={type}
      className={classes.filter(Boolean).join(' ')}
      aria-label={label}
      data-tooltip={tooltip ? label : undefined}
      data-tooltip-side={tooltip && tooltipSide !== 'bottom' ? tooltipSide : undefined}
      {...props}
    >
      <Icon size={size === 'sm' ? 15 : 17} aria-hidden />
    </button>
  );
});
