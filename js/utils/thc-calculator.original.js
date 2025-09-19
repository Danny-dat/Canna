// CannaTrack/thc-calculator.js
export default {
    calculate(thcCalc) {
        const { gender, age, weight, bodyFat, frequency, amount, thcPercentage, lastConsumption } = thcCalc;

        if (!lastConsumption || !age || !weight || !bodyFat || !amount || !thcPercentage) {
            alert("Bitte alle Felder korrekt ausfüllen.");
            return null;
        }
        
        const now = new Date();
        const consumptionDate = new Date(lastConsumption);
        const hoursPassed = (now - consumptionDate) / (1000 * 60 * 60);
        if (hoursPassed < 0) {
            alert("Der Zeitpunkt des Konsums kann nicht in der Zukunft liegen.");
            return null;
        }
        
        const totalThcMg = amount * 1000 * (thcPercentage / 100);
        const bioavailability = 0.25;
        const absorbedThcMg = totalThcMg * bioavailability;
        const leanBodyMass = weight * (1 - (bodyFat / 100));
        const cPeakEffective = (absorbedThcMg / leanBodyMass) * 3;
        
        let baseHalfLife;
        switch (frequency) {
            case 'once': baseHalfLife = 20; break;
            case 'often': baseHalfLife = 40; break;
            case 'daily': baseHalfLife = 70; break;
            default: baseHalfLife = 20;
        }
        const halfLife = baseHalfLife * (1 + (bodyFat - 20) / 100);
        const k = 0.693 / halfLife;
        const currentConcentration = cPeakEffective * Math.exp(-k * hoursPassed);
        const finalValue = currentConcentration.toFixed(2);
        
        let result = { value: finalValue, status: 'green', waitTime: null };
        if (finalValue > 3.5) {
            result.status = 'red';
            const hoursToWait = Math.log(currentConcentration / 3.5) / k;
            if (hoursToWait > 0) {
                const h = Math.floor(hoursToWait);
                const m = Math.round((hoursToWait - h) * 60);
                result.waitTime = `${h} Stunden und ${m} Minuten`;
            } else {
                result.waitTime = "0 Minuten";
            }
        } else if (finalValue >= 2.0) {
            result.status = 'orange';
        }
        return result;
    }
};