import json
import joblib
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error

from data import ROOT, engine as make_engine, load_monthly

engine = make_engine()
current = pd.Timestamp.now(tz="UTC").tz_localize(None).to_period("M").to_timestamp()
df = load_monthly(engine, current)
print("Meses cargados:", len(df))

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

if train.empty or test.empty:
    raise ValueError("Se necesitan al menos 7 meses cerrados para entrenar y evaluar")

model.fit(X_train, y_train)


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
# Evaluate chronologically, then refit the production model on all closed months.
model.fit(X, y)
joblib.dump(model, ROOT / "model.pkl")

(ROOT / 'metrics.json').write_text(json.dumps({
    'mae': float(mae), 'evaluatedAt': pd.Timestamp.now(tz='UTC').isoformat(),
    'testStart': str(test.date.min().date()), 'testEnd': str(test.date.max().date()),
    'evaluation': 'one-step chronological holdout; not a six-month error estimate'
}, indent=2))
print("Modelo final y métricas guardados en ml/")
