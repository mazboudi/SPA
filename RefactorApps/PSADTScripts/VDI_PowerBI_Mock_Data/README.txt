VDI / Windows 365 Power BI Mock Dataset
Generated: 2026-07-07T16:21:45
Purpose: Mock data package aligned to the SOW reporting scope for Windows 365 / Exoprise and EUC dashboards.

Dashboards covered:
- W365 Platform Overview Dashboard
- Inventory Dashboard
- Service Health Dashboard
- User Dashboard
- Cost Dashboard
- MacOS Platform Overview Dashboard
- Inventory Dashboard - Mac
- Compliance Dashboard

Important notes:
- This is synthetic/mock data only. No real user, company, device, cost, IP, or incident data is included.
- User emails use example.com.
- Dataset includes 14,000 mock Windows 365 Cloud PCs across six global regions.
- Large fact tables are provided as CSV for Power BI import.
- Use Relationships.csv to model the star schema in Power BI.
- Use DAXMeasures.csv as starter measures.

Suggested Power BI load order:
1. Import all Dim*.csv tables.
2. Import Fact*.csv tables.
3. Set relationships using Relationships.csv.
4. Mark DimDate as the date table using DimDate[Date].
5. Add DAX measures from DAXMeasures.csv.
6. Build report pages from DashboardMapping.csv.

Table row counts:
- DimDate: 90 rows
- DimRegion: 6 rows
- DimBusinessUnit: 12 rows
- DimUser: 14,000 rows
- DimCloudPC: 14,000 rows
- DimMacOS: 1,500 rows
- FactCloudPCUsage: 420,000 rows
- FactExopriseSynthetic: 21,600 rows
- FactServiceHealth: 120 rows
- FactCost: 1,728 rows
- FactNetworkTraffic: 180 rows
- FactCompliance: 76,000 rows
- DashboardMapping: 9 rows
- Relationships: 16 rows
- DAXMeasures: 18 rows
- Thresholds: 8 rows
