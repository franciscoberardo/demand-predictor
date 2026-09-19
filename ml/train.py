import joblib
import pandas as pd
from sqlalchemy import create_engine
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error

# 1. Conectarnos a PostgreSQL
DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/demand_predictor"
engine = create_engine(DATABASE_URL)

# 2. Traer las ventas
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

print("Ventas cargadas:", len(df))
print(df.head())

# 3. Crear año y mes
df["date"] = pd.to_datetime(df["date"])
df["year"] = df["date"].dt.year
df["month"] = df["date"].dt.month

# Ordenamos correctamente
df = df.sort_values(["customerId", "productId", "date"])

# 4. Crear información histórica
group = df.groupby(["customerId", "productId"])["quantity"]

df["last_month"] = group.shift(1)
df["two_months_ago"] = group.shift(2)

df["avg_last_3"] = (
    df.groupby(["customerId", "productId"])["quantity"]
      .transform(lambda x: x.shift(1).rolling(3).mean())
)

# Eliminamos meses donde todavía no tenemos historial suficiente
df = df.dropna()

# Variables que recibe el modelo
features = [
    "customerId",
    "productId",
    "year",
    "month",
    "last_month",
    "two_months_ago",
    "avg_last_3",
]

X = df[features]
y = df["quantity"]

# 5. Separar cronológicamente entrenamiento/prueba
cutoff = df["date"].max() - pd.DateOffset(months=3)

train = df[df["date"] < cutoff]
test = df[df["date"] >= cutoff]

X_train = train[features]
y_train = train["quantity"]

X_test = test[features]
y_test = test["quantity"]

print("Entrenamiento:", len(train))
print("Prueba:", len(test))

# 6. Crear y entrenar el modelo
model = LGBMRegressor(
    n_estimators=300,
    learning_rate=0.05,
    random_state=42
)

model.fit(X_train, y_train)
joblib.dump(model, "model.pkl")
print("Modelo guardado en model.pkl")

# 7. Probarlo con datos que no vio
predictions = model.predict(X_test)

mae = mean_absolute_error(y_test, predictions)

print("\n--- RESULTADO ---")
print(f"Error promedio: {mae:.2f} unidades")

# Mostrar ejemplos
results = test[
    ["customerId", "productId", "date", "quantity"]
].copy()

results["prediction"] = predictions

print("\nEjemplos:")
print(results.head(20))