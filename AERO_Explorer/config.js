// PUBLIC browser configuration. Never put a server/API secret in this file.
// Maps keys need Google Cloud website-referrer and API restrictions, plus billing.
globalThis.AERO_CONFIG=Object.freeze({
 googleMapsKey:'',
 googleEmbedKey:'',
 // Default map uses ordinary visible tiles. For high traffic, configure a provider with suitable capacity.
 mapMode:'tiles',
 mapTileURL:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
 mapAttribution:'© OpenStreetMap contributors',
 mapAttributionURL:'https://www.openstreetmap.org/copyright',
 autoLocate:true,
 weatherEndpoint:'',
 autoNearby:true,
 initialOrigin:{lat:22.64954,lon:120.35363,altitude:20},
});
