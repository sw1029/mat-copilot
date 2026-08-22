import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  label?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = '16px', label, className }: SkeletonProps) {
  return (
    <span
      className={`${styles.skeleton} ${className ?? ''}`}
      style={{ width, height }}
      role={label ? 'status' : undefined}
      aria-label={label}
    />
  );
}
