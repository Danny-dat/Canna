// js/utils/thc-calculator.js
/** Pure calculation function. Replace with your logic */
export function calculate(input) {
  if (!input) return null;
  // Example dummy: half-life style decay (placeholder)
  const { initialMg = 10, hours = 24, halfLife = 24 } = input;
  const remaining = initialMg * Math.pow(0.5, hours / halfLife);
  return { remainingMg: Number(remaining.toFixed(2)), hours, halfLife };
}
