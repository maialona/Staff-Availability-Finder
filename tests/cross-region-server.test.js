import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCrossRegionDistances,
} from "../server/cross-region.mjs";

const okJson = (payload) => ({
  ok: true,
  async json() {
    return payload;
  },
});

test("resolveCrossRegionDistances requires a Google Maps API key", async () => {
  await assert.rejects(
    () =>
      resolveCrossRegionDistances({
        addresses: ["臺南市東區小東路1號", "臺南市南區大同路2號"],
        pairs: [{ id: "p1", originAddress: "臺南市東區小東路1號", destinationAddress: "臺南市南區大同路2號" }],
        apiKey: "",
        fetchImpl: async () => okJson({}),
        cache: { geocodes: {}, routes: {} },
      }),
    /Missing GOOGLE_MAPS_API_KEY/,
  );
});

test("resolveCrossRegionDistances geocodes addresses and returns route distances", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });

    if (String(url).startsWith("https://maps.googleapis.com/maps/api/geocode/json")) {
      const address = new URL(String(url)).searchParams.get("address");
      return okJson({
        status: "OK",
        results: [
          {
            formatted_address: address,
            place_id: `${address}-place`,
            geometry: {
              location: address.includes("小東") ? { lat: 22.99, lng: 120.22 } : { lat: 22.95, lng: 120.18 },
            },
          },
        ],
      });
    }

    assert.equal(String(url), "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-Goog-Api-Key"], "test-key");
    assert.match(options.headers["X-Goog-FieldMask"], /distanceMeters/);
    const body = JSON.parse(options.body);
    assert.equal(body.travelMode, "DRIVE");
    assert.equal(body.origins.length, 1);
    assert.equal(body.destinations.length, 1);
    assert.deepEqual(body.origins[0].waypoint.location.latLng, {
      latitude: 22.99,
      longitude: 120.22,
    });
    assert.deepEqual(body.destinations[0].waypoint.location.latLng, {
      latitude: 22.95,
      longitude: 120.18,
    });

    return okJson([
      {
        originIndex: 0,
        destinationIndex: 0,
        status: {},
        distanceMeters: 16321,
        duration: "1820s",
      },
    ]);
  };

  const result = await resolveCrossRegionDistances({
    addresses: ["臺南市東區小東路1號", "臺南市南區大同路2號"],
    pairs: [{ id: "p1", originAddress: "臺南市東區小東路1號", destinationAddress: "臺南市南區大同路2號" }],
    apiKey: "test-key",
    fetchImpl,
    cache: { geocodes: {}, routes: {} },
  });

  assert.equal(result.results.p1.status, "ok");
  assert.equal(result.results.p1.distanceMeters, 16321);
  assert.equal(result.results.p1.distanceKm, 16.32);
  assert.equal(result.results.p1.durationSeconds, 1820);
  assert.equal(calls.length, 3);
});

test("resolveCrossRegionDistances treats same geocode location as zero-distance without routes", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));

    assert.ok(String(url).startsWith("https://maps.googleapis.com/maps/api/geocode/json"));
    const address = new URL(String(url)).searchParams.get("address");
    return okJson({
      status: "OK",
      results: [
        {
          formatted_address: address,
          place_id: `${address}-place`,
          geometry: {
            location: { lat: 23.001, lng: 120.2 },
          },
        },
      ],
    });
  };

  const result = await resolveCrossRegionDistances({
    addresses: ["same-building-floor-1", "same-building-floor-2"],
    pairs: [
      {
        id: "same-location",
        originAddress: "same-building-floor-1",
        destinationAddress: "same-building-floor-2",
      },
    ],
    apiKey: "test-key",
    fetchImpl,
    cache: { geocodes: {}, routes: {} },
  });

  assert.equal(result.results["same-location"].status, "ok");
  assert.equal(result.results["same-location"].distanceMeters, 0);
  assert.equal(calls.length, 2);
});
