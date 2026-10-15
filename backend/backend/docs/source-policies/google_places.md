# Source policy: Google Places (Places API New)

* Integration: official REST API only (`places:searchText`, `places/{id}`). No scraping of Google Maps pages.
* Field mask: only the fields the product uses. Requesting contact fields (phone, website) changes the billing SKU, so keep the mask minimal.
* Storage / caching: Google restricts prefetching, caching and storing Places content, with an exception for Place IDs.
  The platform stores the Place ID indefinitely and treats all other Google content as time-limited
  (`GOOGLE_RETENTION_DAYS`, default 30). When the window passes, the maintenance worker purges cached content from that source and flags the
  record "needs refresh"; users can re-check it by Place ID.
* Attribution: when Places data is shown without a Google map, Google attribution is still required. The UI shows "Powered by Google"
  next to Google-derived records and in the export's "About this export" sheet.
* Budget: `api_usage` records every request with an estimated cost; the workspace has a monthly budget that blocks new paid searches.
* **Action required before production:** legal/engineering review of the current Google Maps Platform Terms of Service and the product-specific
  policies. The defaults here are conservative placeholders, not legal advice.
