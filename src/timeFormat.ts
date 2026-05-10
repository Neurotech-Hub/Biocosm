/** Wall-clock time within a 24 h day (matches timeline “Time of day”). */
export function formatClockHHMM(absoluteTimeSeconds: number): string {
  const secondsInDay = 24 * 60 * 60;
  const daySeconds = ((absoluteTimeSeconds % secondsInDay) + secondsInDay) % secondsInDay;
  const hours = Math.floor(daySeconds / 3600);
  const minutes = Math.floor((daySeconds % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
