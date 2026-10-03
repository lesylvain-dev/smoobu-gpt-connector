import { assertConnectorAuth, sendError, smoobuRequest } from './_lib/smoobu.js';

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseDate(value) {
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 86400000));
}

function clipNights(arrival, departure, rangeStart, rangeEndExclusive) {
  const a = parseDate(arrival);
  const d = parseDate(departure);
  if (!a || !d) return 0;
  const start = a > rangeStart ? a : rangeStart;
  const end = d < rangeEndExclusive ? d : rangeEndExclusive;
  return daysBetween(start, end);
}

function add(map, key, value) {
  const label = key || 'Unknown';
  map[label] = (map[label] || 0) + value;
}

export default async function handler(req, res) {
  try {
    assertConnectorAuth(req);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { from, to, apartmentId } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });
    }

    const rangeStart = parseDate(from);
    const rangeEnd = parseDate(to);
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    const rangeEndExclusive = new Date(rangeEnd.getTime() + 86400000);
    const periodDays = daysBetween(rangeStart, rangeEndExclusive);

    const bookings = [];
    let page = 1;
    let pageCount = 1;

    do {
      const data = await smoobuRequest('/api/reservations', {
        query: {
          from,
          to,
          apartmentId,
          excludeBlocked: true,
          showCancellation: false,
          page,
          pageSize: 100,
        },
      });

      bookings.push(...(Array.isArray(data?.bookings) ? data.bookings : []));
      pageCount = Number(data?.page_count || 1);
      page += 1;
    } while (page <= pageCount);

    const validBookings = bookings.filter((b) =>
      b && b.type !== 'cancellation' && b['is-blocked-booking'] !== true
    );

    let grossRevenue = 0;
    let bookedNights = 0;
    const byApartment = {};
    const byChannel = {};
    const byMonth = {};
    const apartmentNames = new Set();

    for (const booking of validBookings) {
      const amount = Number(booking.price);
      const nights = clipNights(
        booking.arrival,
        booking.departure,
        rangeStart,
        rangeEndExclusive
      );

      if (Number.isFinite(amount)) {
        grossRevenue += amount;
        add(byApartment, booking.apartment?.name, amount);
        add(byChannel, booking.channel?.name, amount);
        add(byMonth, String(booking.arrival || '').slice(0, 7), amount);
      }

      bookedNights += nights;
      if (booking.apartment?.name) apartmentNames.add(booking.apartment.name);
    }

    let apartmentCount = apartmentNames.size;
    if (!apartmentId) {
      try {
        const apartmentsData = await smoobuRequest('/api/apartments');
        const list = Array.isArray(apartmentsData?.apartments)
          ? apartmentsData.apartments
          : Array.isArray(apartmentsData)
            ? apartmentsData
            : [];
        if (list.length) apartmentCount = list.length;
      } catch {
        // Keep the apartment count inferred from bookings if apartment lookup fails.
      }
    } else {
      apartmentCount = 1;
    }

    const availableNights = periodDays * apartmentCount;
    const occupancyRate = availableNights > 0 ? (bookedNights / availableNights) * 100 : null;
    const adr = bookedNights > 0 ? grossRevenue / bookedNights : null;
    const bookingCount = validBookings.length;

    res.status(200).json({
      period: { from, to, days: periodDays },
      apartmentId: apartmentId ? Number(apartmentId) : null,
      grossRevenue: round(grossRevenue),
      bookingCount,
      averageBookingValue: bookingCount ? round(grossRevenue / bookingCount) : 0,
      bookedNights,
      apartmentCount,
      occupancyRate: occupancyRate === null ? null : round(occupancyRate),
      averageDailyRate: adr === null ? null : round(adr),
      byApartment: Object.fromEntries(
        Object.entries(byApartment).map(([k, v]) => [k, round(v)])
      ),
      byChannel: Object.fromEntries(
        Object.entries(byChannel).map(([k, v]) => [k, round(v)])
      ),
      byMonth: Object.fromEntries(
        Object.entries(byMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, round(v)])
      ),
      notes: [
        'Revenue is gross booking revenue from Smoobu reservation prices.',
        'Occupancy is calculated from booked nights divided by apartment nights in the requested period.',
        'Channel commissions and payout differences are not deducted.'
      ]
    });
  } catch (error) {
    sendError(res, error);
  }
}
