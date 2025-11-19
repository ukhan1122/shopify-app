/**
 * Service for handling Shopify size operations
 */
export class ShopifySizeService {
  
  /**
   * Extract sizes from Shopify products with product titles
   */
  static extractSizesFromProducts(products) {
    const sizes = [];
    
    products.forEach((product) => {
      try {
        const productData = product.node || product;
        const size = this.extractProductSize(productData);
        
        if (size && size.trim() !== '' && !this.isGenericSize(size)) {
          const normalizedSize = this.normalizeSize(size);
          sizes.push({
            standard_size: normalizedSize,
            product_title: productData.title
          });
        }
      } catch (error) {
        console.error('Error extracting size from product:', error);
      }
    });
    
    return sizes;
  }

  /**
   * Extract size from product using multiple methods
   */
  static extractProductSize(product) {
    // Method 1: Check variants for size options
    if (product.variants?.edges?.length > 0) {
      const sizeFromVariants = this.extractSizeFromVariants(product.variants.edges);
      if (sizeFromVariants) {
        return sizeFromVariants;
      }
    }

    // Method 2: Check product options
    if (product.options?.length > 0) {
      const sizeFromOptions = this.extractSizeFromOptions(product.options);
      if (sizeFromOptions) {
        return sizeFromOptions;
      }
    }

    // Method 3: Extract from title
    const sizeFromTitle = this.extractSizeFromTitle(product.title);
    if (sizeFromTitle) {
      return sizeFromTitle;
    }

    // Method 4: Check tags for size
    const sizeFromTags = this.extractSizeFromTags(product.tags);
    if (sizeFromTags) {
      return sizeFromTags;
    }

    return 'One Size';
  }

  /**
   * Extract size from product variants
   */
  static extractSizeFromVariants(variants) {
    for (const variantEdge of variants) {
      const variant = variantEdge.node;
      if (variant.selectedOptions?.length > 0) {
        const sizeOption = variant.selectedOptions.find(option => 
          option.name.toLowerCase().includes('size')
        );
        if (sizeOption?.value && sizeOption.value !== 'Default Title') {
          return sizeOption.value;
        }
      }
    }
    return null;
  }

  /**
   * Extract size from product options
   */
  static extractSizeFromOptions(options) {
    for (const option of options) {
      if (option.name.toLowerCase().includes('size') && option.values?.length > 0) {
        const sizeValue = option.values.find(value => 
          value && value !== 'Default Title'
        );
        if (sizeValue) {
          return sizeValue;
        }
      }
    }
    return null;
  }

  /**
   * Extract size from product title
   */
  static extractSizeFromTitle(title) {
    if (!title) return null;
    
    const sizePatterns = [
      /\b(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL)\b/i,
      /\b(Extra Small|Small|Medium|Large|Extra Large|2X Large|3X Large)\b/i,
      /\b(One Size|OSFA|One Size Fits All)\b/i,
      /\b(\d+(?:\.\d+)?[A-Z]*)\s*(?:inch|in|"|')?\b/i,
    ];
    
    for (const pattern of sizePatterns) {
      const match = title.match(pattern);
      if (match) {
        return this.normalizeSize(match[0]);
      }
    }
    
    return null;
  }

  /**
   * Extract size from product tags
   */
  static extractSizeFromTags(tags) {
    if (!tags) return null;
    
    let tagList = [];
    
    if (Array.isArray(tags)) {
      tagList = tags.map(tag => tag.trim().toLowerCase());
    } else if (typeof tags === 'string') {
      tagList = tags.split(',').map(tag => tag.trim().toLowerCase());
    } else {
      return null;
    }
    
    const sizeKeywords = {
      'xs': ['xs', 'extra small', 'extra-small'],
      's': ['s', 'small'],
      'm': ['m', 'medium'],
      'l': ['l', 'large'],
      'xl': ['xl', 'extra large', 'extra-large', 'x-large'],
      'xxl': ['xxl', '2xl', '2x large', 'double xl'],
      'xxxl': ['xxxl', '3xl', '3x large', 'triple xl'],
      'one size': ['one size', 'osfa', 'one size fits all', 'fits all']
    };
    
    for (const [standardSize, keywords] of Object.entries(sizeKeywords)) {
      for (const keyword of keywords) {
        if (tagList.some(tag => tag.includes(keyword))) {
          return standardSize;
        }
      }
    }
    
    return null;
  }

  /**
   * Normalize size for consistency
   */
  static normalizeSize(size) {
    if (!size) return 'One Size';
    
    const lowerSize = size.toLowerCase().trim();
    
    const sizeMap = {
      'xs': 'XS',
      'extra small': 'XS',
      'extra-small': 'XS',
      's': 'S',
      'small': 'S',
      'm': 'M',
      'medium': 'M',
      'l': 'L',
      'large': 'L',
      'xl': 'XL',
      'extra large': 'XL',
      'extra-large': 'XL',
      'x-large': 'XL',
      'xxl': 'XXL',
      '2xl': 'XXL',
      '2x large': 'XXL',
      'xxxl': 'XXXL',
      '3xl': 'XXXL',
      '3x large': 'XXXL',
      'one size': 'One Size',
      'osfa': 'One Size',
      'one size fits all': 'One Size'
    };
    
    return sizeMap[lowerSize] || this.formatSize(size);
  }

  /**
   * Format numeric sizes
   */
  static formatSize(size) {
    const numericMatch = size.match(/^(\d+(?:\.\d+)?)([A-Z]*)$/i);
    if (numericMatch) {
      const number = numericMatch[1];
      const letter = numericMatch[2] || '';
      return `${number}${letter}`.toUpperCase();
    }
    
    return size.charAt(0).toUpperCase() + size.slice(1).toLowerCase();
  }

  /**
   * Check if size is generic (not worth storing)
   */
  static isGenericSize(size) {
    if (!size) return true;
    
    const genericSizes = [
      'default title',
      'title',
      'default',
      'none',
      'unknown',
      'not specified'
    ];
    
    return genericSizes.some(generic => 
      size.toLowerCase().includes(generic)
    );
  }

  /**
   * Sync sizes to backend database
   */
  static async syncSizesToBackend(shopDomain, sizes) {
    try {
      const validSizes = sizes.filter(size => 
        size.standard_size && size.standard_size !== 'One Size' && 
        !this.isGenericSize(size.standard_size) && size.product_title
      );

      if (validSizes.length === 0) {
        return {
          success: true,
          message: 'No valid sizes to sync',
          data: { sizes_created: 0, sizes_existing: 0, total_processed: 0 }
        };
      }

      const baseUrl = process.env.BACKEND_URL;
      const fullUrl = `${baseUrl}v1/shopify/sizes/sync`;
      
      const requestBody = {
        shop_domain: shopDomain,
        sizes: validSizes
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
      console.error('Sizes sync error:', error);
      throw error;
    }
  }
}