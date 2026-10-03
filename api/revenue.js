import { assertConnectorAuth, sendError, smoobuRequest } from './_lib/smoobu.js';

function addAmount(map, key, amount) {
  const label = key || 'Unknown';
  map[label] = (map[label] || 0) + amount;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default async function handler(req, res) {
  try {
    assertConnectorAuth(req);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { from, to, apartmentId } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });
    }

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

      const current = Array.isArray(data?.bookings) ? data.bookings : [];
      bookings.push(...current);
      pageCount = Number(data?.page_count || 1);
      page += 1;
    } while (page <= pageCount);

    const validBookings = bookings.filter((booking) =>
      booking &&
      booking.type !== 'cancellation' &&
      booking['is-blocked-booking'] !== true
    );

    let grossRevenue = 0;
    const byApartment = {};
    const byChannel = {};
    const byMonth = {};

    for (const booking of validBookings) {
      const amount = Number(booking.price);
      if (!Number.isFinite(amount)) continue;

      grossRevenue += amount;
      addAmount(byApartment, booking.apartment?.name, amount);
      addAmount(byChannel, booking.channel?.name, amount);
      addAmount(byMonth, String(booking.arrival || '').slice(0, 7), amount);
    }

    const bookingCount = validBookings.length;

    res.status(200).json({
      period: { from, to },
      apartmentId: apartmentId ? Number(apartmentId) : null,
      grossRevenue: roundMoney(grossRevenue),
      bookingCount,
      averageBookingValue: bookingCount ? roundMoney(grossRevenue / bookingCount) : 0,
      byApartment: Object.fromEntries(
        Object.entries(byApartment).map(([k, v]) => [k, roundMoney(v)])
      ),
      byChannel: Object.fromEntries(
        Object.entries(byChannel).map(([k, v]) => [k, roundMoney(v)])
      ),
      byMonth: Object.fromEntries(
        Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, roundMoney(v)])
      ),
      note: 'Gross booking revenue from Smoobu reservation prices; channel commissions/payout differences are not deducted.',
    });
  } catch (error) {
    sendError(res, error);
  }
}
