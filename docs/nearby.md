# Nearby discovery and pickup coordinates

The buyer's `/nearby` page searches approved cafés and available offers. A café owner marks the pickup entrance on a map or enters numeric coordinates in the profile editor. The point belongs to the same revision as descriptions, hours and gallery photos: saving an edit makes the café pending, and public discovery resumes after an administrator approves that exact snapshot. Moderation history keeps earlier points. An explicit `location: null` removes a point; older clients that omit the optional property preserve an existing point.

## Public search

`POST /api/nearby/search` is an uncached, same-origin public JSON endpoint. The exact body is `{center, radiusKm, search, kind}`. `center` is null or `{latitude, longitude}`; radius is null or 1–50 km and requires a center. Search is a literal string of at most 100 characters. Kind is `all`, `specific_item` or `surprise_bag`.

The result is `{venues, unlocated, serverNow, truncated}`. Each item has `{venue, offers, distanceKm}`. The public venue DTO has an explicit nullable location and excludes private application contacts. Offers must be currently published, have stock and have a pickup end after server time. With `kind: all`, a café without an available offer may still be discovered. Other kinds require a matching available offer. Name, address and titles in all three languages are searched. Filters and distance ranking run before the combined 500-venue response cap; a truncated response asks the buyer to refine the search.

The server computes a great-circle distance from validated numeric coordinates, including the international date line, then rounds the displayed result to 0.01 km. Radius checks use the unrounded distance. Ties have a stable venue ID order. This is a straight-line distance, not a walking route. Ordinary catalogue/offer DTOs have `distanceKm: null`; legacy database constants are no longer presented as the visitor's distance.

Unlocated or malformed legacy points remain in a separate `unlocated` list. They are excluded from distance/radius claims and are never assigned guessed coordinates from an address. Existing seed profiles are preserved without retrofitting pins. Coordinates must be finite numbers with latitude within ±85.05112878 (the map projection limit) and longitude within ±180; zero coordinates are valid.

## Browser and privacy

The buyer can move the map and explicitly search its current area. “Locate me” requests one browser position only after a click, rounds it to four decimal places, and uses it for the search. The application does not put visitor coordinates in the profile, URL, browser storage or database. The public search uses POST so coordinates are not query parameters. Permissions denied, unsupported positions and timeouts provide a manual map-area fallback. Cancelled or unmounted requests ignore late geolocation callbacks. The browser request does not continuously track position.

Search requests use abort controllers and a request identity; an old response cannot replace the current filter result. Markers and result cards select the same café. List/addresses remain usable when the map library or map background fails. Keyboard pan and localized zoom buttons are supported. Café input can also use decimal coordinate fields when tiles are unavailable.

Leaflet 1.9.4 is bundled locally and initialized only in a client effect when the map becomes visible. Hidden moderation snapshots do not fetch map tiles. Browsers without IntersectionObserver require an explicit Open map click. Map instances, observers and marker layers are cleaned up on unmount. Business names enter tooltips as DOM text, never HTML. Tile requests use HTTPS, a visible OpenStreetMap attribution, the browser's normal cache and an origin-only cross-site referrer. There is no tile proxy, offline downloader, geocoder or background prefetch.

OpenStreetMap tile service is best-effort and can be replaced for a commercial release; its [usage policy](https://operations.osmfoundation.org/policies/tiles/) sets caching, attribution and traffic requirements. Leaflet's [stable release](https://leafletjs.com/download.html) and [API reference](https://leafletjs.com/reference.html) describe the client integration. A directions link uses the public café destination in [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started); the app does not include the buyer's origin in that link. Directions are opened only when the visitor chooses that link.

## Verification

Automated geometry, input, discovery/moderation and route checks are in `tests/nearby.test.ts`; browser geolocation behavior is exercised with isolated callback providers in `tests/nearby-geolocation.test.ts`. Directions URL boundaries and RU/KK/EN dictionaries are checked separately. Live API/browser results and device limitations are recorded in [verification](verification.md). Real device GPS and public HTTPS deployment checks remain part of release testing.
