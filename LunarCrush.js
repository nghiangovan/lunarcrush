const axios = require('axios');
const { MongoClient } = require('mongodb');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Token cache management
let tokenCache = {
  value: null,
  expiresAt: null
};

class LunarCrush {
  constructor(config = {}) {
    this.mongoUrl = config.mongoUrl || 'mongodb://localhost:27017/crypto_db';
    this.collectionName = config.collectionName || 'lunarcrush_data';


    this.mongoClient = null;
    this.tokenExpiryHours = 12; // Token considered valid for 12 hours
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

  /**
   * Extracts the bearer token from LunarCrush's website
   * @returns {Promise<string>} The bearer token
   */
  async extractBearerToken() {
    console.log('Extracting LunarCrush bearer token...');
    let browser = null;
    
    try {
      // Launch a headless browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36');
      
      // Intercept network requests to find the token
      let bearerToken = null;
      await page.setRequestInterception(true);
      
      page.on('request', (request) => {
        const headers = request.headers();
        if (headers['authorization']?.startsWith('Bearer')) {
          bearerToken = headers['authorization'].split(' ')[1];
        }
        request.continue();
      });
      
      // Navigate to the page
      await page.goto('https://lunarcrush.com/categories/cryptocurrencies', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      // Wait for API calls to complete (use setTimeout for compatibility)
      await new Promise(res => setTimeout(res, 3000));
      
      // If we didn't intercept a token, try to extract it from network responses
      if (!bearerToken) {
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        
        // Wait for a response with authorization header
        const apiResponse = await page.waitForResponse(
          response => response.url().includes('api3/storm/category/cryptocurrencies'),
          { timeout: 10000 }
        );
        
        // Try to get token from the request that generated this response
        const request = apiResponse.request();
        const requestHeaders = request.headers();
        if (requestHeaders['authorization']?.startsWith('Bearer')) {
          bearerToken = requestHeaders['authorization'].split(' ')[1];
        }
      }
      
      if (bearerToken) {
        console.log('Successfully extracted LunarCrush bearer token');
        
        // Update token cache
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + this.tokenExpiryHours);
        tokenCache = { value: bearerToken, expiresAt };
        
        return bearerToken;
      } else {
        throw new Error('Could not extract bearer token from LunarCrush');
      }
    } catch (error) {
      console.error('Error extracting bearer token:', error.message);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
  
  /**
   * Gets a valid API token, either from cache or by extracting a new one
   * @returns {Promise<string>} The API token
   */
  async getApiToken() {
    // Check if we have a valid cached token
    const now = new Date();
    if (tokenCache.value && tokenCache.expiresAt > now) {
      return tokenCache.value;
    }
    
    // Extract a new token
    const token = await this.extractBearerToken();
    if (token) {
      return token;
    }
    
    // Fall back to the provided API key if extraction fails
    throw new Error('Failed to obtain a valid API token (token extraction failed)');
    throw new Error('Failed to obtain a valid API token (no fallback available)');
  }
  
  async fetchCryptocurrencies() {
    try {
      console.log('Starting LunarCrush API request...');
      
      // Ensure we have a valid token
      const apiKey = await this.getApiToken();
      if (!apiKey) {
        throw new Error('Failed to obtain a valid API token');
      }
      
      const response = await axios({
        method: 'GET',
        url: 'https://lunarcrush.com/api3/storm/category/cryptocurrencies',
        headers: {
          'authorization': `Bearer ${apiKey}`,
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
          if (!token.s) {
            return null;
          }

          return {
            id: token.id,
            symbol: token.s,
            name: token.n,
            price: token.price,
            price_btc: token.price_btc,
            volume_24h: token.v,
            volatility: token.vt,
            circulating_supply: token.cs,
            max_supply: token.max_supply,
            percent_change_1h: token.pch,
            percent_change_24h: token.pc,
            percent_change_7d: token.pc7d,
            market_cap: token.mc,
            market_cap_rank: token.mr,
            interactions_24h: token.e24h,
            social_dominance: token.sd,
            market_dominance: token.d,
            market_dominance_prev: token.dp,
            galaxy_score: token.gs,
            galaxy_score_previous: token.gs_p,
            alt_rank: token.acr,
            alt_rank_previous: token.acr_p,
            sentiment: token.ags,
            volume_24h_rank: token.vr,
            categories: token.categories,
            tp: token.tp,
            tc: token.tc,
            tr: token.tr,
            tr_p_1h: token.tr_p_1h,
            tr_p_24h: token.tr_p_24h,
            sd: token.sd,
            e24h: token.e24h,
            ags: token.ags,
            cc: token.cc,
            ca: token.ca,
            psc: token.psc,
            psa: token.psa,
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
