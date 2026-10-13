"""Shared monthly feature contract for training and recursive inference."""
import os
from pathlib import Path
import pandas as pd
from sqlalchemy import create_engine

ROOT = Path(__file__).resolve().parent
FEATURES = ['customerId', 'productId', 'year', 'month', 'last_month', 'two_months_ago', 'avg_last_3']

def engine():
    # Same backend configuration without requiring another dotenv dependency.
    values = {}
    config = ROOT.parent / 'backend' / '.env'
    if config.exists():
        for line in config.read_text().splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and not key.startswith('#'):
                values[key] = value.strip().strip('\"\'')
    url = os.environ.get('DATABASE_URL', values.get('DATABASE_URL'))
    if not url:
        raise ValueError('Configure DATABASE_URL or backend/.env')
    # Prisma-only query parameter is not accepted by psycopg2.
    from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
    parts = urlsplit(url)
    url = urlunsplit(parts._replace(query=urlencode([(k, v) for k, v in parse_qsl(parts.query) if k != 'schema'])))
    return create_engine(url)

def monthly_sales(sales, current):
    if sales.empty:
        raise ValueError('No sales available')
    sales = sales.copy()
    sales['date'] = pd.to_datetime(sales['date']).dt.to_period('M').dt.to_timestamp()
    sales = sales[sales.date < current]
    frames = []
    for (customer, product), group in sales.groupby(['customerId', 'productId']):
        values = group.groupby('date').quantity.sum()
        index = pd.date_range(values.index.min(), current - pd.offsets.MonthBegin(1), freq='MS')
        frame = values.reindex(index, fill_value=0).rename_axis('date').reset_index()
        frame['customerId'], frame['productId'] = customer, product
        frames.append(frame)
    if not frames:
        raise ValueError('No closed months available')
    return pd.concat(frames, ignore_index=True).sort_values(['customerId', 'productId', 'date'])

def load_monthly(db, current):
    return monthly_sales(pd.read_sql('SELECT "customerId", "productId", date, quantity FROM "Sale" ORDER BY date', db), current)
