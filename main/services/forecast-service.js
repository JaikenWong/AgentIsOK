class ForecastService {
  static calculateRunwayDays(totalBalanceUsd, dailySeries = []) {
    if (!Number.isFinite(totalBalanceUsd)) {
      return null;
    }

    const valid = dailySeries
      .map((item) => Number(item.costUsd || 0))
      .filter((value) => value > 0);

    if (valid.length === 0) {
      return null;
    }

    const average = valid.reduce((sum, value) => sum + value, 0) / valid.length;
    if (average <= 0) {
      return null;
    }

    return totalBalanceUsd / average;
  }
}

module.exports = ForecastService;
