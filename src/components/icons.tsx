import type { SVGProps } from "react";

/**
 * Lucide-style line icons: a 24×24 grid, `currentColor` stroke, and rounded
 * caps/joins. They inherit color from the surrounding text (via `currentColor`),
 * so style them by setting `color` on a parent. Pass `size` to scale (defaults
 * to 24); any other SVG prop (className, aria-*, strokeWidth…) passes through.
 *
 * No "use client" here — these are pure presentational components, usable from
 * both server and client components.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function Icon({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={2}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      {...props}>
      {children}
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d='m6 9 6 6 6-6' />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx='11' cy='11' r='8' />
      <path d='m21 21-4.3-4.3' />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' />
      <circle cx='12' cy='7' r='4' />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx='12' cy='12' r='4' />
      <path d='M12 2v2' />
      <path d='M12 20v2' />
      <path d='m4.93 4.93 1.41 1.41' />
      <path d='m17.66 17.66 1.41 1.41' />
      <path d='M2 12h2' />
      <path d='M20 12h2' />
      <path d='m6.34 17.66-1.41 1.41' />
      <path d='m19.07 4.93-1.41 1.41' />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
    </Icon>
  );
}

/** Lucide's clock — the theme toggle's "follow the time of day" mode. */
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx='12' cy='12' r='10' />
      <path d='M12 6v6l4 2' />
    </Icon>
  );
}

/** Hamburger — opens the mobile nav drawer. */
export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d='M4 6h16M4 12h16M4 18h16' />
    </Icon>
  );
}

/** X — closes the mobile nav drawer. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d='M18 6 6 18M6 6l12 12' />
    </Icon>
  );
}

/** Lucide's smartphone — marks the "digital content" group in the drawer. */
export function SmartphoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width='14' height='20' x='5' y='2' rx='2' ry='2' />
      <path d='M12 18h.01' />
    </Icon>
  );
}
