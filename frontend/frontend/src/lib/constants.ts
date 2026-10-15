export const CATEGORY_SUGGESTIONS = [
  'Bookshop', 'Salon', 'Restaurant', 'Cafe', 'Hotel', 'School', 'Pharmacy', 'Garage', 'Supermarket',
  'Clothing store', 'Electronics store', 'Gym', 'Clinic', 'Bakery',
];

export const LOCATION_SUGGESTIONS = [
  'Malabe', 'Colombo 07', 'Nugegoda', 'Dehiwala', 'Rajagiriya', 'Battaramulla', 'Kandy', 'Galle', 'Negombo',
  'Jaffna', 'Kurunegala', 'Matara', 'Gampaha', 'Kottawa', 'Maharagama', 'Moratuwa',
];

export const SOURCE_LABELS: Record<string, string> = { google_places: 'Google', osm: 'OpenStreetMap', demo: 'Demo', website: 'Website' };

export const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Waiting to start', RUNNING: 'Starting', COLLECTING: 'Finding businesses', NORMALIZING: 'Cleaning up details',
  DEDUPLICATING: 'Removing duplicates', ENRICHING: 'Looking for websites and social pages', COMPLETED: 'Done',
  RETRYING: 'Retrying', FAILED: 'Failed', CANCEL_REQUESTED: 'Stopping', CANCELLED: 'Cancelled',
};

export const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];
export const FLAG_LABEL: Record<string, string> = {
  possible_duplicate: 'Possible duplicate', needs_refresh: 'Needs refresh', phone_format: 'Check phone number', url_format: 'Check website address',
};
