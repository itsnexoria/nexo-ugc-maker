import { BrandMark } from './Brand';

export function ProjectThumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={`proj-thumb ${className ?? ''}`} style={src ? { backgroundImage: `url(${src})` } : undefined} aria-hidden="true">
      {!src && <BrandMark size={34} />}
    </div>
  );
}
