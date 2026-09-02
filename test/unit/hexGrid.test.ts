import { describe, expect, it } from "vitest";
import {
  axialToLatLon,
  latLonToAxial,
  getAxialDistance,
  getHexCell,
  getHexNeighbors,
  listHexCellsInBounds,
} from "../../src/domain/hexGrid.js";

describe("hexGrid domain", () => {
  it("axial coordinate conversions round-trip accurately", () => {
    const originAxial = { q: 5, r: 35 };
    const latLon = axialToLatLon(originAxial.q, originAxial.r);
    const backToAxial = latLonToAxial(latLon.latitude, latLon.longitude);
    expect(backToAxial.q).toBe(originAxial.q);
    expect(backToAxial.r).toBe(originAxial.r);
  });

  it("axial distance calculation computes correct neighbor step distance", () => {
    const c1 = { q: 5, r: 35 };
    const c2 = { q: 6, r: 35 };
    const c3 = { q: 5, r: 36 };
    const c4 = { q: 8, r: 38 };
    expect(getAxialDistance(c1, c2)).toBe(1);
    expect(getAxialDistance(c1, c3)).toBe(1);
    expect(getAxialDistance(c1, c4)).toBe(6);
  });

  it("handcrafted Baltic core hexes are loaded with strategic facilities and calibrated yields", () => {
    const bergen = getHexCell("hex-nor-bergen");
    expect(bergen).toBeDefined();
    expect(bergen?.name).toBe("Bergen / Rogaland / Troll-A Gate");
    expect(bergen?.ownership.side).toBe("blufor");
    expect(bergen?.ownership.countryId).toBe("norway");
    expect(bergen?.facilities.includes("naval_base")).toBe(true);
    expect(bergen?.facilities.includes("refinery")).toBe(true);
    expect((bergen?.yields.energyFuel ?? 0) > 0).toBe(true);

    const kaliningrad = getHexCell("hex-sov-kaliningrad");
    expect(kaliningrad).toBeDefined();
    expect(kaliningrad?.name).toBe("Kaliningrad / Baltiysk Bastion");
    expect(kaliningrad?.ownership.side).toBe("opfor");
    expect(kaliningrad?.ownership.countryId).toBe("soviet-union");
    expect(kaliningrad?.facilities.includes("naval_base")).toBe(true);
    expect(kaliningrad?.facilities.includes("air_base")).toBe(true);

    const gotland = getHexCell("hex-bal-gotland");
    expect(gotland).toBeDefined();
    expect(gotland?.name).toBe("Gotland Island Strategic Bastion");
    expect(gotland?.ownership.side).toBe("neutral");
    expect(gotland?.ownership.countryId).toBe("sweden");
  });

  it("getHexNeighbors returns adjacent strategic hexes", () => {
    const bergen = getHexCell("hex-nor-bergen");
    expect(bergen).toBeDefined();
    const neighbors = getHexNeighbors(bergen!);
    expect(neighbors.length).toBe(6);
    for (const neighbor of neighbors) {
      expect(neighbor.id.startsWith("hex-")).toBe(true);
      expect(neighbor.polygon.length).toBe(6);
    }
  });

  it("listHexCellsInBounds provides procedural coverage for non-Baltic global regions", () => {
    const cells = listHexCellsInBounds({
      west: -25,
      south: 62,
      east: -10,
      north: 68,
    });
    expect(cells.length > 0).toBe(true);
    for (const cell of cells) {
      expect(cell.id.startsWith("hex-")).toBe(true);
      expect(cell.polygon.length).toBe(6);
      expect(cell.yields.fundsRevenue >= 0).toBe(true);
    }
  });

  it("calculates spherical antimeridian shortest distance across the Pacific", () => {
    // Coordinate near Kamchatka (e.g. lon +160) and coordinate near Alaska (e.g. lon -160)
    const kamchatka = latLonToAxial(55, 160);
    const alaska = latLonToAxial(55, -160);
    const distance = getAxialDistance(kamchatka, alaska);
    // Across Pacific is ~15 steps, not ~120 steps all the way around Europe
    expect(distance).toBeLessThan(30);
  });

  it("latLonToHexCell deterministically classifies global straits and chokepoints", () => {
    // Gibraltar
    const gibraltar = getHexCell(
      latLonToAxial(36.1, -5.3).q,
      latLonToAxial(36.1, -5.3).r,
    )
      ? latLonToAxial(36.1, -5.3)
      : null;
    expect(gibraltar).toBeDefined();

    const gibCell = getHexCell(
      `hex-w-q${gibraltar!.q >= 0 ? `p${gibraltar!.q}` : `m${Math.abs(gibraltar!.q)}`}-r${gibraltar!.r >= 0 ? `p${gibraltar!.r}` : `m${Math.abs(gibraltar!.r)}`}`,
    );
    expect(gibCell.terrain).toBe("strait_chokepoint");
    expect(
      gibCell.facilities.includes("naval_base") ||
        gibCell.facilities.includes("coastal_fort"),
    ).toBe(true);

    // Hormuz
    const hormuzAxial = latLonToAxial(26.5, 56.2);
    const hormuzCell = getHexCell(
      `hex-w-q${hormuzAxial.q >= 0 ? `p${hormuzAxial.q}` : `m${Math.abs(hormuzAxial.q)}`}-r${hormuzAxial.r >= 0 ? `p${hormuzAxial.r}` : `m${Math.abs(hormuzAxial.r)}`}`,
    );
    expect(hormuzCell.terrain).toBe("strait_chokepoint");
    expect(hormuzCell.yields.energyFuel).toBeGreaterThanOrEqual(80);
  });
});
