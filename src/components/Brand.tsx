export function BrandMark({ size = 26 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}brand/nexo-mark-128.png`} width={size} height={Math.round(size * 0.97)} alt="" draggable={false} style={{ display: 'block' }} />;
}

export function Wordmark() {
  return (
    <span className="wordmark" aria-label="Nexo UGC Studio">
      <span className="wm-nexo">NEXO</span>
      <span className="wm-ugc">UGC STUDIO</span>
    </span>
  );
}
