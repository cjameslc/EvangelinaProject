"use client";

import { useState } from "react";
import type { UnsplashImage as UnsplashImageData } from "@/lib/unsplash/types";
import { useTrackUnsplashView } from "@/lib/unsplash/useImageTracking";

// Unsplash's required attribution link format, with UTM params identifying
// this app — see https://help.unsplash.com/en/articles/2511315.
const UTM = "utm_source=evangelinas_staycation&utm_medium=referral";

/**
 * The one component every Unsplash-sourced image in the guest view renders
 * through — handles the loading skeleton, the local gradient fallback when
 * a category has no cached image (API down, never warmed yet), the
 * required "Photo by X on Unsplash" attribution, and the once-per-session
 * download-tracking ping (useTrackUnsplashView). Plain <img> with
 * srcSet/sizes + native lazy loading, matching this codebase's existing
 * convention (no next/image elsewhere in the guest UI).
 */
export function UnsplashImage({
  image,
  alt,
  className = "",
  sizes = "100vw",
  showAttribution = true,
  attributionClassName = "",
  priority = false,
}: {
  image: UnsplashImageData | null | undefined;
  alt?: string;
  className?: string;
  sizes?: string;
  showAttribution?: boolean;
  attributionClassName?: string;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  useTrackUnsplashView(image);

  if (!image) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-rausch/20 via-gold/15 to-teal/20 ${className}`}
        role="img"
        aria-label={alt || "Image unavailable"}
      >
        <span className="text-3xl opacity-40">🏠</span>
      </div>
    );
  }

  return (
    <div className={`group relative overflow-hidden ${className}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-[var(--bg-2)]" aria-hidden="true" />}
      <img
        src={image.regular}
        srcSet={`${image.thumb} 200w, ${image.small} 400w, ${image.regular} 1080w, ${image.full} 1600w`}
        sizes={sizes}
        alt={alt || image.alt}
        loading={priority ? "eager" : "lazy"}
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {showAttribution && loaded && (
        <div className={`absolute bottom-1.5 right-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[9.5px] font-medium text-white/90 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 ${attributionClassName}`}>
          Photo by{" "}
          <a href={`${image.photographerProfile}?${UTM}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-white" onClick={(e) => e.stopPropagation()}>
            {image.photographer}
          </a>{" "}
          on{" "}
          <a href={`https://unsplash.com/?${UTM}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-white" onClick={(e) => e.stopPropagation()}>
            Unsplash
          </a>
        </div>
      )}
    </div>
  );
}
