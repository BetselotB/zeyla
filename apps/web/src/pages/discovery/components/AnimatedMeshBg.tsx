/** Fixed full-viewport animated mesh — mount once inside each page root */
export function AnimatedMeshBg() {
  return (
    <div className="z-bg-mesh" aria-hidden="true">
      <div className="z-bg-blob z-bg-blob-a" />
      <div className="z-bg-blob z-bg-blob-b" />
      <div className="z-bg-blob z-bg-blob-c" />
    </div>
  );
}
