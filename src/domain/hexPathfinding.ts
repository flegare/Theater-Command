import {
  getAxialDistance,
  getAxialNeighbors,
  getHexCellDefinition,
  getHexIdForAxial,
  type HexTerrainType,
} from "./hexGrid.js";
import {
  canFormationTraverseTerrain,
  type FormationUnitType,
} from "./militaryFormations.js";

export type HexPathNode = {
  q: number;
  r: number;
  hexId: string;
  name: string;
  terrain: HexTerrainType;
  centroid: [number, number];
};

export type HexPathResult = {
  found: boolean;
  path: HexPathNode[];
  stepCount: number;
  turnsNeeded: number;
  apCost: number;
  reason?: string;
};

/**
 * Computes shortest navigable path on the axial hex grid for a given military formation.
 * Respects ground/naval/air domain restrictions and estimates turns to arrival.
 */
export function findFormationHexPath(input: {
  startAxial: { q: number; r: number };
  targetAxial: { q: number; r: number };
  unitType: FormationUnitType;
  isEmbarked?: boolean;
  currentAP: number;
  maxAP: number;
}): HexPathResult {
  const {
    startAxial,
    targetAxial,
    unitType,
    isEmbarked = false,
    currentAP,
    maxAP,
  } = input;

  if (startAxial.q === targetAxial.q && startAxial.r === targetAxial.r) {
    const startHexId = getHexIdForAxial(startAxial.q, startAxial.r);
    const startCell = getHexCellDefinition(startHexId, startAxial);
    return {
      found: true,
      path: [
        {
          q: startAxial.q,
          r: startAxial.r,
          hexId: startCell.id,
          name: startCell.name,
          terrain: startCell.terrain,
          centroid: startCell.centroid,
        },
      ],
      stepCount: 0,
      turnsNeeded: 0,
      apCost: 0,
    };
  }

  const targetHexId = getHexIdForAxial(targetAxial.q, targetAxial.r);
  const targetCell = getHexCellDefinition(targetHexId, targetAxial);

  // Validate target cell traversal first
  const targetTraversable = canFormationTraverseTerrain(
    unitType,
    targetCell.terrain,
    isEmbarked,
    targetCell.facilities,
  );
  if (!targetTraversable.canMove) {
    return {
      found: false,
      path: [],
      stepCount: 0,
      turnsNeeded: 0,
      apCost: 0,
      reason:
        targetTraversable.reason ?? "Target sector terrain is impassable.",
    };
  }

  // A* Search on Axial Grid
  const startKey = `${startAxial.q},${startAxial.r}`;
  const targetKey = `${targetAxial.q},${targetAxial.r}`;

  type AStarNode = {
    q: number;
    r: number;
    gScore: number;
    fScore: number;
    parentKey: string | null;
  };

  const openMap = new Map<string, AStarNode>();
  const closedSet = new Set<string>();
  const allNodes = new Map<string, AStarNode>();

  const startH = getAxialDistance(
    startAxial.q,
    startAxial.r,
    targetAxial.q,
    targetAxial.r,
  );
  const initialNode: AStarNode = {
    q: startAxial.q,
    r: startAxial.r,
    gScore: 0,
    fScore: startH,
    parentKey: null,
  };

  openMap.set(startKey, initialNode);
  allNodes.set(startKey, initialNode);

  let iterations = 0;
  const MAX_ITERATIONS = 1200; // Keep A* search bounded and snappy

  while (openMap.size > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Find node with lowest fScore
    let currentKey: string | null = null;
    let lowestF = Infinity;

    for (const [key, node] of openMap.entries()) {
      if (node.fScore < lowestF) {
        lowestF = node.fScore;
        currentKey = key;
      }
    }

    if (!currentKey) break;
    const current = openMap.get(currentKey)!;

    if (currentKey === targetKey) {
      // Reconstruct path
      const reconstructed: HexPathNode[] = [];
      let curr: AStarNode | undefined = current;

      while (curr) {
        const hexId = getHexIdForAxial(curr.q, curr.r);
        const cell = getHexCellDefinition(hexId, { q: curr.q, r: curr.r });
        reconstructed.unshift({
          q: curr.q,
          r: curr.r,
          hexId: cell.id,
          name: cell.name,
          terrain: cell.terrain,
          centroid: cell.centroid,
        });

        if (curr.parentKey) {
          curr = allNodes.get(curr.parentKey);
        } else {
          curr = undefined;
        }
      }

      const stepCount = reconstructed.length - 1;
      const effectiveMaxAP = Math.max(1, maxAP);
      let turnsNeeded = 1;

      if (stepCount <= currentAP) {
        turnsNeeded = 1;
      } else {
        const remainingSteps = stepCount - currentAP;
        const additionalTurns = Math.ceil(remainingSteps / effectiveMaxAP);
        turnsNeeded = 1 + additionalTurns;
      }

      return {
        found: true,
        path: reconstructed,
        stepCount,
        turnsNeeded,
        apCost: stepCount,
      };
    }

    openMap.delete(currentKey);
    closedSet.add(currentKey);

    const neighbors = getAxialNeighbors(current.q, current.r);
    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.q},${neighbor.r}`;
      if (closedSet.has(neighborKey)) continue;

      const neighborHex = getHexCellDefinition(neighbor.hexId, {
        q: neighbor.q,
        r: neighbor.r,
      });

      const traverseCheck = canFormationTraverseTerrain(
        unitType,
        neighborHex.terrain,
        isEmbarked,
        neighborHex.facilities,
      );
      if (!traverseCheck.canMove) {
        continue; // impassable terrain
      }

      const tentativeG = current.gScore + 1;
      const existing = openMap.get(neighborKey);

      if (!existing || tentativeG < existing.gScore) {
        const h = getAxialDistance(
          neighbor.q,
          neighbor.r,
          targetAxial.q,
          targetAxial.r,
        );
        const newNode: AStarNode = {
          q: neighbor.q,
          r: neighbor.r,
          gScore: tentativeG,
          fScore: tentativeG + h,
          parentKey: currentKey,
        };

        openMap.set(neighborKey, newNode);
        allNodes.set(neighborKey, newNode);
      }
    }
  }

  return {
    found: false,
    path: [],
    stepCount: 0,
    turnsNeeded: 0,
    apCost: 0,
    reason: "No legal navigable route found across terrain.",
  };
}
