const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chooseCity,
  chooseDistrict,
  chooseProvince,
  createLatestRequestGate,
  filterServiceLocations,
  getCompletedLocation,
} = require("../../../../.test-build/features/locations/location-cascade-state.js");

const istanbul = {
  id: 1,
  parent_id: null,
  code: "tr-istanbul",
  name: "Istanbul",
  level: "province",
};
const istanbulCity = {
  id: 2,
  parent_id: 1,
  code: "tr-istanbul-city",
  name: "Istanbul",
  level: "city",
};
const kadikoy = {
  id: 3,
  parent_id: 2,
  code: "tr-istanbul-city-kadikoy",
  name: "Kadikoy",
  level: "district",
};
const ankara = { ...istanbul, id: 4, code: "tr-ankara", name: "Ankara" };

test("choosing a province clears the previous city and district", () => {
  const current = {
    province: istanbul,
    city: istanbulCity,
    district: kadikoy,
  };

  assert.deepEqual(chooseProvince(current, ankara), {
    province: ankara,
    city: null,
    district: null,
  });
});

test("choosing a city clears the previous district", () => {
  const current = {
    province: istanbul,
    city: istanbulCity,
    district: kadikoy,
  };
  const ankaraCity = {
    ...istanbulCity,
    id: 5,
    parent_id: ankara.id,
    code: "tr-ankara-city",
    name: "Ankara",
  };

  assert.deepEqual(chooseCity(chooseProvince(current, ankara), ankaraCity), {
    province: ankara,
    city: ankaraCity,
    district: null,
  });
});

test("a completed cascade stores the district id and province name", () => {
  const completed = chooseDistrict(
    { province: istanbul, city: istanbulCity, district: null },
    kadikoy,
  );

  assert.deepEqual(getCompletedLocation(completed), {
    serviceLocationId: kadikoy.id,
    serviceProvince: istanbul.name,
    label: "Istanbul / Istanbul / Kadikoy",
  });
});

test("province or city selections alone cannot be submitted", () => {
  assert.equal(
    getCompletedLocation({
      province: istanbul,
      city: istanbulCity,
      district: null,
    }),
    null,
  );
});

test("location search filters names and codes case-insensitively", () => {
  const locations = [istanbul, ankara];

  assert.deepEqual(filterServiceLocations(locations, "ANK"), [ankara]);
  assert.deepEqual(filterServiceLocations(locations, "tr-istan"), [istanbul]);
  assert.deepEqual(filterServiceLocations(locations, "İSTANBUL"), [istanbul]);
  assert.deepEqual(filterServiceLocations(locations, "ıstanbul"), [istanbul]);
  assert.deepEqual(filterServiceLocations(locations, "   "), locations);
});

test("only the latest asynchronous location request stays current", () => {
  const gate = createLatestRequestGate();
  const firstRequest = gate.begin();
  const secondRequest = gate.begin();

  assert.equal(gate.isLatest(firstRequest), false);
  assert.equal(gate.isLatest(secondRequest), true);

  gate.invalidate();
  assert.equal(gate.isLatest(secondRequest), false);
});
