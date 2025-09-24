// Reines Berechnungsmodul – keine Alerts
export function calculateThc(thc) {
  const {
    age, weight, bodyFat, frequency,
    amount, thcPercentage, lastConsumption
  } = thc || {};

  // --- Basiskontrollen ---
  if (
    !lastConsumption ||
    !isFinite(age) || age < 18 || age > 100 ||
    !isFinite(weight) || weight < 40 || weight > 300 ||
    !isFinite(bodyFat) || bodyFat < 3 || bodyFat > 60 ||
    !isFinite(amount) || amount <= 0 || amount > 10 ||      // g
    !isFinite(thcPercentage) || thcPercentage <= 0 || thcPercentage > 100
  ) {
    return { error: "Bitte alle Felder sinnvoll ausfüllen." };
  }

  const t0 = new Date(lastConsumption);
  if (isNaN(+t0)) return { error: "Ungültiges Datum/Zeitformat." };

  const now = new Date();
  const hours = (now - t0) / (1000 * 60 * 60);
  if (hours < 0) return { error: "Der Zeitpunkt des Konsums liegt in der Zukunft." };

  // --- Grundannahmen & Konstanten ---
  const LIMIT_RED = 3.5;    // ng/ml
  const LIMIT_ORANGE = 2.0; // ng/ml
  const BIOAVAILABILITY = 0.25; // grober Mittelwert

  // --- Aufgenommene THC-Menge ---
  const totalThcMg = amount * 1000 * (thcPercentage / 100); // g -> mg
  const absorbedThcMg = totalThcMg * BIOAVAILABILITY;

  // --- Lean Body Mass (vereinfachter Proxy) ---
  const lbm = weight * (1 - (bodyFat / 100)); // kg
  if (!isFinite(lbm) || lbm <= 0) return { error: "Körperfett/gewicht ergeben keine plausible LBM." };

  // Peak-Konzentration (skalierender Faktor 3 bleibt dein Modell)
  const cPeakEffective = (absorbedThcMg / lbm) * 3;

  // --- Halbwertszeit ---
  let baseHalfLife = 20; // h
  if (frequency === "often") baseHalfLife = 40;
  if (frequency === "daily") baseHalfLife = 70;

  // Anpassung an Körperfett (20% → 1.0; +10% → +10% HWZ)
  const halfLife = Math.max(1, baseHalfLife * (1 + (bodyFat - 20) / 100));
  const k = 0.693 / halfLife; // Eliminationskonstante

  // --- Konzentration jetzt ---
  const current = cPeakEffective * Math.exp(-k * hours);
  const value = Number(current.toFixed(2));

  // --- Status + Wartezeit ---
  let status = "green";
  let waitTime = null;

  if (value > LIMIT_RED) {
    status = "red";
    const hoursToWait = Math.log(current / LIMIT_RED) / k; // nicht gerundete Basis
    const h = Math.max(0, Math.floor(hoursToWait));
    const m = Math.max(0, Math.round((hoursToWait - h) * 60));
    waitTime = `${h} Stunden und ${m} Minuten`;
  } else if (value >= LIMIT_ORANGE) {
    status = "orange";
  }

  return { value, status, waitTime };
}
