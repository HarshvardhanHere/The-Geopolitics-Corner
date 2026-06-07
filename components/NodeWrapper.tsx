'use client';

import dynamic from 'next/dynamic';

const NodeViewWithNoSSR = dynamic(() => import('./NodeView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full bg-[#070913]">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-orange-500"></div>
    </div>
  ),
});

interface NodeWrapperProps {
  activeNodes: any[];
  activeEvent: any | null;
  connections: any[];
  onNodeClick: (node: any) => void;
}

export default function NodeWrapper(props: NodeWrapperProps) {
  return <NodeViewWithNoSSR {...props} />;
}
