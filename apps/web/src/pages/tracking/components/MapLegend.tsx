interface MapLegendProps {
  isSimulated: boolean;
}

export function MapLegend({ isSimulated }: MapLegendProps) {
  return (
    <div className="tr-map-footer">
      <div className="tr-legend">
        <span className="tr-legend-item">
          <span className="tr-pin tr-pin-you" aria-hidden="true" />
          You
        </span>
        <span className="tr-legend-item">
          <span className="tr-pin tr-pin-provider" aria-hidden="true" />
          Provider
        </span>
      </div>
      {isSimulated && (
        <p className="tr-demo-note">
          Demo · scripted path until Socket.io connects
        </p>
      )}
    </div>
  );
}
