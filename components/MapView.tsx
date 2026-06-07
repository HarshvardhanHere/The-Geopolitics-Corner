'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CAPITALS } from '@/lib/capitals';

interface MapViewProps {
  activeNodes: any[];
  activeEvent: any | null;
  onNodeClick: (node: any) => void;
}

// Country name normalization for mapping excel names to GeoJSON
function normalizeCountryName(name: string): string {
  const n = name.toLowerCase().trim();
  if (n === 'usa' || n === 'united states' || n === 'united states of america') return 'usa';
  if (n === 'uk' || n === 'united kingdom') return 'uk';
  if (n === 'uae' || n === 'united arab emirates') return 'uae';
  if (n === 'saudi arabia') return 'saudi arabia';
  if (n === 'new zealand') return 'new zealand';
  return n;
}

export default function MapView({ activeNodes, activeEvent, onNodeClick }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const linesLayerRef = useRef<L.FeatureGroup | null>(null);
  const capitalsLayerRef = useRef<L.FeatureGroup | null>(null);

  const [worldGeoJson, setWorldGeoJson] = useState<any>(null);
  const [hoveredConnection, setHoveredConnection] = useState<{
    entityA: string;
    entityB: string;
    nodes: any[];
    position: { x: number; y: number };
  } | null>(null);

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch world boundaries GeoJSON once
  useEffect(() => {
    fetch('/world.json')
      .then(res => res.json())
      .then(data => setWorldGeoJson(data))
      .catch(err => console.error('Error loading world GeoJSON:', err));
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create Leaflet Map with panning and zooming completely disabled for public users
    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 6,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      touchZoom: false,
      keyboard: false,
      attributionControl: false,
    });

    // Dark Matter tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;
    linesLayerRef.current = L.featureGroup().addTo(map);
    capitalsLayerRef.current = L.featureGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map state on event / nodes change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !worldGeoJson) return;

    // 1. Clear previous lines and capitals
    linesLayerRef.current?.clearLayers();
    capitalsLayerRef.current?.clearLayers();

    // 2. Identify active actor countries
    const activeActorsSet = new Set<string>();
    activeNodes.forEach(node => {
      if (node.parent_country) {
        activeActorsSet.add(normalizeCountryName(node.parent_country));
      }
      if (node.actors && Array.isArray(node.actors)) {
        node.actors.forEach((act: string) => {
          activeActorsSet.add(normalizeCountryName(act));
        });
      }
    });

    // 3. Render / Update GeoJSON boundary layers
    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
    }

    geoJsonLayerRef.current = L.geoJSON(worldGeoJson, {
      style: (feature) => {
        const countryName = feature?.properties?.name || '';
        const normalized = normalizeCountryName(countryName);
        const isActive = activeActorsSet.has(normalized);

        return {
          fillColor: isActive ? '#f97316' : '#090d16', // Orange vs dark
          fillOpacity: isActive ? 0.35 : 0.85,
          color: isActive ? '#ea580c' : '#1e293b', // Brighter orange border vs dark border
          weight: isActive ? 2 : 1,
        };
      }
    }).addTo(map);

    // If no event selected, reset map view and exit
    if (!activeEvent || activeNodes.length === 0) {
      map.setView([20, 0], 2);
      return;
    }

    // 4. Calculate connection lines and weights
    // Entity keys: country names or non-state actor node IDs (represented as strings e.g. "nonstate-12")
    const connectionWeights = new Map<string, { nodes: any[]; type: 'state' | 'nonstate'; actorA: string; actorB: string }>();

    activeNodes.forEach(node => {
      if (node.parent_country) {
        const countryA = node.parent_country; // Primary driver (must be a country name)
        
        node.actors.forEach((actorB: string) => {
          const isBState = CAPITALS[actorB] !== undefined;

          if (isBState) {
            // Country-to-Country connection
            const sortedKey = [countryA, actorB].sort().join(' <-> ');
            if (!connectionWeights.has(sortedKey)) {
              connectionWeights.set(sortedKey, { nodes: [], type: 'state', actorA: countryA, actorB });
            }
            connectionWeights.get(sortedKey)!.nodes.push(node);
          } else {
            // Country-to-NonState connection (actorB is a non-state actor)
            // But wait! Non-state actor nodes themselves are nodes with parent_country null.
            // If the secondary actor 'actorB' is not in the capitals lookup, it is a non-state actor entity name.
            // In Map View, non-state actors are individual nodes with NULL parent_country.
            // If this node represents a connection to a non-state actor name, we connect countryA to this node's circle
            // if it is a non-state actor node. Wait, let's connect countryA to any active non-state actor node
            // that contains actorB!
            // Wait, is it simpler? Let's check: "Connection lines between a country actor and a non-state actor
            // run from the country's capital coordinate on the map to the non-state actor's position in the right panel."
            // So if a node itself has parent_country = null (meaning it is a non-state actor node),
            // it is rendered as a circle in the right panel. Its connection lines run from the capitals of its 'actors'
            // to its circle.
            // This is exactly it!
          }
        });
      } else {
        // Non-State Actor Node (parent_country is null)
        // We connect each actor (which is a state actor country) to this node's circle in the right panel!
        const nodeId = node.node_id;
        node.actors.forEach((actor: string) => {
          if (CAPITALS[actor]) {
            const key = `${actor} <-> nonstate-${nodeId}`;
            if (!connectionWeights.has(key)) {
              connectionWeights.set(key, { nodes: [], type: 'nonstate', actorA: actor, actorB: `nonstate-${nodeId}` });
            }
            connectionWeights.get(key)!.nodes.push(node);
          }
        });
      }
    });

    // 5. Render Capital Circle Markers
    const renderedCapitals = new Set<string>();
    const renderCapital = (country: string) => {
      const coords = CAPITALS[country];
      if (coords && !renderedCapitals.has(country)) {
        L.circleMarker([coords.lat, coords.lng], {
          radius: 5,
          fillColor: '#f97316', // Orange
          fillOpacity: 1,
          color: '#ffffff',
          weight: 1,
        }).addTo(capitalsLayerRef.current!).bindTooltip(country, {
          permanent: false,
          direction: 'top',
          className: 'bg-slate-900 text-slate-100 text-xs px-2 py-1 border-none rounded font-mono',
        });
        renderedCapitals.add(country);
      }
    };

    // 6. Draw connection lines
    connectionWeights.forEach((data, key) => {
      const { nodes: sharedNodes, type, actorA, actorB } = data;
      const weight = Math.max(1, sharedNodes.length);
      const pixelWeight = 1.5 + (weight - 1) * 1.5; // Scales line thickness proportionally

      if (type === 'state') {
        const coordsA = CAPITALS[actorA];
        const coordsB = CAPITALS[actorB];

        if (coordsA && coordsB) {
          renderCapital(actorA);
          renderCapital(actorB);

          const polyline = L.polyline([[coordsA.lat, coordsA.lng], [coordsB.lat, coordsB.lng]], {
            color: '#ea580c', // Bright orange
            weight: pixelWeight,
            opacity: 0.65,
          }).addTo(linesLayerRef.current!);

          // Mouse Hover Zoom and Tooltip/Card Panel Handler
          polyline.on('mouseover', (e: L.LeafletMouseEvent) => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

            // Zoom map to bounds between the two coordinates
            const bounds = L.latLngBounds([coordsA, coordsB]);
            map.fitBounds(bounds, { padding: [80, 80], animate: true });

            // Display card panel
            setHoveredConnection({
              entityA: actorA,
              entityB: actorB,
              nodes: sharedNodes,
              position: { x: e.containerPoint.x, y: e.containerPoint.y }
            });
          });

          polyline.on('mouseout', () => {
            // Delay closing to let mouse move to the card panel
            hoverTimeoutRef.current = setTimeout(() => {
              setHoveredConnection(null);
              map.setView([20, 0], 2);
            }, 300);
          });
        }
      }
    });

    // 7. Render Non-State Actor connections on panel sync
    const handleNonStateLines = () => {
      // Find all right panel circles in DOM and map Leaflet lines to them
      connectionWeights.forEach((data) => {
        const { nodes: sharedNodes, type, actorA, actorB } = data;
        if (type !== 'nonstate') return;

        const coordsA = CAPITALS[actorA];
        if (!coordsA) return;

        renderCapital(actorA);

        const circleId = actorB; // e.g., "nonstate-12"
        const element = document.getElementById(circleId);
        if (element && map) {
          const mapContainer = map.getContainer();
          const mapRect = mapContainer.getBoundingClientRect();
          const elemRect = element.getBoundingClientRect();
          const x = elemRect.left - mapRect.left + elemRect.width / 2;
          const y = elemRect.top - mapRect.top + elemRect.height / 2;
          
          try {
            const latlngB = map.containerPointToLatLng([x, y]);
            const polyline = L.polyline([[coordsA.lat, coordsA.lng], [latlngB.lat, latlngB.lng]], {
              color: '#ffffff', // White connection lines for non-state actors
              weight: 1.5 + (sharedNodes.length - 1) * 1.5,
              opacity: 0.5,
              dashArray: '5, 5', // Dashed line to represent non-state overlay connection
            }).addTo(linesLayerRef.current!);

            polyline.on('mouseover', (e: L.LeafletMouseEvent) => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              
              // Center map on capital coordinates
              map.setView([coordsA.lat, coordsA.lng], 3, { animate: true });

              setHoveredConnection({
                entityA: actorA,
                entityB: sharedNodes[0].title, // Show non-state actor info
                nodes: sharedNodes,
                position: { x: e.containerPoint.x - 120, y: e.containerPoint.y }
              });
            });

            polyline.on('mouseout', () => {
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredConnection(null);
                map.setView([20, 0], 2);
              }, 300);
            });
          } catch (err) {
            // containerPointToLatLng could fail if coordinates are out of bounds/loading
          }
        }
      });
    };

    // Delay line anchor calculation slightly to allow right panel nodes to finish rendering in DOM
    const timer = setTimeout(handleNonStateLines, 200);

    // Watch for window resize to recalibrate screen coordinates to map lat/lng
    window.addEventListener('resize', handleNonStateLines);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleNonStateLines);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [worldGeoJson, activeNodes, activeEvent]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full bg-[#070913]" />

      {/* Floating Card Panel: Constituent Nodes list on hover (Requirement Section 4.3) */}
      {hoveredConnection && (
        <div
          className="absolute bg-[#0f1422] border border-slate-800 rounded-lg p-4 shadow-2xl z-[1000] w-64 max-h-56 overflow-y-auto flex flex-col gap-2 cursor-default font-sans"
          style={{
            left: `${hoveredConnection.position.x + 20}px`,
            top: `${hoveredConnection.position.y - 40}px`,
          }}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          }}
          onMouseLeave={() => {
            hoverTimeoutRef.current = setTimeout(() => {
              setHoveredConnection(null);
              mapRef.current?.setView([20, 0], 2);
            }, 300);
          }}
        >
          <div className="border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-100">
              {hoveredConnection.entityA} &harr; {hoveredConnection.entityB}
            </h4>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              {hoveredConnection.nodes.length} Constituent Node(s)
            </p>
          </div>
          <div className="flex flex-col gap-1.5 overflow-y-auto max-h-36 pr-1">
            {hoveredConnection.nodes.map((node) => (
              <button
                key={node.node_id}
                onClick={() => {
                  onNodeClick(node);
                  setHoveredConnection(null);
                }}
                className="w-full text-left bg-slate-900 hover:bg-indigo-950/40 hover:text-indigo-300 border border-slate-800 hover:border-indigo-900/60 rounded p-2 transition-all cursor-pointer"
              >
                <div className="text-[10px] font-bold text-indigo-400 font-mono">
                  Node {node.node_id}
                </div>
                <div className="text-[11px] text-slate-200 truncate font-semibold mt-0.5">
                  {node.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
