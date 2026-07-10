EUC Audit Readiness CSV Package

1. In Power BI Desktop, choose Get Data > Text/CSV.
2. Import each CSV file.
3. In Power Query:
   - Set IDs to Text.
   - Set DateKey fields to Whole Number.
   - Set TRUE/FALSE fields to Boolean.
   - Set date fields to Date.
   - Set CollectedAt fields to Date/Time.
4. Create the relationships in PowerBI_Relationships.txt.
5. Create a blank table named _Measures.
6. Copy the measures from EUC_Audit_Readiness_Measures.dax.
7. Format all measures ending in % as Percentage.
8. Mark Dim_Date as the date table.

All records are synthetic and contain no production data.
