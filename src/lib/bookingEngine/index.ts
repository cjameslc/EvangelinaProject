// Single entry point for booking-related business logic — every consumer
// (staff UI, guest portal, future AI assistant/Messenger/Instagram/mobile
// integrations) imports from here rather than reaching into individual
// lib files directly. Re-exports existing, already-battle-tested modules
// alongside the new services added for the guest-facing work, instead of
// moving/rewriting what already works.
export { checkAvailability, checkAvailabilityForUnits, type AvailabilityQuery, type StayType } from "@/lib/bookingEngine/availabilityService";
export { quotePrice, type PriceQuote } from "@/lib/bookingEngine/pricingService";
export { getUnitOccupiedRanges, getPublicOccupiedDates } from "@/lib/bookingEngine/calendarService";
export { notify, type NotificationEvent } from "@/lib/bookingEngine/notificationService";
export { createBookingRecord, type BookingInput, type CreateBookingResult } from "@/lib/bookingService";
export { bookingsConflict, nightsFor, occupiedRange, calendarBlockEndDate } from "@/lib/stayRange";
