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

// Returns country color, or white for non-state actors, or generates deterministic HSL
export function getCountryColor(country: string | null): string {
  if (!country) return '#ffffff';
  
  const normalized = country.toLowerCase().trim();
  if (COUNTRY_COLORS[normalized]) {
    return COUNTRY_COLORS[normalized];
  }
  
  // Deterministic HSL generation based on country name
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20); // 65% - 85%
  const lightness = 45 + (Math.abs(hash) % 15);  // 45% - 60%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export default function NodeView({ activeNodes, activeEvent, connections, onNodeClick }: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Refs to isolate state and D3 lifecycle
  const prevEventIdRef = useRef<string | null>(null);
  const prevNodesHashRef = useRef<string>('');
  const prevDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const nodesCoordsRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Fix 4: Separate click handler from simulation state updates
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Update dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
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

    // Fix 1: Preserve simulation between renders unless event, nodes, or dimensions actually changed
    if (!eventChanged && !nodesChanged && !dimensionsChanged && simulationRef.current) {
      return;
    }

    prevEventIdRef.current = currentEventId;
    prevNodesHashRef.current = currentNodesHash;
    prevDimensionsRef.current = { width: dimensions.width, height: dimensions.height };

    // Clear coordinates cache if event changed
    if (eventChanged) {
      nodesCoordsRef.current.clear();
    }

    const { width, height } = dimensions;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove(); // Clear previous render

    // Clear old simulation to prevent memory leaks
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // 1. Append definitions (grid pattern and glows)
    const defs = svg.append('defs');
    
    // Abstract premium grid background pattern
    defs.append('pattern')
      .attr('id', 'grid-pattern')
      .attr('width', 40)
      .attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', 'M 40 0 L 0 0 0 40')
      .attr('fill', 'none')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.25);

    // Glow filter for highlighted/premium look
    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', 4)
      .attr('result', 'blur');
    glowFilter.append('feComposite')
      .attr('in', 'SourceGraphic')
      .attr('in2', 'blur')
      .attr('operator', 'over');

    // Create the master graph group for zoom and pan
    const g = svg.append('g').attr('class', 'graph-container');

    // Subtle background rect for grid pattern
    g.append('rect')
      .attr('x', -10000)
      .attr('y', -10000)
      .attr('width', 20000)
      .attr('height', 20000)
      .attr('fill', 'url(#grid-pattern)')
      .style('pointer-events', 'all');

    // Setup zoom behavior on SVG
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // 2. Clone and prepare nodes, reusing coordinates if they already settled
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

    // Clone and prepare links (only those connecting active nodes)
    const simLinks = connections
      .filter((conn) => activeNodeIds.has(conn.node_a) && activeNodeIds.has(conn.node_b))
      .map((conn) => ({
        id: conn.connection_id,
        source: conn.node_a,
        target: conn.node_b,
      }));

    // Dynamic circle radius: shrinks as node count increases
    const N = simNodes.length;
    const r = Math.max(9, Math.min(26, 130 / Math.sqrt(N || 1)));

    // Custom centroid force for country clustering based on user spec (Fix 1)
    const clusterForce = (alpha: number) => {
      const centroids = new Map<string, { x: number; y: number; count: number }>();
      
      simNodes.forEach((node: any) => {
        const key = node.parent_country || 'nonstate';
        if (!centroids.has(key)) centroids.set(key, { x: 0, y: 0, count: 0 });
        const c = centroids.get(key)!;
        c.x += node.x || 0;
        c.y += node.y || 0;
        c.count += 1;
      });
      
      centroids.forEach((c) => {
        if (c.count > 0) {
          c.x /= c.count;
          c.y /= c.count;
        }
      });
      
      simNodes.forEach((node: any) => {
        const key = node.parent_country || 'nonstate';
        const c = centroids.get(key);
        if (c) {
          node.vx = (node.vx || 0) + (c.x - (node.x || 0)) * 0.12 * alpha;
          node.vy = (node.vy || 0) + (c.y - (node.y || 0)) * 0.12 * alpha;
        }
      });
    };

    // 3. Setup force-directed simulation
    const simulation = d3.forceSimulation(simNodes as any)
      .force('link', d3.forceLink(simLinks).id((d: any) => d.node_id).distance(90))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('collide', d3.forceCollide().radius(r + 20))
      // Center pull (stronger for state actors, weaker for non-state actors which are pinned)
      .force('x', d3.forceX().x((d: any) => d.parent_country === null ? width * 0.84 : width * 0.42).strength((d: any) => d.parent_country === null ? 0.9 : 0.08))
      .force('y', d3.forceY(height / 2).strength(0.06))
      .force('cluster', clusterForce);

    simulationRef.current = simulation;

    // 4. Synchronously pre-tick the simulation to stabilize the layout before first print (if not already pinned)
    const isAlreadyPinned = simNodes.every(n => n.fx !== undefined);
    if (!isAlreadyPinned) {
      const ticks = Math.max(120, Math.min(220, N * 2));
      for (let i = 0; i < ticks; ++i) {
        simulation.tick();
        // Apply strict border/perimeter limits during pre-run ticks
        simNodes.forEach((d: any) => {
          if (d.parent_country === null) {
            d.x = Math.max(width * 0.76, Math.min(width - 50, d.x));
          } else {
            d.x = Math.max(50, Math.min(width * 0.70 - 20, d.x));
          }
          d.y = Math.max(50, Math.min(height - 50, d.y));
        });
      }
    }

    // 5. Build SVG Elements
    // Render links
    const linkElements = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', (d: any) => {
        const sourceNode = simNodes.find(n => n.node_id === d.source.node_id);
        const targetNode = simNodes.find(n => n.node_id === d.target.node_id);
        const hasNonState = (sourceNode && sourceNode.parent_country === null) || (targetNode && targetNode.parent_country === null);
        return hasNonState ? '#ffffff' : '#ea580c';
      })
      .attr('stroke-opacity', 0.4)
      .attr('stroke-dasharray', (d: any) => {
        const sourceNode = simNodes.find(n => n.node_id === d.source.node_id);
        const targetNode = simNodes.find(n => n.node_id === d.target.node_id);
        const hasNonState = (sourceNode && sourceNode.parent_country === null) || (targetNode && targetNode.parent_country === null);
        return hasNonState ? '4, 4' : 'none';
      })
      .attr('stroke-width', 1.8);

    // Render nodes
    const nodeElements = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .on('click', (event, d: any) => {
        // Fix 4: Uses mutable ref to avoid restarting simulation on parent state changes
        onNodeClickRef.current(d);
      });

    // Node circles (uniform sizing, custom colors, subtle stroke, glowing shadow)
    nodeElements.append('circle')
      .attr('r', r)
      .attr('fill', (d: any) => getCountryColor(d.parent_country))
      .attr('stroke', '#020617')
      .attr('stroke-width', 1.5)
      .style('filter', 'url(#glow)');

    // Text labels: centered below the circle showing actors (Fix 2: formatting logic)
    nodeElements.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', r + 13)
      .attr('fill', '#cbd5e1') // slate-300
      .style('font-size', '9.5px')
      .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace')
      .style('font-weight', '700')
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .style('text-shadow', '0 1px 3px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9)')
      .text((d: any) => {
        const parent = d.parent_country;
        const actors = d.actors || [];
        
        let label = '';
        if (parent) {
          const parentLower = parent.toLowerCase().trim();
          const remaining = actors.filter((actor: string) => actor.toLowerCase().trim() !== parentLower);
          label = [parent, ...remaining].join(', ');
        } else {
          label = actors.join(', ');
        }
        
        const charLimit = 22;
        return label.length > charLimit ? label.slice(0, charLimit - 3) + '...' : label;
      });

    // 6. Handle ticks (keep nodes inside boundary and update coordinates)
    simulation.on('tick', () => {
      simNodes.forEach((d: any) => {
        if (d.parent_country === null) {
          d.x = Math.max(width * 0.76, Math.min(width - 50, d.x));
        } else {
          d.x = Math.max(50, Math.min(width * 0.70 - 20, d.x));
        }
        d.y = Math.max(50, Math.min(height - 50, d.y));

        // Keep current coordinates cache updated
        nodesCoordsRef.current.set(d.node_id, { x: d.x, y: d.y });
      });

      linkElements
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodeElements
        .attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);
    });

    // 7. Auto-zoom-to-fit calculation
    const fitGraph = (animate = false) => {
      if (simNodes.length === 0) return;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      simNodes.forEach((d: any) => {
        if (d.x < minX) minX = d.x;
        if (d.x > maxX) maxX = d.x;
        if (d.y < minY) minY = d.y;
        if (d.y > maxY) maxY = d.y;
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

      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      const transform = d3.zoomIdentity
        .translate(width / 2 - scale * midX, height / 2 - scale * midY)
        .scale(scale);

      if (animate) {
        svg.transition().duration(600).ease(d3.easeCubicOut).call(zoom.transform, transform);
      } else {
        svg.call(zoom.transform, transform);
      }
    };

    // Auto fit on load/refresh instantly to prevent jumpiness
    fitGraph(false);

    // Fix 3: Lock node positions on simulation stabilization
    simulation.on('end', () => {
      fitGraph(true);
      
      // Pin nodes permanently
      simNodes.forEach((node: any) => {
        node.fx = node.x;
        node.fy = node.y;
        nodesCoordsRef.current.set(node.node_id, { x: node.x, y: node.y });
      });
      
      simulation.stop();
    });

    // Fix 2: Freeze positions after stabilization quickly
    if (isAlreadyPinned) {
      simulation.stop();
    } else {
      simulation.alphaDecay(0.12); // High decay rate so it settles fast
      simulation.alphaTarget(0);
      simulation.alpha(0.08).restart(); // Start with minimal alpha to come to rest quickly
    }

    // Clean up
    return () => {
      simulation.stop();
    };
  }, [activeNodes, activeEvent, connections, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#070913]">
      <svg ref={svgRef} className="w-full h-full" />
      
      {/* Visual Indicator Overlay for Non-State Actor perimeter division */}
      {activeNodes.some(n => n.parent_country === null) && (
        <div className="absolute right-[24%] top-6 bottom-6 w-px bg-slate-800/40 border-r border-dashed border-slate-700/20 pointer-events-none select-none flex flex-col justify-between items-center text-[9px] text-slate-500 font-mono tracking-widest uppercase">
          <span className="bg-[#070913] px-2 py-0.5 -translate-y-2 select-none">Global States</span>
          <span className="bg-[#070913] px-2 py-0.5 translate-y-2 select-none">Non-State Actors</span>
        </div>
      )}
    </div>
  );
}
