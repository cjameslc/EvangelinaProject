// Guest-facing photo gallery — real photos from the business's own shoot
// (all 5 units are staged identically, so one set covers every unit).
// Source: ~/Desktop/rooms (308 raw shots) -> deduped (burst/duplicate
// exports removed) -> hand-curated down to the sharpest, most
// representative, non-redundant shot per subject -> resized to a 1600px-
// wide JPEG and copied into public/gallery/. Nothing here is fabricated;
// every image is an actual photo of the unit.

export type GalleryCategory =
  | "hero"
  | "building"
  | "checkin"
  | "living-room"
  | "bedroom"
  | "kitchen"
  | "bathroom"
  | "amenities"
  | "wifi"
  | "hallway";

export type GalleryImage = { src: string; alt: string };

export const GALLERY_CATEGORY_LABELS: Record<GalleryCategory, string> = {
  hero: "Featured",
  building: "Building",
  checkin: "Entryway & Check-In",
  "living-room": "Living Room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  amenities: "Amenities & Details",
  wifi: "WiFi",
  hallway: "Hallway",
};

export const GALLERY: Record<GalleryCategory, GalleryImage[]> = {
  hero: [
    { src: "/gallery/hero-01.jpg", alt: "Full room view" },
    { src: "/gallery/hero-02.jpg", alt: "Welcome desk" },
    { src: "/gallery/hero-03.jpg", alt: "Urban Deca Towers exterior" },
  ],
  building: [
    { src: "/gallery/building-01.jpg", alt: "Urban Deca Towers exterior" },
    { src: "/gallery/building-02.jpg", alt: "Building and street view" },
  ],
  checkin: [
    { src: "/gallery/checkin-01.jpg", alt: "Unit door number" },
    { src: "/gallery/checkin-02.jpg", alt: "Smart door lock" },
    { src: "/gallery/checkin-03.jpg", alt: "Hallway to the unit" },
  ],
  "living-room": [
    { src: "/gallery/living-room-01.jpg", alt: "TV and living area" },
    { src: "/gallery/living-room-02.jpg", alt: "TV wall and dining table" },
    { src: "/gallery/living-room-03.jpg", alt: "Dining nook" },
    { src: "/gallery/living-room-04.jpg", alt: "TV wall with decor" },
    { src: "/gallery/living-room-05.jpg", alt: "Dining area with hanging plants" },
  ],
  bedroom: [
    { src: "/gallery/bedroom-01.jpg", alt: "Bed and wall art" },
    { src: "/gallery/bedroom-02.jpg", alt: "Bedroom with daylight" },
    { src: "/gallery/bedroom-03.jpg", alt: "Bedroom and kitchenette view" },
    { src: "/gallery/bedroom-04.jpg", alt: "Bedroom with city view" },
    { src: "/gallery/bedroom-05.jpg", alt: "Bed with decorative pillows" },
    { src: "/gallery/bedroom-06.jpg", alt: "Bed pillow detail" },
    { src: "/gallery/bedroom-07.jpg", alt: "Wall art above the bed" },
    { src: "/gallery/bedroom-08.jpg", alt: "Bedroom corner" },
  ],
  kitchen: [
    { src: "/gallery/kitchen-01.jpg", alt: "Kitchenette" },
    { src: "/gallery/kitchen-02.jpg", alt: "Kitchenette with dining chairs" },
    { src: "/gallery/kitchen-03.jpg", alt: "Cabinet, microwave and sink" },
    { src: "/gallery/kitchen-04.jpg", alt: "Kitchen counter and sink" },
    { src: "/gallery/kitchen-05.jpg", alt: "Kitchen shelf detail" },
    { src: "/gallery/kitchen-06.jpg", alt: "Kitchenette wide view" },
    { src: "/gallery/kitchen-07.jpg", alt: "Kitchen shelf with cookware" },
  ],
  bathroom: [
    { src: "/gallery/bathroom-01.jpg", alt: "Toilet and cabinet" },
    { src: "/gallery/bathroom-02.jpg", alt: "Toilet and storage cabinet" },
    { src: "/gallery/bathroom-03.jpg", alt: "Shower head and water heater" },
    { src: "/gallery/bathroom-04.jpg", alt: "Bathroom overview" },
    { src: "/gallery/bathroom-05.jpg", alt: "Toilet and cabinet, vertical view" },
    { src: "/gallery/bathroom-06.jpg", alt: "Toilet and bidet" },
    { src: "/gallery/bathroom-07.jpg", alt: "Shower and water heater" },
  ],
  amenities: [
    { src: "/gallery/amenities-01.jpg", alt: "Board games and books" },
    { src: "/gallery/amenities-02.jpg", alt: "Bedside bookshelf" },
    { src: "/gallery/amenities-03.jpg", alt: "Game controllers" },
    { src: "/gallery/amenities-04.jpg", alt: "Board games detail" },
    { src: "/gallery/amenities-05.jpg", alt: "Decorative wall art" },
    { src: "/gallery/amenities-06.jpg", alt: "Decor detail" },
    { src: "/gallery/amenities-07.jpg", alt: "Welcome desk detail" },
    { src: "/gallery/amenities-08.jpg", alt: "Hanging plant decor" },
    { src: "/gallery/amenities-09.jpg", alt: "Nightstand detail" },
  ],
  wifi: [
    { src: "/gallery/wifi-01.jpg", alt: "WiFi router shelf" },
    { src: "/gallery/wifi-02.jpg", alt: "WiFi router and decor shelf" },
  ],
  hallway: [{ src: "/gallery/hallway-01.jpg", alt: "Hallway view" }],
};

export const GALLERY_CATEGORY_ORDER: GalleryCategory[] = [
  "living-room",
  "bedroom",
  "kitchen",
  "bathroom",
  "amenities",
  "wifi",
  "checkin",
  "building",
  "hallway",
];
