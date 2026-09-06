export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'Smoobu GPT Connector',
      version: '1.0.1',
      description: 'Read-only connector between a custom GPT and Smoobu.'
    },
    servers: [{ url: 'https://smoobu-gpt-connector.vercel.app' }],
    security: [{ ConnectorKey: [] }],
    components: {
      schemas: {},
      securitySchemes: {
        ConnectorKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-connector-key'
        }
      }
    },
    paths: {
      '/api/health': {
        get: {
          operationId: 'healthCheck',
          summary: 'Check whether the connector is online',
          security: [],
          responses: { '200': { description: 'Connector status' } }
        }
      },
      '/api/apartments': {
        get: {
          operationId: 'listApartments',
          summary: 'List Smoobu apartments',
          responses: { '200': { description: 'Apartments from Smoobu' } }
        }
      },
      '/api/reservations': {
        get: {
          operationId: 'listReservations',
          summary: 'Get reservations and booking data',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Date range start, YYYY-MM-DD' },
            { name: 'to', in: 'query', schema: { type: 'string' }, description: 'Date range end, YYYY-MM-DD' },
            { name: 'created_from', in: 'query', schema: { type: 'string' } },
            { name: 'created_to', in: 'query', schema: { type: 'string' } },
            { name: 'modifiedFrom', in: 'query', schema: { type: 'string' } },
            { name: 'apartmentId', in: 'query', schema: { type: 'integer' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'pageSize', in: 'query', schema: { type: 'integer' } }
          ],
          responses: { '200': { description: 'Reservations from Smoobu' } }
        }
      },
      '/api/messages': {
        get: {
          operationId: 'getReservationMessages',
          summary: 'Get the conversation for one reservation',
          parameters: [
            { name: 'reservationId', in: 'query', required: true, schema: { type: 'integer' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'onlyRelatedToGuest', in: 'query', schema: { type: 'boolean' } }
          ],
          responses: { '200': { description: 'Messages for the reservation' } }
        }
      },
      '/api/rates': {
        get: {
          operationId: 'getRates',
          summary: 'Get rates and availability for apartments over a date range',
          parameters: [
            { name: 'start_date', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
            { name: 'end_date', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
            { name: 'apartments', in: 'query', required: true, schema: { type: 'string' }, description: 'One apartment ID or comma-separated apartment IDs' }
          ],
          responses: { '200': { description: 'Rates and availability from Smoobu' } }
        }
      }
    }
  });
}
