import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { VisioBooking } from "../app/components/booking/VisioBooking";
import defaultContent from "../app/content/default-site-content.json";

const mockSlots = [
  // Tuesday 2026-11-03: 10:00, 12:00, 14:00, 16:00, 18:00
  { date: "2026-11-03", time: "10:00", slot_key: "2026-11-03T10:00" },
  { date: "2026-11-03", time: "12:00", slot_key: "2026-11-03T12:00" },
  { date: "2026-11-03", time: "14:00", slot_key: "2026-11-03T14:00" },
  { date: "2026-11-03", time: "16:00", slot_key: "2026-11-03T16:00" },
  { date: "2026-11-03", time: "18:00", slot_key: "2026-11-03T18:00" },
  // Saturday 2026-11-07: ONLY 10:00 and 14:00
  { date: "2026-11-07", time: "10:00", slot_key: "2026-11-07T10:00" },
  { date: "2026-11-07", time: "14:00", slot_key: "2026-11-07T14:00" },
];

const originalFetch = global.fetch;

describe("VisioBooking Client Component", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/booking") {
        return Promise.resolve({
          json: () => Promise.resolve({ slots: mockSlots })
        });
      }
      return originalFetch(url);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should clear previously selected time when switching to a date where that time is not allowed/available", async () => {
    render(<VisioBooking language="fr" content={defaultContent.contactPage.visioBooking} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Choisissez une date :")).toBeInTheDocument();
    });

    const dateSelect = screen.getByLabelText("Choisissez une date :") as HTMLSelectElement;

    // 1. Select Tuesday
    fireEvent.change(dateSelect, { target: { value: "2026-11-03" } });
    expect(dateSelect.value).toBe("2026-11-03");

    // Time select should appear
    await waitFor(() => {
      expect(screen.getByLabelText("Choisissez un horaire :")).toBeInTheDocument();
    });

    const timeSelect = screen.getByLabelText("Choisissez un horaire :") as HTMLSelectElement;

    // 2. Select 18:00 (which is valid on Tuesday but NOT on Saturday)
    fireEvent.change(timeSelect, { target: { value: "18:00" } });
    expect(timeSelect.value).toBe("18:00");

    // Form should be visible
    expect(screen.getByText("Vos coordonnées")).toBeInTheDocument();

    // 3. Change date to Saturday 2026-11-07
    fireEvent.change(dateSelect, { target: { value: "2026-11-07" } });
    expect(dateSelect.value).toBe("2026-11-07");

    // The time select should now only offer 10:00 and 14:00
    const timeOptions = Array.from(screen.getByLabelText("Choisissez un horaire :").querySelectorAll("option"))
      .map(o => o.value)
      .filter(Boolean);
    expect(timeOptions).toEqual(["10:00", "14:00"]);

    // 18:00 must be CLEARED because it is not available on Saturday
    const updatedTimeSelect = screen.getByLabelText("Choisissez un horaire :") as HTMLSelectElement;
    expect(updatedTimeSelect.value).toBe("");

    // Form should be hidden since no valid time is selected
    expect(screen.queryByText("Vos coordonnées")).not.toBeInTheDocument();
  });

  it("should preserve previously selected time when switching to a date where that time IS available", async () => {
    render(<VisioBooking language="fr" content={defaultContent.contactPage.visioBooking} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Choisissez une date :")).toBeInTheDocument();
    });

    const dateSelect = screen.getByLabelText("Choisissez une date :") as HTMLSelectElement;

    // 1. Select Tuesday
    fireEvent.change(dateSelect, { target: { value: "2026-11-03" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Choisissez un horaire :")).toBeInTheDocument();
    });

    const timeSelect = screen.getByLabelText("Choisissez un horaire :") as HTMLSelectElement;

    // 2. Select 10:00 (which is valid on BOTH Tuesday and Saturday)
    fireEvent.change(timeSelect, { target: { value: "10:00" } });
    expect(timeSelect.value).toBe("10:00");

    // 3. Change date to Saturday 2026-11-07
    fireEvent.change(dateSelect, { target: { value: "2026-11-07" } });

    // 10:00 must be PRESERVED because it is available on Saturday
    const updatedTimeSelect = screen.getByLabelText("Choisissez un horaire :") as HTMLSelectElement;
    expect(updatedTimeSelect.value).toBe("10:00");

    // Form should remain visible
    expect(screen.getByText("Vos coordonnées")).toBeInTheDocument();
  });
});
