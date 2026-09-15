from pathlib import Path
import re

path = Path('/home/ubuntu/evently/client/src/pages/Evently.tsx')
text = path.read_text()
text = text.replace('import { useTheme } from "@/contexts/ThemeContext";\n', 'import { useTheme } from "@/contexts/ThemeContext";\nimport { useAuth } from "@/_core/hooks/useAuth";\n')
text = text.replace('export type TicketTier = { name: string; price: number; description: string; available: number };', 'export type TicketTier = { id?: number; name: string; price: number; description: string; available: number };')
text = text.replace('  id: string;\n  title: string;', '  id: string;\n  serverId?: number;\n  title: string;', 1)
text = text.replace('  eventId: string;\n  eventTitle: string;', '  eventId: string;\n  eventTitle: string;', 1)

text, count = re.subn(r'const DEFAULT_EVENTS: EventItem\[\] = \[.*?\n\];\n\n', '', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit('DEFAULT_EVENTS block not found')

old = '''const createDemoPassId = () => `EVT_PASS_${crypto.randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
const passesForBooking = (booking: Booking): TicketPass[] => booking.passes ?? Array.from({ length: booking.quantity }, (_, index) => ({ passId: `${booking.id}-PASS-${index + 1}`, bookingId: booking.id, eventId: booking.eventId, status: "ACTIVE" as const }));

function useEventStore() {
  const [events, setEvents] = useState<EventItem[]>(() => {
    try {
      const stored = localStorage.getItem("evently-events");
      return stored ? JSON.parse(stored) : DEFAULT_EVENTS;
    } catch { return DEFAULT_EVENTS; }
  });
  const [bookings, setBookings] = useState<Booking[]>(() => {
    try {
      const stored = localStorage.getItem("evently-bookings");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const saveBookings = (next: Booking[]) => { setBookings(next); localStorage.setItem("evently-bookings", JSON.stringify(next)); };
  const saveEvents = (next: EventItem[]) => { setEvents(next); localStorage.setItem("evently-events", JSON.stringify(next)); };
  return { events, bookings, saveBookings, saveEvents };
}
'''
new = '''const mapServerEvent = (event: any): EventItem => {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  const time = `${startsAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} – ${endsAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
  const tickets = (event.tickets ?? []).map((ticket: any) => ({ id: ticket.id, name: ticket.name, price: Math.round(ticket.priceMinor / 100), description: ticket.description ?? "", available: ticket.available }));
  return {
    id: event.slug,
    serverId: event.id,
    title: event.title,
    category: event.category,
    date: startsAt.toISOString().slice(0, 10),
    time,
    location: event.location,
    venue: event.venue,
    image: event.imageUrl ?? "",
    price: tickets[0]?.price ?? 0,
    attendees: "0",
    remaining: tickets.reduce((sum: number, ticket: TicketTier) => sum + ticket.available, 0),
    organizer: "Event organizer",
    organizerRole: "Verified organizer",
    description: event.description,
    gradient: "from-violet-500/80 via-indigo-500/40 to-transparent",
    featured: false,
    paymentUpi: event.paymentUpi ?? undefined,
    paymentWhatsapp: event.paymentWhatsapp ?? undefined,
    ticketTheme: event.ticketTheme ?? undefined,
    tickets,
  };
};

function useEventStore() {
  const auth = useAuth();
  const publicEventsQuery = trpc.events.list.useQuery();
  const organizerEventsQuery = trpc.events.mine.useQuery(undefined, { enabled: auth.user?.role === "organizer" || auth.user?.role === "admin", retry: false });
  const bookingsQuery = trpc.bookings.mine.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const passesQuery = trpc.ticketPasses.mine.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const events = useMemo(() => (publicEventsQuery.data ?? []).map(mapServerEvent), [publicEventsQuery.data]);
  const organizerEvents = useMemo(() => (organizerEventsQuery.data ?? []).map(mapServerEvent), [organizerEventsQuery.data]);
  const bookings = useMemo(() => (bookingsQuery.data ?? []).map((row: any) => ({
    id: row.booking.bookingCode,
    eventId: row.event.slug,
    eventTitle: row.event.title,
    date: new Date(row.event.startsAt).toISOString().slice(0, 10),
    location: row.event.location,
    ticket: row.ticket.name,
    quantity: row.booking.quantity,
    total: Math.round(row.ticket.priceMinor * row.booking.quantity / 100),
    attendee: row.booking.attendeeName,
    email: row.booking.attendeeEmail,
    paymentStatus: row.booking.status === "confirmed" ? "PAID" : "PENDING",
    passes: (passesQuery.data ?? []).filter((item: any) => item.booking.id === row.booking.id).map((item: any) => ({ passId: item.pass.passId, bookingId: row.booking.bookingCode, eventId: row.event.slug, status: item.pass.status })),
  } as Booking)), [bookingsQuery.data, passesQuery.data]);
  const saveBookings = () => { void bookingsQuery.refetch(); void passesQuery.refetch(); };
  const saveEvents = () => { void publicEventsQuery.refetch(); void organizerEventsQuery.refetch(); };
  return { events, organizerEvents, bookings, saveBookings, saveEvents, loading: publicEventsQuery.isLoading || bookingsQuery.isLoading };
}
'''
if old not in text:
    raise SystemExit('old store block not found')
text = text.replace(old, new)
path.write_text(text)
