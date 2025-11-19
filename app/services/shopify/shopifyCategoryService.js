/**
 * Enhanced Shopify Product Category Service
 * Fetches product categories with automatic parent-child hierarchy
 */
class ShopifyProductCategoryService {
  /**
   * Fetch product categories from Shopify with full hierarchy
   */
  static async fetchShopifyProductCategories(shopDomain, accessToken) {
    try {
      const response = await fetch(
        `https://${shopDomain}/admin/api/2024-01/products.json?fields=id,title,product_type&limit=250`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const productsData = await response.json();
      const products = productsData.products || [];
      
      const categories = new Map();
      products.forEach(product => {
        if (product.product_type && product.product_type.trim() !== '') {
          const categoryName = product.product_type.trim();
          const categoryInfo = {
            name: categoryName,
            group: this.determineCategoryGroup(categoryName),
            source: 'product_types'
          };
          categories.set(categoryName, categoryInfo);
        }
      });

      return Array.from(categories.values());
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      throw error;
    }
  }

  /**
   * Fetch categories with automatic hierarchy using GraphQL
   */
  static async fetchShopifyProductCategoriesGraphQL(admin, shopDomain) {
    try {
      const response = await admin.graphql(`
        query {
          products(first: 250) {
            nodes {
              title
              productType
              category {
                name
                fullName
                level
                isRoot
              }
            }
          }
        }
      `);

      const data = await response.json();
      const products = data.data.products.nodes;
      
      const categories = new Map();
      
      products.forEach(product => {
        if (product.category && product.category.fullName) {
          const categoryInfo = this.extractCategoryHierarchy(product.category.fullName);
          const uniqueKey = `${categoryInfo.group}|${categoryInfo.name}`;
          
          categories.set(uniqueKey, {
            name: categoryInfo.name,
            group: categoryInfo.group,
            level: product.category.level,
            isRoot: product.category.isRoot,
            source: 'category_hierarchy'
          });
        } else if (product.productType && product.productType.trim() !== '') {
          const categoryName = product.productType.trim();
          const categoryInfo = {
            name: categoryName,
            group: this.determineCategoryGroup(categoryName),
            source: 'product_types_fallback'
          };
          const uniqueKey = `${categoryInfo.group}|${categoryInfo.name}`;
          categories.set(uniqueKey, categoryInfo);
        }
      });

      return Array.from(categories.values());

    } catch (error) {
      console.error('GraphQL category hierarchy fetch failed:', error);
      throw error;
    }
  }

  /**
   * Automatic category hierarchy extraction from fullName
   */
  static extractCategoryHierarchy(fullName) {
    if (!fullName || typeof fullName !== 'string') {
      return { group: 'Other', name: 'Uncategorized' };
    }

    const parts = fullName.split(' > ').filter(part => part.trim() !== '');
    
    if (parts.length === 0) {
      return { group: 'Other', name: 'Uncategorized' };
    }
    
    if (parts.length === 1) {
      return { 
        group: parts[0], 
        name: parts[0] 
      };
    }
    
    return {
      group: parts[0],
      name: parts[parts.length - 1]
    };
  }

  /**
   * Determine category group based on category names
   */
  static determineCategoryGroup(categoryName) {
    if (!categoryName) return 'Other';
    
    const lowerName = categoryName.toLowerCase();
    
    if (lowerName.includes('snowboard') || 
        lowerName.includes('ski') || 
        lowerName.includes('winter sports')) {
      return 'Sporting Goods';
    } else if (lowerName.includes('gift card') || lowerName.includes('gift')) {
      return 'Gift Cards';
    } else if (lowerName.includes('toy') || lowerName.includes('game')) {
      return 'Toys & Games';
    } else if (lowerName.includes('accessory') || lowerName.includes('gear')) {
      return 'Accessories';
    } else if (lowerName.includes('clothing') || lowerName.includes('apparel')) {
      return 'Clothing';
    } else if (lowerName.includes('shoe') || lowerName.includes('footwear')) {
      return 'Footwear';
    } else {
      return 'Other';
    }
  }

  /**
   * Filter out generic/administrative collections
   */
  static isGenericCollection(collectionTitle) {
    if (!collectionTitle) return true;
    
    const lowerTitle = collectionTitle.toLowerCase();
    const genericCollections = [
      'home page',
      'frontpage',
      'all',
      'front page',
      'main',
      'featured',
      'automated collection',
      'manual collection',
      'hydrogen',
      'vendor',
      'shopify',
      'admin',
      'test'
    ];
    
    return genericCollections.some(generic => 
      lowerTitle.includes(generic) || 
      generic === lowerTitle
    );
  }

  /**
   * Main sync method - uses automatic hierarchy extraction
   */
  static async syncShopifyProductCategories(shopDomain, accessToken, admin = null) {
    try { 
      let categories;
      
      if (admin) {
        categories = await this.fetchShopifyProductCategoriesGraphQL(admin, shopDomain);
      } else {
        categories = await this.fetchShopifyProductCategories(shopDomain, accessToken);
      }
      
      const syncResult = await this.syncCategoriesToBackend(shopDomain, categories);
      
      return {  
        success: true,
        data: {
          categories: categories,
          syncResult: syncResult,
          hierarchyEnabled: !!admin
        },
        message: `Successfully extracted ${categories.length} categories with automatic hierarchy`
      };
      
    } catch (error) {
      console.error('Category sync failed:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

/**
 * Sync categories to backend database
 */
static async syncCategoriesToBackend(shopDomain, categories) {
  console.log('🔧 syncCategoriesToBackend called with:', {
    shopDomain,
    categoriesCount: categories.length,
    sample: categories.slice(0, 2)
  });

  try {
    const baseUrl = process.env.BACKEND_URL || 'http://depop-backend.test/api/';
    const fullUrl = `${baseUrl}v1/shopify/categories/sync`;
    
    console.log('🔧 Making request to:', fullUrl);

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Token': process.env.SHOPIFY_API_TOKEN || 'your-token',
      },
      body: JSON.stringify({ 
        shop: shopDomain, 
        categories,
        replace_all: true
      })
    });

    console.log('🔧 Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend error:', errorText);
      throw new Error(`Backend responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Backend sync success:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Backend sync failed:', error);
    throw error;
  }
}
  }


export default ShopifyProductCategoryService;