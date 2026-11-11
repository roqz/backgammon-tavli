/**
 * FIBS rating formula, the de-facto standard for backgammon servers.
 *
 * The probability that the higher-rated player wins a match of length N is
 *   P = 1 - 1 / (10^(D * sqrt(N) / 2000) + 1)        with D = rating difference.
 * The winner gains K * 4 * sqrt(N) * (1 - P(winner wins)); the loser loses the same.
 * New players move faster: K = max(1, 5 - experience / 100), experience = sum of match lengths.
 */
export const STARTING_RATING = 1500;

export const winProbability = (rating: number, opponentRating: number, length: number): number => {
  const n = Math.max(1, length);
  return 1 - 1 / (10 ** (((rating - opponentRating) * Math.sqrt(n)) / 2000) + 1);
};

export const experienceFactor = (experience: number): number => Math.max(1, 5 - experience / 100);

export interface RatedSide {
  readonly rating: number;
  readonly experience: number;
}

/** Rating changes [winner, loser] for a finished match. */
export const ratingChange = (winner: RatedSide, loser: RatedSide, length: number): [number, number] => {
  const n = Math.max(1, length);
  const base = 4 * Math.sqrt(n) * (1 - winProbability(winner.rating, loser.rating, n));
  const round = (x: number) => Math.round(x * 100) / 100;
  return [
    round(base * experienceFactor(winner.experience)),
    round(-base * experienceFactor(loser.experience)),
  ];
};
