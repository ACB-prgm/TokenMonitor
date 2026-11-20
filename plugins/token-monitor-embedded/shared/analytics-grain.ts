import type {AnalyticsPeriod} from '../server/src/history-database.js';

export const analyticsGrains=['day','week','month'] as const;
export type AnalyticsGrain=typeof analyticsGrains[number];

export function defaultAnalyticsGrain(period:AnalyticsPeriod):AnalyticsGrain{
 return period==='7'||period==='30'?'day':'week';
}

export function analyticsBucketStart(day:string,grain:AnalyticsGrain){
 const date=new Date(day+'T00:00:00Z');
 if(grain==='month')date.setUTCDate(1);
 if(grain==='week')date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
 return date;
}
