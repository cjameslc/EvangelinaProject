"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/places/loadGoogleMaps";

export type MapPlace = { key: string; name: string; category: string; icon: string; lat: number; lng: number };

const CATEGORY_MARKER_COLOR: Record<string, string> = {
  coffee: "#8B5E3C", restaurants: "#E23B57", fastfood: "#FF7A5C", grocery: "#3EA66B", convenience: "#3EA66B",
  shopping: "#C9A24B", entertainment: "#6C5CE7", parks: "#2E8B57", schools: "#3B71E8", hospitals: "#E5484D",
  churches: "#8E7CC3", transportation: "#3B82C4", banks: "#0B7C74", pharmacies: "#E5484D", business: "#0B1E3D",
  attractions: "#C9A24B", essentials: "#717171",
};

/**
 * Real interactive Google Map — a marker for the property, a color-coded
 * marker per nearby place, click-to-select (from either a marker or the
 * caller passing `selected`), auto pan/zoom to the selection, and a real
 * walking route + ETA via the Directions API. Entirely additive: nothing
 * else on the Nearby pages depends on this rendering — if the browser key
 * isn't configured or the script fails to load, this quietly renders
 * nothing and the existing Maps/Waze/Directions buttons keep working.
 */
export function NearbyMap({
  origin, places, selected, onSelect,
}: {
  origin: { lat: number; lng: number } | null;
  places: MapPlace[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const directionsRendererRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Initial load + marker setup — re-runs if the origin or the place list
  // identity changes (a category/search filter change swaps the list).
  useEffect(() => {
    if (!apiKey || !origin || !containerRef.current) { setStatus("unavailable"); return; }
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center: origin,
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: [{ featureType: "poi.business", stylers: [{ visibility: "off" }] }],
        });
        mapRef.current = map;

        new g.maps.Marker({
          position: origin,
          map,
          title: "Evangelina's Staycation",
          zIndex: 999,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 11, fillColor: "#FF385C", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
        });

        markersRef.current.clear();
        const bounds = new g.maps.LatLngBounds();
        bounds.extend(origin);
        for (const p of places) {
          const marker = new g.maps.Marker({
            position: { lat: p.lat, lng: p.lng },
            map,
            title: p.name,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: CATEGORY_MARKER_COLOR[p.category] ?? "#0B1E3D",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            },
          });
          marker.addListener("click", () => onSelect(p.key));
          markersRef.current.set(p.key, marker);
          bounds.extend({ lat: p.lat, lng: p.lng });
        }
        if (places.length > 0) map.fitBounds(bounds, 48);

        directionsRendererRef.current = new g.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          polylineOptions: { strokeColor: "#FF385C", strokeWeight: 4, strokeOpacity: 0.85 },
        });

        setStatus("ready");
      })
      .catch(() => setStatus("unavailable"));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, origin?.lat, origin?.lng, places.map((p) => p.key).join(",")]);

  // Selection changes — pan/zoom + draw the real walking route.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const w = window as unknown as { google?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const g = w.google;
    if (!g) return;

    if (!selected) {
      directionsRendererRef.current?.set("directions", null);
      setRouteInfo(null);
      return;
    }
    const place = places.find((p) => p.key === selected);
    if (!place || !origin) return;

    mapRef.current.panTo({ lat: place.lat, lng: place.lng });
    mapRef.current.setZoom(16);

    const directionsService = new g.maps.DirectionsService();
    directionsService.route(
      { origin, destination: { lat: place.lat, lng: place.lng }, travelMode: g.maps.TravelMode.WALKING },
      (result: any, routeStatus: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (routeStatus === "OK" && result) {
          directionsRendererRef.current?.setDirections(result);
          const leg = result.routes?.[0]?.legs?.[0];
          if (leg) setRouteInfo({ distance: leg.distance?.text ?? "", duration: leg.duration?.text ?? "" });
        }
      }
    );
  }, [selected, status, places, origin]);

  if (!apiKey || !origin) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)] shadow-[0_20px_50px_rgba(0,0,0,.12)]">
      <div className="relative">
        <div ref={containerRef} className="h-[280px] w-full sm:h-[380px]" />
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-[var(--bg-2)]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-rausch" />
          </div>
        )}
        {status === "unavailable" && (
          <div className="absolute inset-0 grid place-items-center bg-[var(--bg-2)] px-6 text-center text-[12.5px] text-[var(--gray)]">
            Map unavailable right now — use the Maps/Directions buttons below instead.
          </div>
        )}
      </div>
      {routeInfo && selected && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] bg-gradient-to-r from-navy/5 to-gold/5 px-4 py-2.5 text-[12.5px]">
          <span className="truncate font-bold">{places.find((p) => p.key === selected)?.name}</span>
          <span className="flex-none font-bold text-rausch">{routeInfo.distance} · 🚶 {routeInfo.duration}</span>
        </div>
      )}
    </div>
  );
}
