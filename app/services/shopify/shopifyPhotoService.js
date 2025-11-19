/**
 * Service for handling Shopify photo operations
 */
export class ShopifyPhotoService {
  
  /**
   * Extract all images from Shopify products
   */
  static extractImagesFromProducts(products) {
    const allImages = [];
    
    products.forEach((product) => {
      try {
        const productData = product.node || product;
        
        // Extract main featured image
        if (productData.featuredImage?.url) {
          allImages.push({
            product_title: productData.title,
            image_src: productData.featuredImage.url,
            shopify_product_id: productData.id,
            type: 'featured'
          });
        }
        
        // Extract additional images from images array
        if (productData.images?.edges?.length > 0) {
          productData.images.edges.forEach((imageEdge, imageIndex) => {
            if (imageEdge.node?.url) {
              allImages.push({
                product_title: productData.title,
                image_src: imageEdge.node.url,
                shopify_product_id: productData.id,
                type: imageIndex === 0 ? 'featured' : 'additional'
              });
            }
          });
        }
        
      } catch (error) {
        console.error(`Error extracting images from product:`, error);
      }
    });
    
    return allImages;
  }
  
  /**
   * Count images for a single product
   */
  static countProductImages(product) {
    let count = 0;
    if (product.featuredImage?.url) count++;
    if (product.images?.edges?.length > 0) {
      count += product.images.edges.length;
    }
    return count;
  }
  
  /**
   * Sync images to Laravel backend
   */
  static async syncImagesToBackend(shopDomain, images) {
    try {
      const baseUrl = process.env.BACKEND_URL;
      const fullUrl = `${baseUrl}v1/shopify/images/sync`;
      
      const requestBody = {
        shop_domain: shopDomain,
        images: images
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

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('Images sync error:', error);
      throw error;
    }
  }
}