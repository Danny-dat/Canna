// Reines Berechnungsmodul – keine Alerts
export function calculateThc(thc) {
  const { age, weight, bodyFat, frequency, amount, thcPercentage, lastConsumption } = thc;
  if (!lastConsumption || !age || !weight || !bodyFat || !amount || !thcPercentage) {
    return { error: 'Bitte alle Felder korrekt ausfüllen.' };
  }
  const now = new Date();
  const t0  = new Date(lastConsumption);
  const hours = (now - t0) / (1000*60*60);
  if (hours < 0) return { error: 'Der Zeitpunkt des Konsums kann nicht in der Zukunft liegen.' };

  const totalThcMg = amount * 1000 * (thcPercentage / 100);
  const bioavailability = 0.25;
  const absorbedThcMg = totalThcMg * bioavailability;
  const lbm = weight * (1 - (bodyFat / 100));
  const cPeakEffective = (absorbedThcMg / lbm) * 3;

  let baseHalfLife = 20;
  if (frequency === 'often') baseHalfLife = 40;
  if (frequency === 'daily') baseHalfLife = 70;

  const halfLife = baseHalfLife * (1 + (bodyFat - 20) / 100);
  const k = 0.693 / halfLife;

  const current = cPeakEffective * Math.exp(-k * hours);
  const value = Number(current.toFixed(2));

  let status = 'green', waitTime = null;
  if (value > 3.5) {
    status = 'red';
    const hoursToWait = Math.log(current / 3.5) / k;
    const h = Math.max(0, Math.floor(hoursToWait));
    const m = Math.max(0, Math.round((hoursToWait - h) * 60));
    waitTime = `${h} Stunden und ${m} Minuten`;
  } else if (value >= 2.0) {
    status = 'orange';
  }
  return { value, status, waitTime };
}
