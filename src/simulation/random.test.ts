import { SeededRandom } from "./random";

describe("SeededRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const left = new SeededRandom("phase-one");
    const right = new SeededRandom("phase-one");

    expect(Array.from({ length: 8 }, () => left.next())).toEqual(Array.from({ length: 8 }, () => right.next()));
  });
});
