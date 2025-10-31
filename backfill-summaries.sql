-- Manual Backfill of Weekly Summary Tables
-- Run this in TablePlus against your Railway database
-- This will populate summary tables from existing InventoryMovement data

-- NOTE: This may take 10-30 minutes depending on data size
-- Progress will be shown in TablePlus query window

-- Step 1: Create temporary function to get Monday of week
CREATE OR REPLACE FUNCTION get_monday(input_date DATE) 
RETURNS DATE AS $$
DECLARE
  day_of_week INT;
BEGIN
  day_of_week := EXTRACT(DOW FROM input_date);
  RETURN input_date - ((day_of_week + 6) % 7);
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create temporary function to get time bucket
CREATE OR REPLACE FUNCTION get_time_bucket(input_hour INT)
RETURNS TEXT AS $$
BEGIN
  IF input_hour >= 6 AND input_hour < 12 THEN RETURN 'morning';
  ELSIF input_hour >= 12 AND input_hour < 18 THEN RETURN 'afternoon';
  ELSIF input_hour >= 18 AND input_hour < 22 THEN RETURN 'evening';
  ELSE RETURN 'night';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Backfill WeeklySalesSummary (Product level)
-- This aggregates sales by week, store, and product
INSERT INTO "WeeklySalesSummary" (
  "weekStart",
  "storeId",
  "productId",
  "grossSales",
  "refunds",
  "netRevenue",
  "unitsSold",
  "refundUnits",
  "salesByDayOfWeek",
  "salesMorning",
  "salesAfternoon",
  "salesEvening",
  "salesNight",
  "unitsMorning",
  "unitsAfternoon",
  "unitsEvening",
  "unitsNight",
  "createdAt",
  "updatedAt"
)
SELECT 
  get_monday(im.date::DATE) as week_start,
  im."storeId",
  im."productId",
  
  -- Gross sales (type='sale')
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as gross_sales,
  
  -- Refunds (type='refund')
  COALESCE(SUM(CASE WHEN im.type = 'refund' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as refunds,
  
  -- Net revenue
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    WHEN im.type = 'refund' 
    THEN -ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as net_revenue,
  
  -- Units sold
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as units_sold,
  
  -- Refund units
  COALESCE(SUM(CASE WHEN im.type = 'refund' 
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as refund_units,
  
  -- Day of week breakdown (JSON)
  jsonb_object_agg(
    EXTRACT(DOW FROM im.date)::TEXT,
    CASE WHEN im.type = 'sale' 
      THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
      ELSE 0 END
  ) FILTER (WHERE im.type = 'sale') as sales_by_day,
  
  -- Time bucket breakdowns
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'morning'
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as sales_morning,
    
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'afternoon'
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as sales_afternoon,
    
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'evening'
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as sales_evening,
    
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'night'
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as sales_night,
  
  -- Units by time bucket
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'morning'
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as units_morning,
    
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'afternoon'
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as units_afternoon,
    
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'evening'
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as units_evening,
    
  COALESCE(SUM(CASE 
    WHEN im.type = 'sale' AND get_time_bucket(EXTRACT(HOUR FROM im.date)::INT) = 'night'
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as units_night,
  
  NOW() as created_at,
  NOW() as updated_at
  
FROM "InventoryMovement" im
JOIN "ProductCatalog" p ON im."productId" = p.id
GROUP BY 
  get_monday(im.date::DATE),
  im."storeId",
  im."productId"
ON CONFLICT ("weekStart", "storeId", "productId") DO UPDATE SET
  "grossSales" = EXCLUDED."grossSales",
  "refunds" = EXCLUDED."refunds",
  "netRevenue" = EXCLUDED."netRevenue",
  "unitsSold" = EXCLUDED."unitsSold",
  "refundUnits" = EXCLUDED."refundUnits",
  "salesByDayOfWeek" = EXCLUDED."salesByDayOfWeek",
  "salesMorning" = EXCLUDED."salesMorning",
  "salesAfternoon" = EXCLUDED."salesAfternoon",
  "salesEvening" = EXCLUDED."salesEvening",
  "salesNight" = EXCLUDED."salesNight",
  "unitsMorning" = EXCLUDED."unitsMorning",
  "unitsAfternoon" = EXCLUDED."unitsAfternoon",
  "unitsEvening" = EXCLUDED."unitsEvening",
  "unitsNight" = EXCLUDED."unitsNight",
  "updatedAt" = NOW();

-- Step 4: Backfill WeeklyCategorySummary
INSERT INTO "WeeklyCategorySummary" (
  "weekStart",
  "storeId",
  "category",
  "grossSales",
  "refunds",
  "netRevenue",
  "unitsSold",
  "productCount",
  "createdAt",
  "updatedAt"
)
SELECT 
  get_monday(im.date::DATE) as week_start,
  im."storeId",
  COALESCE(p."parentCategory", 'Uncategorized') as category,
  
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as gross_sales,
    
  COALESCE(SUM(CASE WHEN im.type = 'refund' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as refunds,
    
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    WHEN im.type = 'refund' 
    THEN -ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as net_revenue,
    
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as units_sold,
    
  COUNT(DISTINCT im."productId")::INTEGER as product_count,
  
  NOW() as created_at,
  NOW() as updated_at
  
FROM "InventoryMovement" im
JOIN "ProductCatalog" p ON im."productId" = p.id
GROUP BY 
  get_monday(im.date::DATE),
  im."storeId",
  COALESCE(p."parentCategory", 'Uncategorized')
ON CONFLICT ("weekStart", "storeId", "category") DO UPDATE SET
  "grossSales" = EXCLUDED."grossSales",
  "refunds" = EXCLUDED."refunds",
  "netRevenue" = EXCLUDED."netRevenue",
  "unitsSold" = EXCLUDED."unitsSold",
  "productCount" = EXCLUDED."productCount",
  "updatedAt" = NOW();

-- Step 5: Backfill WeeklyBrandSummary
INSERT INTO "WeeklyBrandSummary" (
  "weekStart",
  "storeId",
  "brand",
  "grossSales",
  "refunds",
  "netRevenue",
  "unitsSold",
  "createdAt",
  "updatedAt"
)
SELECT 
  get_monday(im.date::DATE) as week_start,
  im."storeId",
  COALESCE(p."brand", 'Unknown') as brand,
  
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as gross_sales,
    
  COALESCE(SUM(CASE WHEN im.type = 'refund' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as refunds,
    
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    WHEN im.type = 'refund' 
    THEN -ABS(im."changeQty") * COALESCE(p."retailPrice", 0) 
    ELSE 0 END), 0) as net_revenue,
    
  COALESCE(SUM(CASE WHEN im.type = 'sale' 
    THEN ABS(im."changeQty") 
    ELSE 0 END), 0)::INTEGER as units_sold,
  
  NOW() as created_at,
  NOW() as updated_at
  
FROM "InventoryMovement" im
JOIN "ProductCatalog" p ON im."productId" = p.id
GROUP BY 
  get_monday(im.date::DATE),
  im."storeId",
  COALESCE(p."brand", 'Unknown')
ON CONFLICT ("weekStart", "storeId", "brand") DO UPDATE SET
  "grossSales" = EXCLUDED."grossSales",
  "refunds" = EXCLUDED."refunds",
  "netRevenue" = EXCLUDED."netRevenue",
  "unitsSold" = EXCLUDED."unitsSold",
  "updatedAt" = NOW();

-- Step 6: Verify results
SELECT 
  'WeeklySalesSummary' as table_name,
  COUNT(*) as total_rows,
  MIN("weekStart") as earliest_week,
  MAX("weekStart") as latest_week
FROM "WeeklySalesSummary"
UNION ALL
SELECT 
  'WeeklyCategorySummary',
  COUNT(*),
  MIN("weekStart"),
  MAX("weekStart")
FROM "WeeklyCategorySummary"
UNION ALL
SELECT 
  'WeeklyBrandSummary',
  COUNT(*),
  MIN("weekStart"),
  MAX("weekStart")
FROM "WeeklyBrandSummary";

-- Step 7: Clean up temporary functions (optional - can keep for future use)
-- DROP FUNCTION IF EXISTS get_monday(DATE);
-- DROP FUNCTION IF EXISTS get_time_bucket(INT);
