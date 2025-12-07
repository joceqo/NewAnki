# Install Drizzle ORM Dependencies

Run these commands to install Drizzle ORM:

```bash
# Core dependencies
npm install drizzle-orm

# Already installed (check package.json)
# npm install @op-engineering/op-sqlite

# Development dependencies for migrations
npm install -D drizzle-kit
```

## Optional: SQLiteCloud Integration

If using SQLiteCloud for sync:
```bash
npm install @sqlitecloud/react-native
```

## Verify Installation

After installation, check that these are in package.json:
- drizzle-orm
- @op-engineering/op-sqlite
- drizzle-kit (devDependencies)
