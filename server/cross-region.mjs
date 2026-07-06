import fs from "node:fs/promises";
import path from "node:path";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const DEFAULT_CACHE_PATH = path.resolve(process.cwd(), ".cache", "cross-region-distances.json");

const roundKm = (meters) => Math.round((Number(meters) / 1000) * 100) / 100;

const parseDurationSeconds = (value) => {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : null;
};

const createEmptyCache = () => ({
  geocodes: {},
  routes: {},
});

export async function readCrossRegionCache(cachePath = DEFAULT_CACHE_PATH) {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    return { ...createEmptyCache(), ...JSON.parse(raw) };
  } catch {
    return createEmptyCache();
  }
}

export async function writeCrossRegionCache(cache, cachePath = DEFAULT_CACHE_PATH) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

const geocodeAddress = async ({ address, apiKey, fetchImpl, cache }) => {
  if (cache.geocodes[address]) return cache.geocodes[address];

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("region", "tw");
  url.searchParams.set("language", "zh-TW");
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url);
  const payload = await response.json();

  if (!response.ok || payload.status !== "OK" || !payload.results?.[0]?.geometry?.location) {
    const result = {
      status: "error",
      error: payload.error_message || payload.status || "Geocode failed",
    };
    cache.geocodes[address] = result;
    return result;
  }

  const first = payload.results[0];
  const result = {
    status: "ok",
    address,
    formattedAddress: first.formatted_address || address,
    placeId: first.place_id || "",
    location: {
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
    },
  };
  cache.geocodes[address] = result;
  return result;
};

const buildRouteKey = (originAddress, destinationAddress) =>
  `${originAddress}__TO__${destinationAddress}`;

const toRouteLatLng = (location) => ({
  latitude: location.lat,
  longitude: location.lng,
});

const isSameLocation = (origin, destination) =>
  Number(origin?.location?.lat) === Number(destination?.location?.lat) &&
  Number(origin?.location?.lng) === Number(destination?.location?.lng);

const getRouteMatrix = async ({
  origin,
  destinations,
  apiKey,
  fetchImpl,
}) => {
  const response = await fetchImpl(ROUTE_MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "originIndex,destinationIndex,status,distanceMeters,duration",
    },
    body: JSON.stringify({
      origins: [
        {
          waypoint: {
            location: {
              latLng: toRouteLatLng(origin.location),
            },
          },
        },
      ],
      destinations: destinations.map((destination) => ({
        waypoint: {
          location: {
            latLng: toRouteLatLng(destination.location),
          },
        },
      })),
      travelMode: "DRIVE",
      units: "METRIC",
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Route matrix request failed");
  }
  return Array.isArray(payload) ? payload : [];
};

export async function resolveCrossRegionDistances({
  addresses = [],
  pairs = [],
  apiKey = process.env.GOOGLE_MAPS_API_KEY,
  fetchImpl = fetch,
  cache = null,
}) {
  if (!apiKey) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY");
  }

  const activeCache = cache || createEmptyCache();
  const geocodes = {};

  for (const address of [...new Set(addresses.filter(Boolean))]) {
    geocodes[address] = await geocodeAddress({
      address,
      apiKey,
      fetchImpl,
      cache: activeCache,
    });
  }

  const unresolvedByOrigin = new Map();
  const results = {};

  pairs.forEach((pair) => {
    const key = buildRouteKey(pair.originAddress, pair.destinationAddress);
    const origin = geocodes[pair.originAddress];
    const destination = geocodes[pair.destinationAddress];

    if (activeCache.routes[key]) {
      results[pair.id] = activeCache.routes[key];
      return;
    }

    if (origin?.status !== "ok" || destination?.status !== "ok") {
      results[pair.id] = {
        status: "error",
        error: origin?.error || destination?.error || "Address geocoding failed",
      };
      return;
    }

    if (isSameLocation(origin, destination)) {
      const zeroDistance = {
        status: "ok",
        distanceMeters: 0,
        distanceKm: 0,
        durationSeconds: 0,
      };
      activeCache.routes[key] = zeroDistance;
      results[pair.id] = zeroDistance;
      return;
    }

    if (!unresolvedByOrigin.has(pair.originAddress)) {
      unresolvedByOrigin.set(pair.originAddress, []);
    }
    unresolvedByOrigin.get(pair.originAddress).push(pair);
  });

  for (const [originAddress, originPairs] of unresolvedByOrigin.entries()) {
    const origin = geocodes[originAddress];
    const destinationAddresses = [...new Set(originPairs.map((pair) => pair.destinationAddress))];

    for (let index = 0; index < destinationAddresses.length; index += 625) {
      const chunk = destinationAddresses.slice(index, index + 625);
      const destinations = chunk.map((address) => ({
        address,
        ...geocodes[address],
      }));
      const matrix = await getRouteMatrix({
        origin,
        destinations,
        apiKey,
        fetchImpl,
      });

      matrix.forEach((route) => {
        const destination = destinations[route.destinationIndex];
        if (!destination) return;
        const routeKey = buildRouteKey(originAddress, destination.address);
        const isOk = !route.status?.code && Number.isFinite(Number(route.distanceMeters));
        activeCache.routes[routeKey] = isOk
          ? {
              status: "ok",
              distanceMeters: Number(route.distanceMeters),
              distanceKm: roundKm(route.distanceMeters),
              durationSeconds: parseDurationSeconds(route.duration),
            }
          : {
              status: "error",
              error: route.status?.message || "Route matrix element failed",
            };
      });
    }

    originPairs.forEach((pair) => {
      const key = buildRouteKey(pair.originAddress, pair.destinationAddress);
      results[pair.id] =
        activeCache.routes[key] || { status: "error", error: "Route result missing" };
    });
  }

  return {
    results,
    geocodes,
    cache: activeCache,
  };
}

export async function resolveCrossRegionDistancesWithFileCache({
  addresses = [],
  pairs = [],
  apiKey = process.env.GOOGLE_MAPS_API_KEY,
  fetchImpl = fetch,
  cachePath = DEFAULT_CACHE_PATH,
}) {
  const cache = await readCrossRegionCache(cachePath);
  const result = await resolveCrossRegionDistances({
    addresses,
    pairs,
    apiKey,
    fetchImpl,
    cache,
  });
  await writeCrossRegionCache(result.cache, cachePath);
  return result;
}
