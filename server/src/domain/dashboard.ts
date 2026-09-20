import type { Db } from '../db/index.js';
import { CONTACTED_OUTCOMES, POSITIVE_OUTCOMES } from './types.js';

export interface CountBucket {
  value: string;
  count: number;
}

export interface DashboardStats {
  generatedAt: string;
  totals: {
    prospects: number;
    enriched: number;
    priority: number;
    readyToCall: number;
    doNotCall: number;
    withPhone: number;
    testCalled: number;
  };
  activity: {
    callsMade: number;
    callsToday: number;
    callsThisWeek: number;
    leadsCalled: number;
    leadsContacted: number;
    leadsInterested: number;
    demosBooked: number;
    customersWon: number;
    followUpsDue: number;
    followUpsNext7Days: number;
  };
  rates: {
    contactRate: number;
    interestedRate: number;
    demoRate: number;
    conversionRate: number;
  };
  value: {
    monthlyRevenueWon: number;
    annualisedRevenueWon: number;
    averageContractValue: number | null;
  };
  quality: {
    averageScore: number;
    averageScoreEnriched: number;
    medianReviewCount: number | null;
  };
  byCity: CountBucket[];
  byTrade: CountBucket[];
  byBand: CountBucket[];
  byStatus: CountBucket[];
  pipelineValueByStatus: CountBucket[];
}

function scalar(db: Db, sql: string, params: unknown[] = []): number {
  const row = db.prepare<unknown[], { n: number | null }>(sql).get(...params);
  return Number(row?.n ?? 0);
}

function buckets(db: Db, sql: string, params: unknown[] = []): CountBucket[] {
  return db.prepare<unknown[], { value: string | null; count: number }>(sql).all(...params)
    .map((r) => ({ value: r.value ?? 'Unknown', count: r.count }));
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal place, as a percentage
}

export function dashboardStats(db: Db): DashboardStats {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const inSevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const contactedList = CONTACTED_OUTCOMES.map(() => '?').join(', ');
  const positiveList = POSITIVE_OUTCOMES.map(() => '?').join(', ');

  const prospects = scalar(db, 'SELECT COUNT(*) AS n FROM leads');
  const leadsCalled = scalar(db, 'SELECT COUNT(DISTINCT lead_id) AS n FROM calls');
  const leadsContacted = scalar(
    db,
    `SELECT COUNT(DISTINCT lead_id) AS n FROM calls WHERE outcome IN (${contactedList})`,
    [...CONTACTED_OUTCOMES],
  );
  const leadsInterested = scalar(
    db,
    `SELECT COUNT(DISTINCT lead_id) AS n FROM calls WHERE outcome IN (${positiveList})`,
    [...POSITIVE_OUTCOMES],
  );
  const demosBooked = scalar(db, "SELECT COUNT(*) AS n FROM leads WHERE status IN ('demo_booked', 'proposal', 'won')");
  const customersWon = scalar(db, "SELECT COUNT(*) AS n FROM leads WHERE status = 'won'");
  const monthlyRevenue = scalar(db, "SELECT COALESCE(SUM(contract_value), 0) AS n FROM leads WHERE status = 'won'");
  const wonWithValue = scalar(db, "SELECT COUNT(*) AS n FROM leads WHERE status = 'won' AND contract_value IS NOT NULL");

  const reviewCounts = db
    .prepare<[], { google_review_count: number }>(
      'SELECT google_review_count FROM leads WHERE google_review_count IS NOT NULL ORDER BY google_review_count',
    )
    .all()
    .map((r) => r.google_review_count);
  const medianReviewCount = reviewCounts.length
    ? reviewCounts[Math.floor(reviewCounts.length / 2)] ?? null
    : null;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      prospects,
      enriched: scalar(db, 'SELECT COUNT(*) AS n FROM leads WHERE enriched_at IS NOT NULL'),
      priority: scalar(db, "SELECT COUNT(*) AS n FROM leads WHERE score_band = 'Priority'"),
      readyToCall: scalar(
        db,
        `SELECT COUNT(*) AS n FROM leads
          WHERE do_not_call = 0 AND COALESCE(phone_e164,'') != ''
            AND status IN ('new','enriched','priority','ready_to_call')`,
      ),
      doNotCall: scalar(db, 'SELECT COUNT(*) AS n FROM leads WHERE do_not_call = 1'),
      withPhone: scalar(db, "SELECT COUNT(*) AS n FROM leads WHERE COALESCE(phone_e164,'') != ''"),
      testCalled: scalar(db, 'SELECT COUNT(*) AS n FROM leads WHERE test_call_attempted = 1'),
    },
    activity: {
      callsMade: scalar(db, 'SELECT COUNT(*) AS n FROM calls'),
      callsToday: scalar(db, 'SELECT COUNT(*) AS n FROM calls WHERE DATE(called_at) = DATE(?)', [today]),
      callsThisWeek: scalar(db, 'SELECT COUNT(*) AS n FROM calls WHERE DATE(called_at) >= DATE(?)', [weekAgo]),
      leadsCalled,
      leadsContacted,
      leadsInterested,
      demosBooked,
      customersWon,
      followUpsDue: scalar(
        db,
        `SELECT COUNT(*) AS n FROM leads
          WHERE do_not_call = 0 AND follow_up_date IS NOT NULL AND DATE(follow_up_date) <= DATE(?)`,
        [today],
      ),
      followUpsNext7Days: scalar(
        db,
        `SELECT COUNT(*) AS n FROM leads
          WHERE do_not_call = 0 AND follow_up_date IS NOT NULL
            AND DATE(follow_up_date) > DATE(?) AND DATE(follow_up_date) <= DATE(?)`,
        [today, inSevenDays],
      ),
    },
    rates: {
      contactRate: rate(leadsContacted, leadsCalled),
      interestedRate: rate(leadsInterested, leadsContacted),
      demoRate: rate(demosBooked, leadsCalled),
      conversionRate: rate(customersWon, leadsCalled),
    },
    value: {
      monthlyRevenueWon: monthlyRevenue,
      annualisedRevenueWon: monthlyRevenue * 12,
      averageContractValue: wonWithValue > 0 ? Math.round((monthlyRevenue / wonWithValue) * 100) / 100 : null,
    },
    quality: {
      averageScore: Math.round(scalar(db, 'SELECT COALESCE(AVG(score), 0) AS n FROM leads') * 10) / 10,
      averageScoreEnriched:
        Math.round(scalar(db, 'SELECT COALESCE(AVG(score), 0) AS n FROM leads WHERE enriched_at IS NOT NULL') * 10) / 10,
      medianReviewCount,
    },
    byCity: buckets(
      db,
      `SELECT city AS value, COUNT(*) AS count FROM leads GROUP BY city ORDER BY count DESC, value ASC LIMIT 15`,
    ),
    byTrade: buckets(db, 'SELECT trade AS value, COUNT(*) AS count FROM leads GROUP BY trade ORDER BY count DESC'),
    byBand: buckets(db, 'SELECT score_band AS value, COUNT(*) AS count FROM leads GROUP BY score_band'),
    byStatus: buckets(db, 'SELECT status AS value, COUNT(*) AS count FROM leads GROUP BY status'),
    pipelineValueByStatus: buckets(
      db,
      `SELECT status AS value, COALESCE(SUM(contract_value), 0) AS count FROM leads
        WHERE contract_value IS NOT NULL GROUP BY status`,
    ),
  };
}
