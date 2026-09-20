# Sample data

`demo-leads.csv` is **fictional**. It exists so you can click around a populated
app before you have real prospects.

- Every company name ends in `(Demo)`.
- Every phone number comes from [Ofcom's reserved drama/fiction ranges]
  (01632 960xxx, 07700 900xxx, 020 7946 0xxx, 0nn1 496 0xxx and so on), so
  nothing in this file can dial a real business.
- Every website is on `.example.com`, a reserved domain that resolves nowhere.

Load it:

```bash
npm run seed:demo
```

Remove it again:

```bash
npm run seed:demo -- --purge
```

The column headings deliberately match an Apify / Outscraper Google Maps export,
so the file doubles as a reference for the shape the importer expects.
