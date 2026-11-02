// Fixed app policy: spending changes are signals, not judgments of task quality.
// Boundaries are percentages; minimumEvents counts completed evaluable compactions.
export const performanceThresholds = Object.freeze({
 efficient:10, // Green at least 10% below the comparison average.
 elevated:10, // Amber above 10%; neutral for smaller changes.
 significant:30, // Red above 30%.
 paybackLow:50,
 paybackGood:80,
 minimumEvents:5,
});
export type Thresholds = typeof performanceThresholds;
