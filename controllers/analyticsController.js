// server/controllers/analyticsController.js
// ─────────────────────────────────────────────────────────────────────────────
// Advanced Analytics Engine
//
// Analytics is intentionally OWNER-ONLY. Shared tasks are great for teamwork,
// but personal reporting should only measure the tasks the signed-in user owns.
//
// Note about .lean():
// Mongoose .lean() is used on find/findOne queries to skip document hydration.
// Aggregation pipelines already return plain JavaScript objects, so there is no
// .lean() method to call here.
// ─────────────────────────────────────────────────────────────────────────────

const Task = require('../models/Task');

const VALID_RANGES = [7, 30];
const ANALYTICS_MAX_TIME_MS = 5000;
const STATUSES = ['Pending', 'In Progress', 'Completed'];

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const formatLabel = (date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const parseRange = (value, { allowAll = false } = {}) => {
  if (!value && allowAll) return 'all';

  const range = Number(value || 7);
  if (!VALID_RANGES.includes(range)) {
    return null;
  }

  return range;
};

const buildStatusPayload = (counts) => {
  const statusCounts = STATUSES.reduce((acc, status) => {
    acc[status] = counts[status] || 0;
    return acc;
  }, {});

  const totalTasks = STATUSES.reduce((sum, status) => sum + statusCounts[status], 0);
  const completionPercentage =
    totalTasks === 0 ? 0 : Math.round((statusCounts.Completed / totalTasks) * 100);

  const statusBreakdown = STATUSES.map((status) => ({
    name: status,
    value: statusCounts[status],
    percentage: totalTasks === 0 ? 0 : Math.round((statusCounts[status] / totalTasks) * 100),
  }));

  return { totalTasks, completionPercentage, statusCounts, statusBreakdown };
};

const isAggregationTimeout = (error) =>
  error?.code === 50 ||
  error?.codeName === 'MaxTimeMSExpired' ||
  /maxTimeMS|operation exceeded time limit/i.test(error?.message || '');

const getOverview = async (req, res) => {
  const range = parseRange(req.query.range, { allowAll: true });

  if (!range) {
    return res.status(400).json({
      success: false,
      message: 'Invalid range. Use 7 or 30.',
    });
  }

  try {
    const matchStage = { user: req.user._id };

    if (range !== 'all') {
      const fromDate = startOfDay(addDays(new Date(), -(range - 1)));
      matchStage.createdAt = { $gte: fromDate, $lte: new Date() };
    }

    const counts = {};

    const groupedStatuses = await Task.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
      .option({ maxTimeMS: ANALYTICS_MAX_TIME_MS })
      .exec();

    groupedStatuses.forEach((status) => {
      counts[status._id] = status.count;
    });

    console.log(`[analytics:getOverview] Success for user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      message: 'Analytics overview fetched successfully',
      data: {
        range,
        ...buildStatusPayload(counts),
      },
    });
  } catch (error) {
    console.error(`[analytics:getOverview] Error: ${error.message}`);

    if (isAggregationTimeout(error)) {
      return res.status(503).json({
        success: false,
        message: 'Analytics aggregation timed out. Please try again.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching analytics overview',
    });
  }
};

const buildBuckets = (range) => {
  const today = endOfDay(new Date());
  const startDate = startOfDay(addDays(today, -(range - 1)));

  if (range === 7) {
    return Array.from({ length: 7 }, (_, index) => {
      const start = startOfDay(addDays(startDate, index));
      const end = endOfDay(start);

      return {
        label: formatLabel(start),
        start,
        end,
        completed: 0,
        overdue: 0,
      };
    });
  }

  const buckets = [];
  let cursor = startDate;

  while (cursor <= today) {
    const start = startOfDay(cursor);
    const end = endOfDay(addDays(start, 6));
    const cappedEnd = end > today ? today : end;

    buckets.push({
      label: `${formatLabel(start)}-${formatLabel(cappedEnd)}`,
      start,
      end: cappedEnd,
      completed: 0,
      overdue: 0,
    });

    cursor = addDays(start, 7);
  }

  return buckets;
};

const placeCountInBucket = (buckets, dateKey, metric, count) => {
  const date = startOfDay(new Date(`${dateKey}T00:00:00.000Z`));
  const bucket = buckets.find((item) => date >= item.start && date <= item.end);

  if (bucket) {
    bucket[metric] += count;
  }
};

const getTrends = async (req, res) => {
  const range = parseRange(req.query.range);

  if (!range) {
    return res.status(400).json({
      success: false,
      message: 'Invalid range. Use 7 or 30.',
    });
  }

  try {
    const buckets = buildBuckets(range);
    const firstBucket = buckets[0];
    const lastBucket = buckets[buckets.length - 1];
    const now = new Date();

    const [result] = await Task.aggregate([
      {
        $match: {
          user: req.user._id,
        },
      },
      {
        $facet: {
          completedByDay: [
            {
              $match: {
                status: 'Completed',
                updatedAt: { $gte: firstBucket.start, $lte: lastBucket.end },
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          overdueByDay: [
            {
              $match: {
                status: { $ne: 'Completed' },
                dueDate: { $gte: firstBucket.start, $lte: lastBucket.end, $lt: now },
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$dueDate' } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ])
      .option({ maxTimeMS: ANALYTICS_MAX_TIME_MS })
      .exec();

    (result?.completedByDay || []).forEach((item) => {
      placeCountInBucket(buckets, item._id, 'completed', item.count);
    });

    (result?.overdueByDay || []).forEach((item) => {
      placeCountInBucket(buckets, item._id, 'overdue', item.count);
    });

    const trends = buckets.map(({ label, completed, overdue }) => ({
      label,
      completed,
      overdue,
    }));

    console.log(`[analytics:getTrends] Success for user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      message: 'Analytics trends fetched successfully',
      data: {
        range,
        bucketType: range === 7 ? 'daily' : 'weekly',
        trends,
      },
    });
  } catch (error) {
    console.error(`[analytics:getTrends] Error: ${error.message}`);

    if (isAggregationTimeout(error)) {
      return res.status(503).json({
        success: false,
        message: 'Analytics aggregation timed out. Please try again.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching analytics trends',
    });
  }
};

module.exports = {
  getOverview,
  getTrends,
};
