import unittest
import pandas as pd
from data import monthly_sales
from predict import recursive_forecast

class LagModel:
    def __init__(self):
        self.inputs = []
    def predict(self, features):
        self.inputs.append(features.copy())
        return features.last_month + 1

class ForecastTests(unittest.TestCase):
    def test_monthly_aggregation_missing_month_and_open_month(self):
        rows = pd.DataFrame([
            dict(customerId=1, productId=1, date='2025-10-02', quantity=2),
            dict(customerId=1, productId=1, date='2025-10-20', quantity=3),
            dict(customerId=1, productId=1, date='2025-12-20', quantity=4),
            dict(customerId=1, productId=1, date='2026-01-02', quantity=999),
        ])
        monthly = monthly_sales(rows, pd.Timestamp('2026-01-01'))
        self.assertEqual(monthly.quantity.tolist(), [5, 0, 4])
        model = LagModel()
        predictions = recursive_forecast(model, monthly, pd.Timestamp('2026-01-01'), 7)
        self.assertEqual([r['prediction'] for r in predictions], [5, 6, 7, 8, 9, 10, 11])
        self.assertEqual(model.inputs[1].last_month.iloc[0], 5)
        self.assertEqual(model.inputs[1].two_months_ago.iloc[0], 4)
        self.assertEqual(model.inputs[1].avg_last_3.iloc[0], 3)
        self.assertEqual(len({(r['customerId'], r['productId'], r['date']) for r in predictions}), 7)

    def test_independent_series_and_year_rollover(self):
        rows = pd.DataFrame([dict(customerId=c, productId=1, date=d, quantity=c*10)
                             for c in [1, 2] for d in pd.date_range('2025-09-01', periods=3, freq='MS')])
        model = LagModel()
        result = recursive_forecast(model, rows, pd.Timestamp('2025-12-01'), 3)
        self.assertEqual([r['prediction'] for r in result], [11, 21, 12, 22, 13, 23])
        self.assertEqual(model.inputs[1].year.tolist(), [2026, 2026])

if __name__ == '__main__':
    unittest.main()
