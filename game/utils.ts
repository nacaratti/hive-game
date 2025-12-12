import { Hex } from './types';

export const hexToString = (hex: Hex): string => `${hex.q},${hex.r}`;

export const stringToHex = (str: string): Hex => {
  const [q, r] = str.split(',').map(Number);
  return { q, r, s: -q - r };
};

export const hexAdd = (a: Hex, b: Hex): Hex => ({
  q: a.q + b.q,
  r: a.r + b.r,
  s: a.s + b.s,
});

export const hexNeighbor = (hex: Hex, direction: number): Hex => {
  const directions = [
    { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 },
  ];
  return hexAdd(hex, directions[direction % 6]);
};


export const getNeighbors = (hex: Hex): Hex[] => {
  const neighbors: Hex[] = [];
  for (let i = 0; i < 6; i++) {
    neighbors.push(hexNeighbor(hex, i));
  }
  return neighbors;
};

export const areNeighbors = (h1: Hex, h2: Hex): boolean => {
  return Math.abs(h1.q - h2.q) <= 1 && 
         Math.abs(h1.r - h2.r) <= 1 && 
         Math.abs(h1.s - h2.s) <= 1 &&
         !(h1.q === h2.q && h1.r === h2.r);
};

// For finding valid slide spots
export const getCommonNeighbors = (h1: Hex, h2: Hex, occupiedKeys: Set<string>): number => {
  const n1 = getNeighbors(h1);
  const common = n1.filter(n => {
    // Is neighbor of h2?
    const isN = areNeighbors(n, h2);
    return isN;
  });
  
  // Count how many common neighbors are occupied
  let occupiedCount = 0;
  common.forEach(c => {
    if (occupiedKeys.has(hexToString(c))) occupiedCount++;
  });
  return occupiedCount;
};
