# Source policy: OpenStreetMap (Nominatim + Overpass)

* Licence: ODbL. Keep the attribution "© OpenStreetMap contributors" with displayed and exported data; derived databases are share-alike.
* Usage: public Nominatim/Overpass servers are shared infrastructure. The adapter sends an identifying User-Agent (`OSM_CONTACT`),
  makes one geocoding call and one feature query per search and waits between calls. For heavy use, run your own instance.
* Coverage varies: many businesses in Sri Lanka have no phone or website in OSM. Missing values stay NULL.
