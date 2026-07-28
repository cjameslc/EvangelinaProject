"use client";

import { Modal } from "@/components/ui/Modal";
import { CaptionEditor, type GeneratorUnitContext } from "./CaptionEditor";

export type { GeneratorUnitContext };

/**
 * Thin modal wrapper around CaptionEditor — kept for entry points that
 * still want a popover generator (currently: the Captions tab's "Generate
 * with AI" button) rather than the inline Content Studio workspace, which
 * renders CaptionEditor directly.
 */
export function ContentGeneratorPanel({
  open, onClose, unitContext, month, availableDatesSummary, businessName, location, contact, amenities, promoNote, bookingLink, toast,
}: {
  open: boolean;
  onClose: () => void;
  unitContext: GeneratorUnitContext | null; // null = generic property-wide post
  month: string;
  availableDatesSummary: string;
  businessName: string;
  location: string;
  contact: string;
  amenities: string[];
  promoNote: string | null;
  bookingLink: string;
  toast: (msg: string, isError?: boolean) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Content generator" sub={unitContext ? unitContext.unitName : "Property-wide"} maxWidth={640}>
      <CaptionEditor
        unitContext={unitContext}
        month={month}
        availableDatesSummary={availableDatesSummary}
        businessName={businessName}
        location={location}
        contact={contact}
        amenities={amenities}
        promoNote={promoNote}
        bookingLink={bookingLink}
        toast={toast}
      />
    </Modal>
  );
}
