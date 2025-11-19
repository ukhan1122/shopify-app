/**
 * Service for syncing Shopify products to backend database
 */
export class ShopifyProductService {
  
  /**
   * Sync products to backend database
   */
  static async syncProductsToBackend(shopDomain, products) {
    try {
      const baseUrl = process.env.BACKEND_URL;
      const fullUrl = `${baseUrl}v1/shopify/products/sync`;
      
      const requestBody = {
        shop_domain: shopDomain,
        products: products
      };
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': process.env.SHOPIFY_API_TOKEN,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Backend product sync error:', error);
      throw error;
    }
  }

  /**
   * Get updated products from backend database
   */
  static async getProductsFromBackend(storeDomain) {
    try {
      const baseUrl = process.env.BACKEND_URL;
      const fullUrl = `${baseUrl}v1/shopify/products?shop_domain=${storeDomain}`;
      
      console.log(`📥 Fetching updated products from: ${fullUrl}`);
      
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': process.env.SHOPIFY_API_TOKEN,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.status === 'success') {
        console.log(`✅ Got ${result.data.products.length} updated products from backend`);
        return result.data.products;
      }
      
      return [];
      
    } catch (error) {
      console.error('❌ Error getting products from backend:', error);
      return [];
    }
  }

  /**
   * Fetch products from Shopify API with proper categories using admin.graphql
   */
  static async fetchShopifyProductsWithCategories(admin) {
    try {
      if (!admin || typeof admin.graphql !== 'function') {
        throw new Error('admin.graphql not available for fetching products');
      }

      const productsResponse = await admin.graphql(
        `#graphql
          query {
            products(first: 50) {
              nodes {
                id
                title
                description
                vendor
                productType
                tags
                totalInventory
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                collections(first: 5) {
                  nodes {
                    id
                    title
                    handle
                  }
                }
                variants(first: 5) {
                  nodes {
                    inventoryQuantity
                    price
                  }
                }
                featuredImage {
                  url
                }
              }
            }
          }
        `
      );

      const productsData = await productsResponse.json();
      
      if (productsData.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(productsData.errors)}`);
      }

      return productsData.data.products.nodes;

    } catch (error) {
      console.error('Failed to fetch Shopify products with categories:', error);
      throw error;
    }
  }

  /**
   * Transform Shopify products to match backend database format with proper categories
   */
  static transformProductsForBackend(shopifyProducts) {
    return shopifyProducts.map(product => {
      try {
        const category = this.determineProductCategory(product);
        const quantity = product.totalInventory || 0;
        const price = parseFloat(product.priceRange?.minVariantPrice?.amount) || 0;
        
        return {
          shopify_id: product.id,
          title: product.title || 'Untitled Product',
          description: this.cleanDescription(product.description) || 'Imported from Shopify',
          brand: product.vendor || 'Unknown Brand',
          category: category,
          product_type: product.productType,
          tags: Array.isArray(product.tags) ? product.tags.join(', ') : product.tags,
          quantity: quantity,
          price: Math.round(price),
          condition: 'new',
          shopify_product_id: product.id
        };

      } catch (error) {
        console.error(`Error transforming product "${product.title}":`, error);
        return {
          shopify_id: product.id,
          title: product.title || 'Untitled Product',
          description: 'Imported from Shopify',
          brand: product.vendor || 'Unknown Brand',
          category: 'General',
          product_type: product.productType || '',
          tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''),
          quantity: product.totalInventory || 0,
          price: 0,
          condition: 'new',
          shopify_product_id: product.id
        };
      }
    });
  }

  /**
   * Determine proper product category using Shopify's actual category fields
   */
  static determineProductCategory(product) {
    // Priority order: product_type → tags → vendor → title detection → default
    
    if (product.productType && product.productType.trim() !== '') {
      return this.normalizeCategory(product.productType);
    }
    
    const categoryFromTags = this.extractCategoryFromTags(product.tags);
    if (categoryFromTags) {
      return categoryFromTags;
    }
    
    if (product.vendor && !this.isGenericVendor(product.vendor)) {
      return this.normalizeCategory(product.vendor);
    }
    
    return this.detectCategoryFromTitle(product.title);
  }

  /**
   * Extract category from Shopify tags (handles both array and string formats)
   */
  static extractCategoryFromTags(tags) {
    if (!tags) return null;
    
    let tagList = [];
    
    if (Array.isArray(tags)) {
      tagList = tags.map(tag => tag.trim().toLowerCase());
    } else if (typeof tags === 'string') {
      tagList = tags.split(',').map(tag => tag.trim().toLowerCase());
    } else {
      return null;
    }
    
    const categoryKeywords = {
      'Snowboards': ['snowboard', 'snowboards', 'board'],
      'Ski Equipment': ['ski', 'skis', 'skiing', 'wax'],
      'Winter Sports': ['winter', 'snow', 'cold', 'mountain'],
      'Accessories': ['accessory', 'accessories', 'gear', 'equipment'],
      'Apparel': ['clothing', 'apparel', 'jacket', 'pants', 'gloves'],
      'Electronics': ['electronic', 'camera', 'gopro', 'video', 'photography'],
      'Gift Cards': ['gift', 'giftcard', 'voucher'],
      'Collections': ['collection', 'hydrogen', 'oxygen', 'liquid', 'series']
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (tagList.some(tag => tag.includes(keyword))) {
          return category;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if vendor is generic (not suitable as category)
   */
  static isGenericVendor(vendor) {
    if (!vendor) return true;
    
    const genericVendors = [
      'my-shop-dev',
      'shopify',
      'admin',
      'test',
      'demo',
      'unknown',
      'none'
    ];
    
    return genericVendors.some(generic => 
      vendor.toLowerCase().includes(generic.toLowerCase())
    );
  }

  /**
   * Normalize category names for consistency
   */
  static normalizeCategory(category) {
    if (!category) return 'General';
    
    const normalizationMap = {
      'snowboard': 'Snowboards',
      'ski': 'Ski Equipment',
      'winter': 'Winter Sports',
      'accessory': 'Accessories',
      'electronic': 'Electronics',
      'gift': 'Gift Cards',
      'giftcard': 'Gift Cards',
      'collection': 'Collections'
    };
    
    const lowerCategory = category.toLowerCase();
    
    for (const [key, value] of Object.entries(normalizationMap)) {
      if (lowerCategory.includes(key)) {
        return value;
      }
    }
    
    return category.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Fallback: Detect category from product title
   */
  static detectCategoryFromTitle(title) {
    if (!title) return 'Sports Equipment';
    
    const lowerTitle = title.toLowerCase();
    
    const categoryMapping = [
      { keywords: ['snowboard', 'snow board'], category: 'Snowboards' },
      { keywords: ['ski wax', 'ski'], category: 'Ski Equipment' },
      { keywords: ['gift card', 'giftcard'], category: 'Gift Cards' },
      { keywords: ['hydrogen', 'oxygen', 'liquid'], category: 'Collections' },
      { keywords: ['videographer', 'camera'], category: 'Electronics' },
      { keywords: ['wax'], category: 'Accessories' },
      { keywords: ['minimal', 'complete', 'draft', 'archived', 'compare', 'out of stock', 'multi-location', 'fulfilled'], category: 'Snowboards' }
    ];
    
    for (const mapping of categoryMapping) {
      for (const keyword of mapping.keywords) {
        if (lowerTitle.includes(keyword)) {
          return mapping.category;
        }
      }
    }
    
    return 'Sports Equipment';
  }

  /**
   * Clean HTML description from Shopify
   */
  static cleanDescription(html) {
    if (!html) return '';
    
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .substring(0, 500);
  }

  /**
   * Test backend connection
   */
  static async testBackendConnection(shopDomain) {
    try {
      const testProduct = {
        shopify_id: 'gid://shopify/Product/test_123456',
        title: 'TEST PRODUCT',
        description: 'This is a test product',
        brand: 'Test Brand',
        category: 'Test Category',
        quantity: 10,
        price: 99.99,
        condition: 'new'
      };

      const result = await this.syncProductsToBackend(shopDomain, [testProduct]);
      return result;
      
    } catch (error) {
      console.error('Backend test failed:', error);
      return { success: false, error: error.message };
    }
  }
}