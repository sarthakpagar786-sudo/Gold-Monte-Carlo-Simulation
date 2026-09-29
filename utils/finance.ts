
/**
 * Box-Muller transform for generating normally distributed random numbers
 */
export const randomNormal = (): number => {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

export const calculateMonteCarlo = (
  startPrice: number,
  tradingDays: number,
  annualReturn: number,
  annualVol: number,
  numSimulations: number = 100
) => {
  const dailyReturn = annualReturn / 252;
  const dailyVol = annualVol / Math.sqrt(252);
  
  const allPaths: number[][] = [];
  
  for (let s = 0; s < numSimulations; s++) {
    const path = [startPrice];
    let currentPrice = startPrice;
    
    for (let d = 0; d < tradingDays; d++) {
      const drift = dailyReturn - 0.5 * Math.pow(dailyVol, 2);
      const diffusion = dailyVol * randomNormal();
      currentPrice = currentPrice * Math.exp(drift + diffusion);
      path.push(currentPrice);
    }
    allPaths.push(path);
  }
  
  return allPaths;
};
