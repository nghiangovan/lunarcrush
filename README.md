# LunarCrush API Integration

A Node.js module for fetching and storing cryptocurrency data from the LunarCrush API. This module provides real-time access to social metrics, market data, and analytics for cryptocurrencies.

## Features

- **API Integration**

  - Real-time cryptocurrency data fetching
  - Social metrics collection
  - Market data aggregation
  - Galaxy scores and Alt rankings

- **Data Management**

  - MongoDB storage with optimized indexing
  - Automatic collection management
  - Historical data tracking
  - Efficient bulk operations

- **Error Handling**
  - API rate limit management
  - Network error recovery
  - Data validation
  - Connection retry logic

## Prerequisites

- Node.js (v16 or higher)
- MongoDB
- LunarCrush API key

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd lunarcrush
```

2. Install dependencies:

```bash
yarn install
```

3. Configure environment variables:

```bash
cp .env.example .env
# Edit .env with your settings
```

## Configuration

### Environment Variables (.env)

```env
MONGO_URL=mongodb://localhost:27017/crypto_db
LUNARCRUSH_API_KEY=your_api_key_here
```

### Usage Example

```javascript
const LunarCrush = require('./LunarCrush');

const lunarCrush = new LunarCrush({
  mongoUrl: 'mongodb://localhost:27017/crypto_db',
  collectionName: 'lunarcrush_data',
  apiKey: 'your_api_key_here',
});

// Initialize and fetch data
async function fetchData() {
  await lunarCrush.ensureCollection();
  const data = await lunarCrush.fetchCryptocurrencies();
  await lunarCrush.saveToMongoDB(data);
}
```

## API Methods

### `ensureCollection()`

Initializes MongoDB collection with required indexes.

```javascript
await lunarCrush.ensureCollection();
```

### `fetchCryptocurrencies()`

Fetches current cryptocurrency data from LunarCrush API.

```javascript
const data = await lunarCrush.fetchCryptocurrencies();
```

### `saveToMongoDB(data)`

Stores cryptocurrency data in MongoDB.

```javascript
const savedCount = await lunarCrush.saveToMongoDB(data);
```

### `getLatestTokenData(symbol)`

Retrieves most recent data for a specific token.

```javascript
const btcData = await lunarCrush.getLatestTokenData('BTC');
```

### `getTokenUpdatesForDay(symbol, date)`

Gets all updates for a token on a specific date.

```javascript
const updates = await lunarCrush.getTokenUpdatesForDay('BTC', new Date());
```

## Data Structure

### Stored Token Data

```javascript
{
  id: String,
  symbol: String,
  name: String,
  price: Number,
  price_btc: Number,
  volume_24h: Number,
  market_cap: Number,
  market_cap_rank: Number,
  galaxy_score: Number,
  alt_rank: Number,
  social_dominance: Number,
  market_dominance: Number,
  // ... additional fields
  fetchedAt: Date,
  updateTimestamp: Date
}
```

## Testing

Run the test suite:

```bash
yarn test
```

This will execute `testUseLunarCrush.js` which demonstrates:

1. Database connection
2. API data fetching
3. Data storage
4. Token data retrieval
5. Multiple updates handling

## Development

### Debug Mode

```bash
yarn dev
```

### VS Code Launch Configurations

The project includes VS Code launch configurations for:

- Debugging current file
- Debugging with Nodemon
- Attaching to process

## Error Handling

The module includes comprehensive error handling for:

- API connection issues
- Rate limiting
- Database errors
- Data validation
- Network timeouts

## Troubleshooting

### API Issues

- Verify API key in .env
- Check API rate limits
- Ensure network connectivity

### MongoDB Issues

- Verify MongoDB connection string
- Check database permissions
- Ensure indexes are created

## Scripts

```json
{
  "start": "node index.js",
  "dev": "nodemon index.js",
  "test": "node testUseLunarCrush.js"
}
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Implement changes
4. Add/update tests
5. Submit pull request

## License

[Your License]

## Support

For issues and feature requests, please open an issue in the repository.
