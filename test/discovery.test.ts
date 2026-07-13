import assert from "node:assert/strict";
import test from "node:test";
import { discoverReleases } from "../src/discovery/npm.js";

test("release discovery orders registry timestamps and resumes after a version", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        "dist-tags": { latest: "2.1.3" },
        time: {
          created: "2025-01-01T00:00:00Z",
          "2.1.2": "2026-01-02T00:00:00Z",
          "2.1.1": "2026-01-01T00:00:00Z",
          "2.1.3": "2026-01-03T00:00:00Z",
        },
      }),
      { status: 200 },
    );
  const result = await discoverReleases("2.1.1", fetcher);
  assert.equal(result.latestVersion, "2.1.3");
  assert.deepEqual(result.publishedVersions, ["2.1.2", "2.1.3"]);
  assert.equal(result.analysisVersion, "2.1.3");
  assert.deepEqual(result.supersededVersions, ["2.1.2"]);
});

test("release discovery does not re-analyze the latest version after it is baselined", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        "dist-tags": { latest: "2.1.3" },
        time: {
          "2.1.3": "2026-01-03T00:00:00Z",
          "2.1.4-beta.1": "2026-01-04T00:00:00Z",
        },
      }),
      { status: 200 },
    );
  const result = await discoverReleases("2.1.3", fetcher);
  assert.deepEqual(result.publishedVersions, ["2.1.4-beta.1"]);
  assert.equal(result.analysisVersion, undefined);
  assert.deepEqual(result.supersededVersions, ["2.1.4-beta.1"]);
});

test("release discovery fails when latest is absent", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ "dist-tags": {}, time: {} }), {
      status: 200,
    });
  await assert.rejects(
    discoverReleases(undefined, fetcher),
    /dist-tags.latest/,
  );
});

test("release discovery fails closed when its baseline is unknown", async () => {
  const response = new Response(
    JSON.stringify({
      "dist-tags": { latest: "2.1.207" },
      time: { "2.1.207": "2026-07-13T00:00:00.000Z" },
    }),
  );
  await assert.rejects(
    discoverReleases("0.0.0", async () => response),
    /Baseline version 0\.0\.0 is absent/,
  );
});
