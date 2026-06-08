'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface NodeViewProps {
  activeNodes: any[];
  activeEvent: any | null;
  connections: any[];
  onNodeClick: (node: any) => void;
}

// User-approved fixed HSL color palette
export const COUNTRY_COLORS: { [key: string]: string } = {
  'pakistan': 'hsl(150, 70%, 40%)',
  'turkey': 'hsl(330, 75%, 55%)',
  'iran': 'hsl(40, 90%, 48%)',
  'israel': 'hsl(210, 80%, 65%)',
  'usa': 'hsl(220, 75%, 50%)',
  'united states': 'hsl(220, 75%, 50%)',
  'united states of america': 'hsl(220, 75%, 50%)',
  'india': 'hsl(25, 95%, 50%)',
  'china': 'hsl(0, 85%, 45%)',
  'russia': 'hsl(10, 80%, 50%)',
  'uk': 'hsl(260, 60%, 55%)',
  'united kingdom': 'hsl(260, 60%, 55%)',
  'france': 'hsl(200, 70%, 50%)',
  'germany': 'hsl(35, 60%, 40%)',
  'saudi arabia': 'hsl(140, 60%, 35%)',
  'uae': 'hsl(170, 70%, 40%)',
  'united arab emirates': 'hsl(170, 70%, 40%)',
};

export function getCountryColor(country: string | null): string {
  if (!country) return '#ffffff';
  const normalized = country.toLowerCase().trim();
  if (COUNTRY_COLORS[normalized]) return COUNTRY_COLORS[normalized];
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20);
  const lightness = 45 + (Math.abs(hash) % 15);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export default function NodeView({ activeNodes, activeEvent, connections, onNodeClick }: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const prevEventIdRef = useRef<string | null>(null);
  const prevNodesHashRef = useRef<string>('');
  const prevDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const nodesCoordsRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: width || 800, height: height || 600 });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || activeNodes.length === 0) return;

    const currentEventId = activeEvent?.event_id || null;
    const currentNodesHash = activeNodes.map((n) => `${n.node_id}-${n.date}`).join(',');

    const eventChanged = currentEventId !== prevEventIdRef.current;
    const nodesChanged = currentNodesHash !== prevNodesHashRef.current;
    const dimensionsChanged =
      dimensions.width !== prevDimensionsRef.current.width ||
      dimensions.height !== prevDimensionsRef.current.height;

    if (!eventChanged && !nodesChanged && !dimensionsChanged && simulationRef.current) {
      return;
    }

    prevEventIdRef.current = currentEventId;
    prevNodesHashRef.current = currentNodesHash;
    prevDimensionsRef.current = { width: dimensions.width, height: dimensions.height };

    if (eventChanged || nodesChanged) {
      nodesCoordsRef.current.clear();
    }

    const { width, height } = dimensions;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // 1. Defs
    const defs = svg.append('defs');
    defs.append('pattern')
      .attr('id', 'grid-pattern')
      .attr('width', 40).attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', 'M 40 0 L 0 0 0 40')
      .attr('fill', 'none')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.25);

    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-20%').attr('y', '-20%')
      .attr('width', '140%').attr('height', '140%');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'blur');
    glowFilter.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

    const g = svg.append('g').attr('class', 'graph-container');
    g.append('rect')
      .attr('x', -10000).attr('y', -10000)
      .attr('width', 20000).attr('height', 20000)
      .attr('fill', 'url(#grid-pattern)')
      .style('pointer-events', 'all');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => { g.attr('transform', event.transform); });
    svg.call(zoom);

    // 2. Prepare nodes
    const simNodes = activeNodes.map((n) => {
      const existing = nodesCoordsRef.current.get(n.node_id);
      return {
        ...n,
        x: existing ? existing.x : width / 2 + (Math.random() - 0.5) * 150,
        y: existing ? existing.y : height / 2 + (Math.random() - 0.5) * 150,
        fx: existing ? existing.x : undefined,
        fy: existing ? existing.y : undefined,
      };
    });

    const activeNodeIds = new Set(simNodes.map((n) => n.node_id));
    const simLinks = connections
      .filter((conn) => activeNodeIds.has(conn.node_a) && activeNodeIds.has(conn.node_b))
      .map((conn) => ({ id: conn.connection_id, source: conn.node_a, target: conn.node_b }));

    const N = simNodes.length;
    const r = Math.max(8, Math.min(24, 240 / Math.sqrt(N || 1)));

    const clusterForce = (alpha: number) => {
      const centroids = new Map<string, { x: number; y: number; count: number }>();
      simNodes.forEach((node: any) => {
        const key = node.parent_country || 'nonstate';
        if (!centroids.has(key)) centroids.set(key, { x: 0, y: 0, count: 0 });
        const c = centroids.get(key)!;
        c.x += node.x || 0; c.y += node.y || 0; c.count += 1;
      });
      centroids.forEach((c) => { if (c.count > 0) { c.x /= c.count; c.y /= c.count; } });
      simNodes.forEach((node: any) => {
        const key = node.parent_country || 'nonstate';
        const c = centroids.get(key);
        if (c) {
          node.vx = (node.vx || 0) + (c.x - (node.x || 0)) * 0.12 * alpha;
          node.vy = (node.vy || 0) + (c.y - (node.y || 0)) * 0.12 * alpha;
        }
      });
    };

    // 3. Setup simulation
    const chargeStrength = -Math.max(300, 600 * r / 12);
    const collideRadius = r * 2.5;
    const linkDist = Math.max(60, r * 4);
    const simulation = d3.forceSimulation(simNodes as any)
      .force('link', d3.forceLink(simLinks).id((d: any) => d.node_id).distance(linkDist))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('collide', d3.forceCollide().radius(collideRadius).iterations(3))
      .force('x', d3.forceX().x((d: any) => d.parent_country === null ? width * 0.84 : width * 0.42).strength((d: any) => d.parent_country === null ? 0.9 : 0.08))
      .force('y', d3.forceY(height / 2).strength(0.06))
      .force('cluster', clusterForce);

    simulationRef.current = simulation;

    // 4. Run 120 synchronous ticks to stabilize
    const isAlreadyPinned = simNodes.every(n => n.fx !== undefined);
    if (!isAlreadyPinned) {
      simulation.alpha(1);
      for (let i = 0; i < 120; ++i) {
        simulation.tick();
        simNodes.forEach((d: any) => {
          if (d.parent_country === null) {
            d.x = Math.max(width * 0.76, Math.min(width - 50, d.x));
          } else {
            d.x = Math.max(50, Math.min(width * 0.70 - 20, d.x));
          }
          d.y = Math.max(50, Math.min(height - 50, d.y));
        });
      }
      simNodes.forEach((d: any) => {
        d.fx = d.x;
        d.fy = d.y;
        nodesCoordsRef.current.set(d.node_id, { x: d.x, y: d.y });
      });
    }

    // Stop simulation — positions are now stable in simNodes
    simulation.stop();

    // 5. Build SVG elements
    const linkElements = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', (d: any) => {
        const src = simNodes.find(n => n.node_id === (typeof d.source === 'object' ? d.source.node_id : d.source));
        const tgt = simNodes.find(n => n.node_id === (typeof d.target === 'object' ? d.target.node_id : d.target));
        return (src?.parent_country === null || tgt?.parent_country === null) ? '#ffffff' : '#ea580c';
      })
      .attr('stroke-opacity', 0.4)
      .attr('stroke-dasharray', (d: any) => {
        const src = simNodes.find(n => n.node_id === (typeof d.source === 'object' ? d.source.node_id : d.source));
        const tgt = simNodes.find(n => n.node_id === (typeof d.target === 'object' ? d.target.node_id : d.target));
        return (src?.parent_country === null || tgt?.parent_country === null) ? '4, 4' : 'none';
      })
      .attr('stroke-width', 1.8);

    const nodeElements = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .on('click', (_event, d: any) => { onNodeClickRef.current(d); });

    nodeElements.append('circle')
      .attr('r', r)
      .attr('fill', (d: any) => getCountryColor(d.parent_country))
      .attr('stroke', '#020617')
      .attr('stroke-width', 1.5)
      .style('filter', 'url(#glow)');

    nodeElements.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', r + 13)
      .attr('fill', '#cbd5e1')
      .style('font-size', '9.5px')
      .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace')
      .style('font-weight', '700')
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .style('text-shadow', '0 1px 3px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9)')
      .text((d: any) => {
        const parent = d.parent_country;
        const actors: string[] = Array.isArray(d.actors)
          ? d.actors
          : (typeof d.actors === 'string' && d.actors
            ? (d.actors as string).split(',').map((s: string) => s.trim())
            : []);
        let label = '';
        if (parent) {
          const parentLower = parent.toLowerCase().trim();
          const remaining = actors.filter((a: string) => a.toLowerCase().trim() !== parentLower);
          label = [parent, ...remaining].join(', ');
        } else {
          label = actors.join(', ');
        }
        const charLimit = 22;
        return label.length > charLimit ? label.slice(0, charLimit - 3) + '...' : label;
      });

    // 6. *** CRITICAL FIX ***
    // The simulation is already stopped. The tick handler below only fires on restart.
    // We MUST manually apply the computed positions to the DOM elements right now,
    // otherwise all nodes and links render at 0,0 (invisible or stacked as one dot).
    const getNodeX = (nodeOrId: any): number => {
      if (typeof nodeOrId === 'object' && nodeOrId !== null) return nodeOrId.x || 0;
      const found = simNodes.find(n => n.node_id === nodeOrId);
      return found?.x || 0;
    };
    const getNodeY = (nodeOrId: any): number => {
      if (typeof nodeOrId === 'object' && nodeOrId !== null) return nodeOrId.y || 0;
      const found = simNodes.find(n => n.node_id === nodeOrId);
      return found?.y || 0;
    };

    linkElements
      .attr('x1', (d: any) => getNodeX(d.source))
      .attr('y1', (d: any) => getNodeY(d.source))
      .attr('x2', (d: any) => getNodeX(d.target))
      .attr('y2', (d: any) => getNodeY(d.target));

    nodeElements
      .attr('transform', (d: any) => `translate(${d.x || 0}, ${d.y || 0})`);

    // 7. Tick handler (for any residual simulation movement — kept for correctness)
    simulation.on('tick', () => {
      simNodes.forEach((d: any) => {
        if (d.parent_country === null) {
          d.x = Math.max(width * 0.76, Math.min(width - 50, d.x));
        } else {
          d.x = Math.max(50, Math.min(width * 0.70 - 20, d.x));
        }
        d.y = Math.max(50, Math.min(height - 50, d.y));
        nodesCoordsRef.current.set(d.node_id, { x: d.x, y: d.y });
      });
      linkElements
        .attr('x1', (d: any) => getNodeX(d.source))
        .attr('y1', (d: any) => getNodeY(d.source))
        .attr('x2', (d: any) => getNodeX(d.target))
        .attr('y2', (d: any) => getNodeY(d.target));
      nodeElements
        .attr('transform', (d: any) => `translate(${d.x || 0}, ${d.y || 0})`);
    });

    // 8. Auto-zoom-to-fit
    const fitGraph = () => {
      if (simNodes.length === 0) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      simNodes.forEach((d: any) => {
        if (d.x < minX) minX = d.x; if (d.x > maxX) maxX = d.x;
        if (d.y < minY) minY = d.y; if (d.y > maxY) maxY = d.y;
      });
      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;
      if (graphWidth <= 0 || graphHeight <= 0) return;
      const padding = 70;
      const scale = Math.max(0.2, Math.min(
        (width - padding * 2) / graphWidth,
        (height - padding * 2) / graphHeight,
        1.5
      ));
      const transform = d3.zoomIdentity
        .translate(width / 2 - scale * ((minX + maxX) / 2), height / 2 - scale * ((minY + maxY) / 2))
        .scale(scale);
      svg.call(zoom.transform, transform);
    };

    fitGraph();

    return () => { simulation.stop(); };
  }, [activeNodes, activeEvent, connections, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#070913]">
      <svg ref={svgRef} className="w-full h-full" />
      {activeNodes.some(n => n.parent_country === null) && (
        <div className="absolute right-[24%] top-6 bottom-6 w-px bg-slate-800/40 border-r border-dashed border-slate-700/20 pointer-events-none select-none flex flex-col justify-between items-center text-[9px] text-slate-500 font-mono tracking-widest uppercase">
          <span className="bg-[#070913] px-2 py-0.5 -translate-y-2 select-none">Global States</span>
          <span className="bg-[#070913] px-2 py-0.5 translate-y-2 select-none">Non-State Actors</span>
        </div>
      )}
    </div>
  );
}