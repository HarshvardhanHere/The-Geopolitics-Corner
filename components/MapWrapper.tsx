'use client';

import dynamic from 'next/dynamic';

const MapViewWithNoSSR = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full bg-[#070913]">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-orange-500"></div>
    </div>
  ),
});

interface MapWrapperProps {
  activeNodes: any[];
  activeEvent: any | null;
  onNodeClick: (node: any) => void;
}

export default function MapWrapper(props: MapWrapperProps) {
  return <MapViewWithNoSSR {...props} />;
}
