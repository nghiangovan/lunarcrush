require('dotenv').config();
const LunarCrush = require('./LunarCrush');

async function testLunarCrush() {
  console.log(process.env.MONGO_URL);


  // Initialize LunarCrush instance with custom configuration
  const lunarCrush = new LunarCrush({
    mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/crypto_db',
    collectionName: 'lunarcrush_test',

  });

  try {
    console.log('1. Testing database connection and collection setup...');
    await lunarCrush.ensureCollection();
    console.log('✅ Database connection and collection setup successful\n');

    console.log('2. Fetching cryptocurrency data from LunarCrush API...');
    const cryptoData = await lunarCrush.fetchCryptocurrencies();
    console.log(`✅ Successfully fetched ${cryptoData.data.length} cryptocurrencies`);
    console.log('Sample data for first token:');
    console.log(JSON.stringify(cryptoData.data[0], null, 2), '\n');

    console.log('3. Saving data to MongoDB...');
    const savedCount = await lunarCrush.saveToMongoDB(cryptoData);
    console.log(`✅ Successfully processed ${savedCount} tokens\n`);

    console.log('4. Testing token data retrieval...');
    // Get data for Bitcoin as an example
    const btcData = await lunarCrush.getLatestTokenData('BTC');
    console.log('Bitcoin data:');
    console.log(JSON.stringify(btcData, null, 2), '\n');

    // Get data for Ethereum as another example
    const ethData = await lunarCrush.getLatestTokenData('ETH');
    console.log('Ethereum data:');
    console.log(JSON.stringify(ethData, null, 2), '\n');

    console.log('5. Testing multiple updates in one day...');
    // First update
    await lunarCrush.saveToMongoDB(cryptoData);
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Second update
    await lunarCrush.saveToMongoDB(cryptoData);

    // Check updates for a specific token
    const btcUpdates = await lunarCrush.getTokenUpdatesForDay('BTC');
    console.log('BTC updates today:', JSON.stringify(btcUpdates, null, 2));
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('5. Cleaning up...');
    await lunarCrush.close();
    console.log('✅ Connection closed');
  }
}

// Run the test
console.log('Starting LunarCrush Test...\n');
testLunarCrush().catch(console.error);

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Cleaning up...');
  process.exit();
});
