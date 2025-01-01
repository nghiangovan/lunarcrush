const axios = require('axios');
const { MongoClient } = require('mongodb');

class LunarCrush {
  constructor(config = {}) {
    this.mongoUrl = config.mongoUrl || 'mongodb://localhost:27017/crypto_db';
    this.collectionName = config.collectionName || 'lunarcrush_data';
    this.apiKey = config.apiKey || 'usal7skqo73e9i4m5bzdrnr5h9dexq';
    this.mongoClient = null;
  }

  async ensureCollection() {
    try {
      if (!this.mongoClient) {
        this.mongoClient = new MongoClient(this.mongoUrl);
        await this.mongoClient.connect();
      }
      const db = this.mongoClient.db();

      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(col => col.name);

      if (!collectionNames.includes(this.collectionName)) {
        await db.createCollection(this.collectionName);
        console.log(`Created collection: ${this.collectionName}`);

        await db.collection(this.collectionName).createIndex({ symbol: 1, fetchedAt: 1 }, { unique: true });
        console.log(`Created index for: ${this.collectionName}`);
      }
    } catch (error) {
      console.error('Error ensuring collection:', error);
      throw error;
    }
  }

  async fetchCryptocurrencies() {
    try {
      console.log('Starting LunarCrush API request...');
      const response = await axios({
        method: 'GET',
        url: 'https://lunarcrush.com/api3/storm/category/cryptocurrencies',
        headers: {
          'authorization': `Bearer ${this.apiKey}`,
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'x-lunar-client': 'yolo',
          'Referer': 'https://lunarcrush.com/categories/cryptocurrencies',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });

      const rawData = response.data;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const cleanedData = {
        category: rawData.category,
        data: rawData.data.map(token => ({
          ...token,
          fetchedAt: today,
          updateTimestamp: new Date(),
        })),
      };

      return cleanedData;
    } catch (error) {
      if (error.response) {
        console.error('LunarCrush API error:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('No response from LunarCrush:', error.request);
      } else {
        console.error('Error setting up request:', error.message);
      }
      throw error;
    }
  }

  async saveToMongoDB(data) {
    try {
      if (!this.mongoClient) {
        this.mongoClient = new MongoClient(this.mongoUrl);
        await this.mongoClient.connect();
      }
      const db = this.mongoClient.db();
      const collection = db.collection(this.collectionName);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const projectsWithMetadata = data.data
        .map(token => {
          // Skip tokens with no symbol
          if (!token.symbol) {
            return null;
          }

          return {
            id: token.id,
            symbol: token.symbol,
            name: token.name,
            price: token.price,
            price_btc: token.price_btc,
            volume_24h: token.volume_24h,
            volatility: token.volatility,
            circulating_supply: token.circulating_supply,
            max_supply: token.max_supply,
            percent_change_1h: token.percent_change_1h,
            percent_change_24h: token.percent_change_24h,
            percent_change_7d: token.percent_change_7d,
            market_cap: token.market_cap,
            market_cap_rank: token.market_cap_rank,
            interactions_24h: token.interactions_24h,
            social_dominance: token.social_dominance,
            market_dominance: token.market_dominance,
            market_dominance_prev: token.market_dominance_prev,
            galaxy_score: token.galaxy_score,
            galaxy_score_previous: token.galaxy_score_previous,
            alt_rank: token.alt_rank,
            alt_rank_previous: token.alt_rank_previous,
            sentiment: token.sentiment,
            social_volume_24h_rank: token.social_volume_24h_rank,
            volume_24h_rank: token.volume_24h_rank,
            categories: token.categories,
            percent_change_30d: token.percent_change_30d,
            s: token.s,
            n: token.n,
            tp: token.tp,
            tc: token.tc,
            tr: token.tr,
            tr_p_1h: token.tr_p_1h,
            tr_p_24h: token.tr_p_24h,
            sd: token.sd,
            e1h: token.e1h,
            e24h: token.e24h,
            interactions_24h_prev: token.interactions_24h_prev,
            ags: token.ags,
            cc: token.cc,
            ca: token.ca,
            contributors_active_prev: token.contributors_active_prev,
            psc: token.psc,
            psa: token.psa,
            social_volume: token.social_volume,
            fetchedAt: today,
            updateTimestamp: new Date(),
          };
        })
        .filter(token => token !== null); // Filter out null tokens

      const bulkOps = projectsWithMetadata.map(token => ({
        updateOne: {
          filter: {
            symbol: token.symbol,
            fetchedAt: token.fetchedAt,
          },
          update: {
            $set: token,
            $inc: { updateCount: 1 },
          },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        const result = await collection.bulkWrite(bulkOps);
        console.log(`Processed ${result.upsertedCount} new tokens, modified ${result.modifiedCount} existing tokens`);
      }

      return bulkOps.length;
    } catch (error) {
      console.error('MongoDB operation failed:', error);
      throw error;
    }
  }

  async getLatestTokenData(symbol) {
    try {
      if (!this.mongoClient) {
        this.mongoClient = new MongoClient(this.mongoUrl);
        await this.mongoClient.connect();
      }
      const db = this.mongoClient.db();
      const collection = db.collection(this.collectionName);

      return await collection.findOne({ symbol }, { sort: { fetchedAt: -1 } });
    } catch (error) {
      console.error('Error fetching token data:', error);
      throw error;
    }
  }

  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
    }
  }

  // Add a helper method to get updates for a specific token on a specific date
  async getTokenUpdatesForDay(symbol, date = new Date()) {
    try {
      if (!this.mongoClient) {
        this.mongoClient = new MongoClient(this.mongoUrl);
        await this.mongoClient.connect();
      }
      const db = this.mongoClient.db();
      const collection = db.collection(this.collectionName);

      // Set the date to start of day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      // Set end of day
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      return await collection.findOne({
        symbol,
        fetchedAt: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      });
    } catch (error) {
      console.error('Error fetching token updates:', error);
      throw error;
    }
  }
}

module.exports = LunarCrush;
