/**
 * Greedy interval packing: overlapping spans on one row get stacked into sub-lanes.
 * Input spans are [start, end) in any consistent unit. Returns a lane index per span,
 * in input order, and the lane count.
 */
export interface Span { start: number; end: number }

export function packLanes<T extends Span>(spans: T[]): { lanes: number[]; count: number } {
  const order = spans.map((s, i) => i).sort((a, b) => spans[a].start - spans[b].start || spans[a].end - spans[b].end)
  const laneEnds: number[] = []
  const lanes = new Array<number>(spans.length)
  for (const i of order) {
    const s = spans[i]
    let lane = laneEnds.findIndex((end) => end <= s.start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.end) } else laneEnds[lane] = s.end
    lanes[i] = lane
  }
  return { lanes, count: Math.max(1, laneEnds.length) }
}
