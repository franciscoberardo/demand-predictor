"""Monthly demand only. Purchasing decisions are implemented in the backend."""
import argparse
import joblib
import pandas as pd
from sqlalchemy import text
from data import ROOT, FEATURES, engine, load_monthly


def recursive_forecast(model, history, start, months):
    series = []
    for (customer, product), group in history.groupby(['customerId', 'productId']):
        quantities = group.sort_values('date').quantity.tolist()
        # New relationships use observed months, padded with zeros (no invented sales).
        quantities = [0] * max(0, 3 - len(quantities)) + quantities
        series.append((int(customer), int(product), quantities))
    rows = []
    for date in pd.date_range(start, periods=months, freq='MS'):
        features = pd.DataFrame([dict(customerId=c, productId=p, year=date.year, month=date.month,
                                     last_month=q[-1], two_months_ago=q[-2], avg_last_3=sum(q[-3:]) / 3)
                                 for c, p, q in series], columns=FEATURES)
        for (customer, product, quantities), prediction in zip(series, model.predict(features)):
            prediction = max(0, round(float(prediction)))
            quantities.append(prediction)
            rows.append(dict(customerId=customer, productId=product, date=date.to_pydatetime(), prediction=prediction))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--months', type=int, choices=range(3, 7), default=6, help='Future months, plus current month for planning')
    args = parser.parse_args()
    db = engine()
    start = pd.Timestamp.now(tz='UTC').tz_localize(None).to_period('M').to_timestamp()
    rows = recursive_forecast(joblib.load(ROOT / 'model.pkl'), load_monthly(db, start), start, args.months + 1)
    if not rows:
        raise ValueError('No eligible customer/product relationships')
    # Atomic refresh: readers see either the previous or the complete new horizon.
    with db.begin() as connection:
        connection.execute(text('DELETE FROM "Forecast" WHERE date >= :start'), {'start': start.to_pydatetime()})
        connection.execute(text('''INSERT INTO "Forecast" ("customerId", "productId", date, prediction)
            VALUES (:customerId, :productId, :date, :prediction)
            ON CONFLICT ("customerId", "productId", date)
            DO UPDATE SET prediction = EXCLUDED.prediction, "createdAt" = CURRENT_TIMESTAMP'''), rows)
    print(f'{len(rows)} forecasts saved: {start:%Y-%m} + {args.months} future months')

if __name__ == '__main__':
    main()
