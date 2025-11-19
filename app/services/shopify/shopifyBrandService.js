/**
 * Service for handling Shopify brand operations
 */
export class ShopifyBrandService {
  
  /**
   * Extract unique brands from Shopify products
   */
  static extractBrandsFromProducts(products) {
    const brands = new Set();
    
    products.forEach((product) => {
      try {
        const productData = product.node || product;
        const brandName = this.extractBrandName(productData);
        
        if (brandName && brandName.trim() !== '' && !this.isGenericBrand(brandName)) {
          const normalizedBrand = this.normalizeBrandName(brandName);
          brands.add(normalizedBrand);
        }
      } catch (error) {
        console.error('Error extracting brand from product:', error);
      }
    });
    
    return Array.from(brands).map(name => ({ name }));
  }

  /**
   * Extract brand name using multiple methods
   */
  static extractBrandName(product) {
    if (product.vendor?.trim()) {
      return product.vendor.trim();
    }
    
    if (product.productType?.trim()) {
      return product.productType.trim();
    }
    
    const brandFromTitle = this.extractBrandFromTitle(product.title);
    if (brandFromTitle) {
      return brandFromTitle;
    }
    
    if (product.metafields?.edges?.length > 0) {
      const brandMetafield = product.metafields.edges.find(edge => 
        edge.node.key?.toLowerCase().includes('brand') ||
        edge.node.namespace?.toLowerCase().includes('brand')
      );
      if (brandMetafield?.node?.value) {
        return brandMetafield.node.value;
      }
    }
    
    return null;
  }

  /**
   * Extract brand from product title
   */
  static extractBrandFromTitle(title) {
    if (!title) return null;
    
    const genericTerms = ['gift card', 'test product', 'sample', 'demo'];
    if (genericTerms.some(term => title.toLowerCase().includes(term))) {
      return null;
    }
    
    const brandPatterns = [
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+/,
      /by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i,
    ];
    
    for (const pattern of brandPatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const potentialBrand = match[1].trim();
        if (!this.isGenericBrand(potentialBrand)) {
          return potentialBrand;
        }
      }
    }
    
    return null;
  }

  /**
   * Normalize brand name for consistency
   */
  static normalizeBrandName(brandName) {
    if (!brandName) return 'Unknown Brand';
    
    return brandName
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s-]/g, '')
      .replace(/\b(inc|llc|co|corporation|company|brand|shopify|test|demo)\b/gi, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Sync brands to backend database
   */
  static async syncBrandsToBackend(shopDomain, brands) {
    try {
      const brandNames = brands.map(brand => brand.name).filter(name => 
        name && name !== 'Unknown Brand' && !this.isGenericBrand(name)
      );

      if (brandNames.length === 0) {
        return {
          success: true,
          message: 'No valid brands to sync',
          data: { brands_created: 0, brands_existing: 0, total_processed: 0 }
        };
      }

      const baseUrl = process.env.BACKEND_URL;
      const fullUrl = `${baseUrl}v1/shopify/brands/sync`;
      
      const requestBody = {
        shop_domain: shopDomain,
        brands: brandNames
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
      console.error('Brands sync error:', error);
      throw error;
    }
  }

  /**
   * Check if brand is generic (not worth storing)
   */
  static isGenericBrand(brandName) {
    if (!brandName) return true;
    
    const genericBrands = [
      'my-shop-dev',
      'shopify',
      'admin',
      'test',
      'demo',
      'unknown',
      'none',
      'generic',
      'sample',
      'example',
      'default',
      'product'
    ];
    
    const lowerBrand = brandName.toLowerCase();
    return genericBrands.some(generic => lowerBrand.includes(generic));
  }

  /**
   * Get user's brands from backend
   */
  static async getUserBrands(shopDomain) {
    try {
      const baseUrl = process.env.BACKEND_URL;
      const fullUrl = `${baseUrl}v1/shopify/brands/user`;
      
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': process.env.SHOPIFY_API_TOKEN,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Get user brands error:', error);
      throw error;
    }
  }
}