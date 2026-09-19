import pandas as pd
import joblib
from sqlalchemy import create_engine

DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/demand_predictor"

engine = create_engine(DATABASE_URL)

# Cargar modelo entrenado
model = joblib.load("model.pkl")

# Traer ventas
query = """
SELECT
    "customerId", 
    "productId",
    date,
    quantity
FROM "Sale"
ORDER BY date;
"""

df = pd.read_sql(query, engine)

df["date"] = pd.to_datetime(df["date"])

# Última fecha disponible
last_date = df["date"].max()

# Mes que queremos predecir
next_date = last_date + pd.DateOffset(months=1)

print(f"Última fecha disponible: {last_date.date()}")
print(f"Prediciendo: {next_date.strftime('%Y-%m')}")

predictions = []

# Agrupar por cliente + producto
for (customer_id, product_id), group in df.groupby(
    ["customerId", "productId"]
):

    group = group.sort_values("date")

    # Necesitamos al menos 3 meses
    if len(group) < 3:
        continue

    quantities = group["quantity"]

    last_month = quantities.iloc[-1]
    two_months_ago = quantities.iloc[-2]
    avg_last_3 = quantities.iloc[-3:].mean()

    features = pd.DataFrame([{
        "customerId": customer_id,
        "productId": product_id,
        "year": next_date.year,
        "month": next_date.month,
        "last_month": last_month,
        "two_months_ago": two_months_ago,
        "avg_last_3": avg_last_3
    }])

    prediction = model.predict(features)[0]

    # No tiene sentido vender cantidades negativas
    prediction = max(0, round(prediction))

    predictions.append({
        "customerId": customer_id,
        "productId": product_id,
        "prediction": prediction
    })


result = pd.DataFrame(predictions)

# Guardar predicciones en PostgreSQL

forecast_date = next_date.replace(day=1)

rows = []

for _, row in result.iterrows():
    rows.append({
        "customerId": int(row["customerId"]),
        "productId": int(row["productId"]),
        "date": forecast_date,
        "prediction": int(row["prediction"])
    })

forecast_df = pd.DataFrame(rows)

# Eliminamos predicciones anteriores del mismo mes
with engine.begin() as connection:
    connection.exec_driver_sql(
        'DELETE FROM "Forecast" WHERE date = %s',
        (forecast_date.to_pydatetime(),)
    )

forecast_df.to_sql(
    "Forecast",
    engine,
    if_exists="append",
    index=False
)

print(f"\n✅ {len(forecast_df)} predicciones guardadas")

print("\n--- PREDICCIONES ---\n")

print(result.head(30))