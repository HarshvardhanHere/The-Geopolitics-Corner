'use client';

interface NodeDetailModalProps {
  node: any;
  allNodes: any[];
  allEvents: any[];
  allMappings: any[];
  allConnections: any[];
  onClose: () => void;
  onNavigateToNode: (nodeId: number) => void;
}

export default function NodeDetailModal({
  node,
  allNodes,
  allEvents,
  allMappings,
  allConnections,
  onClose,
  onNavigateToNode,
}: NodeDetailModalProps) {
  if (!node) return null;

  // 1. Resolve Parent Events
  const parentEventIds = allMappings
    .filter(m => m.node_id === node.node_id)
    .map(m => m.event_id);
  const parentEvents = allEvents.filter(e => parentEventIds.includes(e.event_id));

  // 2. Resolve Connected Nodes
  const connectedNodeIds = new Set<number>();
  allConnections.forEach(conn => {
    if (conn.node_a === node.node_id) {
      connectedNodeIds.add(conn.node_b);
    } else if (conn.node_b === node.node_id) {
      connectedNodeIds.add(conn.node_a);
    }
  });

  const connectedNodes = allNodes.filter(n => connectedNodeIds.has(n.node_id));

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-[#0f1422] border border-slate-800 rounded-lg max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-5">
          <div>
            <span className="text-[10px] text-orange-500 font-mono font-bold tracking-widest uppercase">
              Node Details / / ID: {node.node_id}
            </span>
            <h2 className="text-lg font-bold text-slate-100 mt-1 font-sans leading-snug">
              {node.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-lg cursor-pointer p-1 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-sans mb-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <span className="text-slate-400 font-medium block">Geopolitical Event Date</span>
              <span className="text-slate-200 mt-0.5 block font-mono bg-slate-900/60 border border-slate-850 px-2.5 py-1 rounded inline-block">
                {node.date}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Primary Parent Country</span>
              <span className="text-slate-200 mt-1 block">
                {node.parent_country ? (
                  <span className="bg-orange-950/40 text-orange-400 border border-orange-900/50 px-2 py-0.5 rounded text-[11px] font-bold font-mono">
                    {node.parent_country}
                  </span>
                ) : (
                  <span className="bg-slate-800/80 text-slate-400 border border-slate-700/60 px-2 py-0.5 rounded text-[11px] font-semibold font-mono">
                    Non-State Actor
                  </span>
                )}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block mb-1">Participating Actor(s)</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {node.actors && node.actors.length > 0 ? (
                  node.actors.map((actor: string, i: number) => (
                    <span
                      key={i}
                      className="bg-slate-900 text-slate-300 border border-slate-800 px-2.5 py-0.5 rounded text-[11px] font-mono"
                    >
                      {actor}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 italic">No actors defined.</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div>
              <span className="text-slate-400 font-medium block mb-1.5">Parent Macro Event(s)</span>
              <div className="flex flex-col gap-1.5">
                {parentEvents.length > 0 ? (
                  parentEvents.map(event => (
                    <div
                      key={event.event_id}
                      className="bg-[#172033] border border-slate-800 rounded px-2.5 py-1.5"
                    >
                      <div className="text-[10px] font-mono text-indigo-400 font-bold">
                        {event.event_id}
                      </div>
                      <div className="text-slate-200 font-semibold text-[11px] truncate mt-0.5">
                        {event.title}
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-slate-500 italic">No mapped events.</span>
                )}
              </div>
            </div>

            <div>
              <span className="text-slate-400 font-medium block mb-1">Tags</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {node.tags && node.tags.length > 0 ? (
                  node.tags.map((tag: string, i: number) => (
                    <span
                      key={i}
                      className="bg-indigo-950/40 text-indigo-300 border border-indigo-900/40 px-2 py-0.5 rounded text-[10px] font-semibold"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 italic">No tags.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Remarks Section */}
        <div className="bg-slate-900/40 border border-slate-850 rounded p-4 text-xs mb-6 font-sans">
          <span className="text-slate-400 font-semibold block mb-1">Remarks & Interpretations</span>
          <p className="text-slate-200 leading-relaxed font-mono whitespace-pre-wrap">
            {node.remarks || 'No remarks recorded for this event node.'}
          </p>
        </div>

        {/* Connections Section */}
        <div className="border-t border-slate-850 pt-5">
          <span className="text-slate-400 font-medium block text-xs mb-2">Connected Knowledge Nodes</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
            {connectedNodes.length > 0 ? (
              connectedNodes.map(connNode => (
                <button
                  key={connNode.node_id}
                  onClick={() => onNavigateToNode(connNode.node_id)}
                  className="w-full text-left bg-slate-900 hover:bg-indigo-950/30 border border-slate-850 hover:border-indigo-900/50 rounded p-2.5 transition-all cursor-pointer group"
                >
                  <div className="text-[10px] font-mono text-orange-500 group-hover:text-orange-400 font-bold">
                    Node {connNode.node_id} &rarr;
                  </div>
                  <div className="text-slate-200 font-semibold text-[11px] truncate mt-0.5">
                    {connNode.title}
                  </div>
                </button>
              ))
            ) : (
              <span className="text-slate-500 italic text-xs py-2">No connected nodes defined.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
