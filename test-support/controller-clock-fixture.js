export function makeClock() {
  let now = 0;
  const sleeps = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms / 1000;
    },
  };
}
