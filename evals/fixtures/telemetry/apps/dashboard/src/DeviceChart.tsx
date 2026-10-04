import { useEffect, useState } from 'react';

export function DeviceChart({ deviceId }: { deviceId: string }) {
  const [series, setSeries] = useState<{ at: string; meanCelsius: number }[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_QUERY_API}/v1/devices/${deviceId}/series`).then((r) => r.json()).then(setSeries);
  }, [deviceId]);
  return <ul>{series.map((point) => <li key={point.at}>{point.at}: {point.meanCelsius}</li>)}</ul>;
}
