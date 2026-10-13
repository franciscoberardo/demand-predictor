ALTER TABLE "Product" ADD COLUMN "leadTimeDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Product" ADD CONSTRAINT "Product_leadTimeDays_check" CHECK ("leadTimeDays" >= 0);
-- Preserve existing catalog and sales; illustrative values for the original seed products.
UPDATE "Product" SET "leadTimeDays" = (ARRAY[15,20,30,45,60])[((substring(name from '[0-9]+')::int - 1) % 5) + 1]
WHERE name ~ '^Producto ([1-9]|1[0-5])$';
